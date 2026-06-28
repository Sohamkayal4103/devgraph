// improve.ts — Product-improvement phase. "Improve" generates the immediate next features to build, grounded in
// real customer feedback + competitor feedback + the product's current features (from the discovery report). The
// result is a shareable report; "Share with product & engineering" forwards it to a dedicated Orange Slice sheet
// (where the user wires Slack/email automation).
import { v } from "convex/values";
import { action, mutation, query, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { featureValidator } from "./validators";
import { openAIChat, strict, arrayOf, STR, MODEL_BEST } from "./openai";

type Feature = { title: string; priority: string; description: string; rationale: string; impact: string };

// generateFeatures: kick off next-feature generation. Args: productId. Called by the "Improve" button. Inserts a
// running feature report and schedules the background action.
export const generateFeatures = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args): Promise<Id<"featureReports">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== identity.subject) throw new Error("Product not found");
    const id = await ctx.db.insert("featureReports", {
      productId: args.productId,
      userId: identity.subject,
      status: "running",
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.improve.runGenerateFeatures, {
      featureReportId: id,
      productId: args.productId,
    });
    return id;
  },
});

// getImproveContext: (internal) product + latest discovery report, for grounding feature generation. Args: productId.
export const getImproveContext = internalQuery({
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

// runGenerateFeatures: (internal action) build grounded context, ask the model for prioritized next features,
// store them. Args: featureReportId, productId. Scheduled by generateFeatures.
export const runGenerateFeatures = internalAction({
  args: { featureReportId: v.id("featureReports"), productId: v.id("products") },
  handler: async (ctx, args): Promise<void> => {
    try {
      const { product, report } = await ctx.runQuery(internal.improve.getImproveContext, { productId: args.productId });
      if (!product) return;
      const ourFeedback = report?.productFeedback
        ? `${report.productFeedback.currentCustomers}\nSentiment: ${report.productFeedback.publicSentiment}`
        : "n/a";
      const compFeedback =
        (report?.competitors ?? []).map((c) => `- ${c.name}: ${c.publicFeedback}`).join("\n") || "n/a";
      const currentFeatures =
        (report?.useCases ?? []).map((u) => `- ${u.title}`).join("\n") || product.productDescription;

      const prompt = `Recommend the IMMEDIATE next features the engineering team should build for this developer tool. Ground each in a specific feedback signal, and prioritize by impact on retention, sales/expansion, and closing competitive gaps.
PRODUCT: ${product.companyName} — ${product.productDescription}
CURRENT FEATURES / USE CASES:
${currentFeatures}
OUR CUSTOMERS' FEEDBACK:
${ourFeedback}
COMPETITORS' CUSTOMER FEEDBACK (gaps to exploit):
${compFeedback}
Output: a 1-2 sentence summary for PM/engineering, plus 4-6 features. Each feature: title; priority (P0/P1/P2); a concrete description; the rationale (which feedback signal it addresses); and the impact (how it drives retention / sales / a competitive win).`;

      const result = await openAIChat<{ summary: string; features: Feature[] }>(
        prompt,
        strict({
          summary: STR,
          features: arrayOf(
            strict({ title: STR, priority: STR, description: STR, rationale: STR, impact: STR }),
          ),
        }),
        MODEL_BEST,
      );

      await ctx.runMutation(internal.improve.completeFeatureReport, {
        featureReportId: args.featureReportId,
        summary: result.summary,
        features: result.features,
      });
    } catch (e) {
      await ctx.runMutation(internal.improve.failFeatureReport, {
        featureReportId: args.featureReportId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
});

// completeFeatureReport: (internal) store the generated features. Args: featureReportId, summary, features.
export const completeFeatureReport = internalMutation({
  args: { featureReportId: v.id("featureReports"), summary: v.string(), features: v.array(featureValidator) },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.featureReportId, { status: "complete", summary: args.summary, features: args.features });
  },
});

// failFeatureReport: (internal) mark a feature report errored. Args: featureReportId, error.
export const failFeatureReport = internalMutation({
  args: { featureReportId: v.id("featureReports"), error: v.string() },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.featureReportId, { status: "error", error: args.error });
  },
});

// getFeatureReport: the latest feature report for a product. Args: productId. Called via useQuery.
export const getFeatureReport = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== identity.subject) return null;
    return await ctx.db
      .query("featureReports")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .first();
  },
});

// getFeatureReportInternal: (internal) a feature report + product name, for sharing. Args: featureReportId.
export const getFeatureReportInternal = internalQuery({
  args: { featureReportId: v.id("featureReports") },
  handler: async (ctx, args): Promise<{ report: Doc<"featureReports">; productName: string } | null> => {
    const report = await ctx.db.get(args.featureReportId);
    if (!report) return null;
    const product = await ctx.db.get(report.productId);
    return { report, productName: product?.companyName ?? "" };
  },
});

// shareWithEngineering: forward a feature report to the engineering Orange Slice sheet (Slack/email automation
// lives there). Args: featureReportId. Button-only; never automatic. Requires ORANGE_SLICE_ENG_WEBHOOK_URL.
export const shareWithEngineering = action({
  args: { featureReportId: v.id("featureReports") },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const data = await ctx.runQuery(internal.improve.getFeatureReportInternal, { featureReportId: args.featureReportId });
    if (!data || data.report.userId !== identity.subject) throw new Error("Feature report not found");
    const url = process.env.ORANGE_SLICE_ENG_WEBHOOK_URL;
    if (!url) {
      throw new Error(
        "Engineering Orange Slice sheet is not configured. Set its webhook: npx convex env set ORANGE_SLICE_ENG_WEBHOOK_URL https://...",
      );
    }
    const { report, productName } = data;
    const features = report.features ?? [];
    const feedbackText =
      `Next features for ${productName}\n\n${report.summary ?? ""}\n\n` +
      features
        .map(
          (f, i) =>
            `${i + 1}. [${f.priority}] ${f.title}\n   ${f.description}\n   Why: ${f.rationale}\n   Impact (growth/retention): ${f.impact}`,
        )
        .join("\n\n");
    const payload = {
      type: "feature_suggestions",
      product: productName,
      summary: report.summary ?? "",
      feedback: feedbackText, // ready-to-forward block for the Slack/email automation
      features_json: JSON.stringify(features),
      source: "devgraph",
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-source": "devgraph" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Share failed (${res.status}): ${await res.text()}`);
  },
});
