// outreach.ts — The outreach phase. Generates deal/offers (grounded in the discovery report + optional sales
// notes + the product's acquisition budgets), lets the user select them, then generates + revises outreach
// messages carrying the selected offers. Sending is copy-paste (in the UI) or an optional Orange Slice webhook.
import { v } from "convex/values";
import {
  action,
  mutation,
  query,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { offerValidator } from "./validators";
import { openAIChat, strict, arrayOf, STR, MODEL_BEST, MODEL_FAST } from "./openai";

const channelValidator = v.union(v.literal("linkedin"), v.literal("x"), v.literal("email"));

// ---------- Sales notes + product read ----------

// setSalesNotes: save the optional pasted/uploaded sales report onto the product. Args: productId, notes.
// Called by the outreach page's "Save sales data" button.
export const setSalesNotes = mutation({
  args: { productId: v.id("products"), notes: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== identity.subject) throw new Error("Product not found");
    await ctx.db.patch(args.productId, { salesNotes: args.notes });
  },
});

// getProduct: one product by id (for the outreach page header, sales notes, and the generating flag). Args:
// productId. Called by the outreach page via useQuery.
export const getProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== identity.subject) return null;
    return product;
  },
});

// ---------- Offer generation ----------

// generateOffers: kick off offer generation for a product. Args: productId. Called by the "Generate offers"
// button. Flags the product as generating and schedules the background action.
export const generateOffers = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== identity.subject) throw new Error("Product not found");
    await ctx.db.patch(args.productId, { offersGenerating: true });
    await ctx.scheduler.runAfter(0, internal.outreach.runGenerateOffers, { productId: args.productId });
  },
});

// getOutreachContext: (internal) the product + its latest discovery report, for grounding offer generation.
// Args: productId. Called by runGenerateOffers.
export const getOutreachContext = internalQuery({
  args: { productId: v.id("products") },
  handler: async (ctx, args): Promise<{ product: Doc<"products"> | null; report: Doc<"reports"> | null }> => {
    const product = await ctx.db.get(args.productId);
    const report = await ctx.db
      .query("reports")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .first();
    return { product, report };
  },
});

// runGenerateOffers: (internal action) build grounded context and ask the model for offers, then store them.
// Args: productId. Scheduled by generateOffers.
export const runGenerateOffers = internalAction({
  args: { productId: v.id("products") },
  handler: async (ctx, args): Promise<void> => {
    const { product, report } = await ctx.runQuery(internal.outreach.getOutreachContext, {
      productId: args.productId,
    });
    if (!product) return;
    try {
      const competitors = (report?.competitors ?? [])
        .map((c) => `- ${c.name}: ${c.publicFeedback}`)
        .join("\n") || "n/a";
      const ourFeedback = report?.productFeedback
        ? `Customers: ${report.productFeedback.currentCustomers}\nSentiment: ${report.productFeedback.publicSentiment}`
        : "n/a";
      const builderNames = (report?.builders ?? []).slice(0, 5).map((b) => b.name).filter(Boolean);

      const prompt = `Generate concrete, realistic outreach OFFERS (deals/incentives) for a developer tool.
Ground every offer in the data below — current-customer usage (sales notes), competitor positioning + public feedback, and our product's own customer feedback. Keep offers within the stated acquisition budgets.

Rules:
- For CURRENT CUSTOMERS (targetType "current_customer", targetName "Current customers"): 2-3 retention/expansion offers tied to the sales notes (or sensible defaults if none).
- For EACH builder listed below (targetType "builder", targetName = that builder's exact name): exactly 1 acquisition offer that would get them to integrate the product.
- Each offer: a short title; concrete details (credits/discount/terms/milestones/timeframe); and a one-line rationale grounded in the data. Be specific — no vague "let's chat".

PRODUCT: ${product.companyName} — ${product.productDescription}
ACQUISITION BUDGET: ~$${product.individualBudget} per developer, ~$${product.businessBudget} per business (keep offers within these).
SALES NOTES (current customers): ${product.salesNotes || "none provided"}
COMPETITORS + PUBLIC FEEDBACK:\n${competitors}
OUR PRODUCT'S CUSTOMER FEEDBACK:\n${ourFeedback}
BUILDERS TO MAKE OFFERS FOR: ${builderNames.length ? builderNames.join(", ") : "none"}`;

      const result = await openAIChat<{ offers: OfferGen[] }>(
        prompt,
        strict({
          offers: arrayOf(
            strict({
              targetType: { type: "string", enum: ["current_customer", "builder"] },
              targetName: STR,
              title: STR,
              details: STR,
              rationale: STR,
            }),
          ),
        }),
        MODEL_BEST,
      );

      await ctx.runMutation(internal.outreach.replaceOffers, {
        productId: args.productId,
        userId: product.userId,
        offers: result.offers,
      });
    } catch {
      // On failure just clear the generating flag so the UI recovers; the user can retry.
      await ctx.runMutation(internal.outreach.setOffersGenerating, { productId: args.productId, generating: false });
    }
  },
});

// Shape the offer generator returns (mirrors offerValidator).
type OfferGen = {
  targetType: "current_customer" | "builder";
  targetName: string;
  title: string;
  details: string;
  rationale: string;
};

// replaceOffers: (internal) delete the product's existing offers, insert the new ones, clear the flag. Args:
// productId, userId, offers. Called by runGenerateOffers.
export const replaceOffers = internalMutation({
  args: { productId: v.id("products"), userId: v.string(), offers: v.array(offerValidator) },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("offers")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .take(200);
    for (const row of existing) await ctx.db.delete(row._id);
    for (const offer of args.offers) {
      await ctx.db.insert("offers", { ...offer, productId: args.productId, userId: args.userId, selected: false });
    }
    await ctx.db.patch(args.productId, { offersGenerating: false });
  },
});

// setOffersGenerating: (internal) flip the product's generating flag. Args: productId, generating.
export const setOffersGenerating = internalMutation({
  args: { productId: v.id("products"), generating: v.boolean() },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.productId, { offersGenerating: args.generating });
  },
});

// listOffers: the product's offers (for the outreach page). Args: productId. Called via useQuery.
export const listOffers = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== identity.subject) return [];
    return await ctx.db
      .query("offers")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
  },
});

// toggleOffer: check/uncheck an offer. Args: offerId, selected. Called by the offer checkbox.
export const toggleOffer = mutation({
  args: { offerId: v.id("offers"), selected: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const offer = await ctx.db.get(args.offerId);
    if (!offer || offer.userId !== identity.subject) throw new Error("Offer not found");
    await ctx.db.patch(args.offerId, { selected: args.selected });
  },
});

// ---------- Message generation + revision ----------

// getOfferForMessage: (internal) an offer + its product, for message generation. Args: offerId.
export const getOfferForMessage = internalQuery({
  args: { offerId: v.id("offers") },
  handler: async (ctx, args): Promise<{ offer: Doc<"offers">; product: Doc<"products"> } | null> => {
    const offer = await ctx.db.get(args.offerId);
    if (!offer) return null;
    const product = await ctx.db.get(offer.productId);
    if (!product) return null;
    return { offer, product };
  },
});

// generateMessage: write a first-draft outreach message for an offer on a channel. Args: offerId, channel.
// Called by the campaign UI via useAction; returns the new message id.
export const generateMessage = action({
  args: { offerId: v.id("offers"), channel: channelValidator },
  handler: async (ctx, args): Promise<Id<"outreachMessages">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const data = await ctx.runQuery(internal.outreach.getOfferForMessage, { offerId: args.offerId });
    if (!data || data.offer.userId !== identity.subject) throw new Error("Offer not found");
    const { offer, product } = data;

    const channelHint =
      args.channel === "email"
        ? "a short cold email (with a one-line subject inline as 'Subject: ...')"
        : args.channel === "linkedin"
          ? "a concise LinkedIn DM"
          : "a concise X/Twitter DM";
    const prompt = `Write ${channelHint} from ${product.companyName} to ${offer.targetName}.
Goal: get them to try/integrate the product, leading with this offer. Be specific and to the point; include the concrete offer details; don't miss key terms; no fluff or "let's hop on a call".
PRODUCT: ${product.companyName} — ${product.productDescription}
OFFER: ${offer.title} — ${offer.details}
WHY THEM: ${offer.rationale}`;

    const { content } = await openAIChat<{ content: string }>(prompt, strict({ content: STR }), MODEL_BEST);
    return await ctx.runMutation(internal.outreach.insertMessage, {
      productId: product._id,
      userId: identity.subject,
      offerId: args.offerId,
      targetName: offer.targetName,
      channel: args.channel,
      content,
    });
  },
});

// insertMessage: (internal) store a generated message. Args = the message fields.
export const insertMessage = internalMutation({
  args: {
    productId: v.id("products"),
    userId: v.string(),
    offerId: v.id("offers"),
    targetName: v.string(),
    channel: channelValidator,
    content: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"outreachMessages">> => {
    return await ctx.db.insert("outreachMessages", { ...args, createdAt: Date.now() });
  },
});

// getMessage: (internal) one message by id, for revision. Args: messageId.
export const getMessage = internalQuery({
  args: { messageId: v.id("outreachMessages") },
  handler: async (ctx, args): Promise<Doc<"outreachMessages"> | null> => {
    return await ctx.db.get(args.messageId);
  },
});

// reviseMessage: edit an existing message per a free-text instruction, preserving every offer already in it
// and not changing its meaning. Args: messageId, instruction. Uses the fast model. Called via useAction.
export const reviseMessage = action({
  args: { messageId: v.id("outreachMessages"), instruction: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const message = await ctx.runQuery(internal.outreach.getMessage, { messageId: args.messageId });
    if (!message || message.userId !== identity.subject) throw new Error("Message not found");

    const prompt = `Revise this outreach message per the instruction. Rules: keep every offer/incentive already present, do NOT change the core meaning, stay clear, specific, and to the point, and don't drop important details.
INSTRUCTION: ${args.instruction}

CURRENT MESSAGE:
${message.content}`;
    const { content } = await openAIChat<{ content: string }>(prompt, strict({ content: STR }), MODEL_FAST);
    await ctx.runMutation(internal.outreach.patchMessage, { messageId: args.messageId, content });
  },
});

// patchMessage: (internal) overwrite a message's content. Args: messageId, content.
export const patchMessage = internalMutation({
  args: { messageId: v.id("outreachMessages"), content: v.string() },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.messageId, { content: args.content });
  },
});

// listMessages: the product's generated messages. Args: productId. Called via useQuery.
export const listMessages = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== identity.subject) return [];
    return await ctx.db
      .query("outreachMessages")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .collect();
  },
});

// getPushContext: (internal) a message + its offer + the target's contact info (from the discovery report for
// builder targets) + the product name, for building a rich Orange Slice row. Args: messageId.
export const getPushContext = internalQuery({
  args: { messageId: v.id("outreachMessages") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    message: Doc<"outreachMessages">;
    offer: Doc<"offers"> | null;
    contact: { email: string; linkedinUrl: string; githubUrl: string } | null;
    productName: string;
  } | null> => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;
    const offer = await ctx.db.get(message.offerId);
    let contact: { email: string; linkedinUrl: string; githubUrl: string } | null = null;
    // For builder targets, pull their resolved contact info out of the latest discovery report.
    if (offer && offer.targetType === "builder") {
      const report = await ctx.db
        .query("reports")
        .withIndex("by_product", (q) => q.eq("productId", message.productId))
        .order("desc")
        .first();
      const b = report?.builders?.find((x) => x.name === offer.targetName);
      if (b) contact = { email: b.email, linkedinUrl: b.linkedinUrl, githubUrl: b.githubUrl };
    }
    const product = await ctx.db.get(message.productId);
    return { message, offer, contact, productName: product?.companyName ?? "" };
  },
});

// pushToOrangeSlice: (optional) POST one rich JSON row (target + contact + offer + message) into the user's
// Orange Slice sheet via its inbound webhook. Args: messageId. Button-only; never automatic. The Orange Slice
// webhook stores the whole payload as a row, so every field below becomes a column. Requires
// ORANGE_SLICE_WEBHOOK_URL on the deployment.
export const pushToOrangeSlice = action({
  args: { messageId: v.id("outreachMessages") },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const data = await ctx.runQuery(internal.outreach.getPushContext, { messageId: args.messageId });
    if (!data || data.message.userId !== identity.subject) throw new Error("Message not found");
    const url = process.env.ORANGE_SLICE_WEBHOOK_URL;
    if (!url) {
      throw new Error(
        "Orange Slice is not configured. Set your sheet's inbound webhook URL: npx convex env set ORANGE_SLICE_WEBHOOK_URL https://...",
      );
    }
    const { message, offer, contact, productName } = data;
    const payload = {
      name: message.targetName,
      channel: message.channel,
      message: message.content,
      offer_title: offer?.title ?? "",
      offer_details: offer?.details ?? "",
      target_type: offer?.targetType ?? "",
      email: contact?.email ?? "",
      linkedin_url: contact?.linkedinUrl ?? "",
      github_url: contact?.githubUrl ?? "",
      product: productName,
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-source": "devgraph" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Orange Slice push failed (${res.status}): ${await res.text()}`);
  },
});
