// launch.ts — "Viral Launch-in-a-box": generate a coordinated, multi-channel launch campaign for a product,
// grounded in its research (real competitor weaknesses, customer language, use cases, audience). A public mutation
// kicks off a background OpenAI action that writes a core hook, copy-ready assets per channel (X thread, LinkedIn,
// Show HN, Reddit, Product Hunt, cold email, UGC video), a launch-day-through-week sequence, and a transparent
// reach->signups->customers->CAC projection tied to the product's CAC budgets. Assets can be pushed to Orange Slice.
import { v } from "convex/values";
import { mutation, query, internalAction, internalMutation, internalQuery, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { openAIChat, MODEL_BEST, STR, strict, arrayOf } from "./openai";
import { launchChannelValidator, launchStepValidator, launchProjectionValidator } from "./validators";

const NUM = { type: "number" };

type Campaign = {
  hook: string;
  channels: Array<{ channel: string; label: string; audience: string; content: string; tip: string }>;
  calendar: Array<{ when: string; channel: string; action: string }>;
  projection: {
    assumptions: string; reachLow: number; reachHigh: number; signups: number;
    customers: number; blendedCac: number; payback: string; notes: string;
  };
};

// ---------- Public: start + read ----------

// startLaunch: kick off (or reuse a recent) launch-campaign generation for a product. Args: productId. Called by
// the "Generate launch campaign" button. Inserts a running campaign and schedules the background action.
export const startLaunch = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args): Promise<Id<"launchCampaigns">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== identity.subject) throw new Error("Product not found");

    const latest = await ctx.db
      .query("launchCampaigns")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .first();
    // Reuse an in-flight generation only if it's genuinely recent (Convex actions cap at 600s).
    if (latest && latest.status === "running" && Date.now() - latest.createdAt < 11 * 60 * 1000) return latest._id;

    const campaignId = await ctx.db.insert("launchCampaigns", {
      productId: args.productId,
      userId: identity.subject,
      status: "running",
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.launch.runLaunch, {
      campaignId,
      productId: args.productId,
      userId: identity.subject,
    });
    return campaignId;
  },
});

// getLaunch: the most recent launch campaign for a product (for the /launch page). Args: productId. Returns null
// if none or not owned by the caller.
export const getLaunch = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const c = await ctx.db
      .query("launchCampaigns")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .first();
    if (!c || c.userId !== identity.subject) return null;
    return c;
  },
});

// ---------- Internal: context + progress ----------

// loadLaunchContext: the product + its latest report, if owned. Args: productId, userId. Used by runLaunch to
// ground the campaign in real research.
export const loadLaunchContext = internalQuery({
  args: { productId: v.id("products"), userId: v.string() },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== args.userId) return null;
    const report = await ctx.db
      .query("reports")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .first();
    return { product, report: report && report.userId === args.userId ? report : null };
  },
});

// patchLaunch: shallow-update a campaign (status/error/sections). Args: campaignId + fields. Used by runLaunch.
export const patchLaunch = internalMutation({
  args: {
    campaignId: v.id("launchCampaigns"),
    status: v.optional(v.union(v.literal("running"), v.literal("complete"), v.literal("error"))),
    error: v.optional(v.string()),
    hook: v.optional(v.string()),
    channels: v.optional(v.array(launchChannelValidator)),
    calendar: v.optional(v.array(launchStepValidator)),
    projection: v.optional(launchProjectionValidator),
  },
  handler: async (ctx, args): Promise<void> => {
    const { campaignId, ...fields } = args;
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(fields)) if (val !== undefined) patch[k] = val;
    await ctx.db.patch(campaignId, patch);
  },
});

// ---------- Internal: the generation action ----------

// runLaunch: generate the full launch campaign in one grounded OpenAI call and store it. Args: campaignId,
// productId, userId. Scheduled by startLaunch.
export const runLaunch = internalAction({
  args: { campaignId: v.id("launchCampaigns"), productId: v.id("products"), userId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    try {
      const data = await ctx.runQuery(internal.launch.loadLaunchContext, { productId: args.productId, userId: args.userId });
      if (!data) throw new Error("Product not found");
      const { product, report } = data;

      const research = report ? researchContext(report) : "(No research report yet — ground the campaign in the product description and ideal customer.)";
      const prompt = `You are a world-class growth engineer planning a COORDINATED VIRAL LAUNCH for this product. Design a multi-channel launch that is SPECIFIC to this product and audience — absolutely no generic "post on social media" filler. Ground every asset in the REAL research below (use the competitor weaknesses, the real customer language, the actual use cases, and where this audience really hangs out).

PRODUCT: ${product.companyName} (${product.website || "no site"})
What it does: ${product.productDescription}
Ideal customer: ${product.targetCustomer || "unspecified"}

RESEARCH (use this to make every asset specific and credible):
${research}

CAC BUDGETS (for the projection): up to $${product.individualBudget} to acquire one developer; up to $${product.businessBudget} to acquire one business.

Produce a JSON object with:
1. "hook": the ONE core viral angle/narrative for the launch — a sharp, contrarian or curiosity-driven positioning that will actually spread (1-3 sentences).
2. "channels": one copy-READY asset for EACH of these channels (use the exact "channel" id), tuned to that channel's culture and to where THIS audience actually is:
   - x_thread (label "X / Twitter launch thread"): a full 5-8 tweet thread, hook tweet first, punchy and specific, ending in a CTA.
   - linkedin (label "LinkedIn founder post"): a story-driven founder post with a CTA.
   - show_hn (label "Show HN"): give the exact "Show HN:" title line AND the body/first comment — HN hates marketing, so be technical, humble, specific.
   - reddit (label "Reddit post"): name the MOST relevant specific subreddit(s) in "audience" and write a value-first post to that sub's culture (not salesy).
   - product_hunt (label "Product Hunt"): the tagline, the description, and the maker's first comment.
   - cold_email (label "Cold email"): a short sharp email (Subject: line + body) to a high-intent segment from the research, referencing a real pain.
   - ugc_video (label "UGC / short-form video"): a 30-second TikTok/Reels/X script concept (hook, 3-4 beats, CTA).
   For each: "channel" (the id), "label", "audience" (the exact communities/people), "content" (the actual copy-paste asset), "tip" (one concrete posting tactic — timing, who to tag, how to seed engagement).
3. "calendar": a coordinated 8-12 step launch sequence from launch day through ~day 7, each {when, channel, action}, sequenced for compounding virality (seed -> main launch -> amplify -> follow-up).
4. "projection": a REALISTIC, TRANSPARENT model. In "assumptions" state your per-channel reach and conversion rates openly. Give "reachLow"/"reachHigh" (total launch impressions), "signups" (trials/signups), "customers" (paying), "blendedCac" (estimated $ to acquire one paying customer via this organic launch), "payback" (short note), "notes" (caveats). Numbers must be GROUNDED and defensible to a skeptical growth investor — do NOT inflate. Compare blendedCac to the CAC budgets above.

Every asset must be something the founder could literally copy-paste and post today.`;

      const c = await openAIChat<Campaign>(
        prompt,
        strict({
          hook: STR,
          channels: arrayOf(strict({ channel: STR, label: STR, audience: STR, content: STR, tip: STR })),
          calendar: arrayOf(strict({ when: STR, channel: STR, action: STR })),
          projection: strict({
            assumptions: STR, reachLow: NUM, reachHigh: NUM, signups: NUM, customers: NUM, blendedCac: NUM, payback: STR, notes: STR,
          }),
        }),
        MODEL_BEST,
      );

      await ctx.runMutation(internal.launch.patchLaunch, {
        campaignId: args.campaignId,
        status: "complete",
        hook: c.hook,
        channels: c.channels,
        calendar: c.calendar,
        projection: c.projection,
      });
    } catch (e) {
      await ctx.runMutation(internal.launch.patchLaunch, {
        campaignId: args.campaignId,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
});

// researchContext: compress a report's grounded sections into a compact prompt block. Params: report doc.
function researchContext(report: {
  useCases?: Array<{ title: string; whoBuildsIt: string }>;
  competitors?: Array<{ name: string; publicFeedback: string }>;
  productFeedback?: { currentCustomers: string; publicSentiment: string };
  businesses?: Array<{ name: string; segment: string }>;
  events?: Array<{ name: string; date: string }>;
}): string {
  const lines: string[] = [];
  if (report.useCases?.length) {
    lines.push(`Use cases / who builds: ${report.useCases.map((u) => `${u.title} (${u.whoBuildsIt})`).join("; ")}`);
  }
  if (report.competitors?.length) {
    lines.push(`Competitors & their public weaknesses: ${report.competitors.map((c) => `${c.name} — ${c.publicFeedback}`).join(" | ")}`);
  }
  if (report.productFeedback) {
    lines.push(`Current customers: ${report.productFeedback.currentCustomers}`);
    lines.push(`Public sentiment (real customer language): ${report.productFeedback.publicSentiment}`);
  }
  if (report.businesses?.length) {
    lines.push(`B2B target segments: ${report.businesses.map((b) => `${b.name} (${b.segment})`).join("; ")}`);
  }
  if (report.events?.length) {
    lines.push(`Upcoming events to ride: ${report.events.map((e) => `${e.name} (${e.date})`).join("; ")}`);
  }
  return lines.join("\n");
}

// ---------- Push one asset to Orange Slice ----------

// pushAsset: (optional) POST one launch asset into the user's Orange Slice sheet via its inbound webhook. Args:
// campaignId, channelIndex. Button-only; never automatic. Requires ORANGE_SLICE_WEBHOOK_URL on the deployment.
export const pushAsset = action({
  args: { campaignId: v.id("launchCampaigns"), channelIndex: v.number() },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const data = await ctx.runQuery(internal.launch.getAssetContext, {
      campaignId: args.campaignId, channelIndex: args.channelIndex, userId: identity.subject,
    });
    if (!data) throw new Error("Asset not found");
    const url = process.env.ORANGE_SLICE_WEBHOOK_URL;
    if (!url) {
      throw new Error("Orange Slice is not configured. Set: npx convex env set ORANGE_SLICE_WEBHOOK_URL https://...");
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-source": "devgraph" },
      body: JSON.stringify({
        type: "launch_asset",
        product: data.productName,
        channel: data.asset.label,
        audience: data.asset.audience,
        content: data.asset.content,
        tip: data.asset.tip,
      }),
    });
    // Status only — never surface the upstream body (it could echo the webhook URL).
    if (!res.ok) throw new Error(`Orange Slice push failed (${res.status})`);
  },
});

// getAssetContext: one campaign asset + the product name, owner-checked. Args: campaignId, channelIndex, userId.
// Used by pushAsset.
export const getAssetContext = internalQuery({
  args: { campaignId: v.id("launchCampaigns"), channelIndex: v.number(), userId: v.string() },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.campaignId);
    if (!c || c.userId !== args.userId) return null;
    const asset = c.channels?.[args.channelIndex];
    if (!asset) return null;
    const product = await ctx.db.get(c.productId);
    return { asset, productName: product?.companyName ?? "Product" };
  },
});
