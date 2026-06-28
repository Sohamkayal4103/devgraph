// dashboard.ts — Read-only pipeline rollup for the dashboard. One reactive query that, for the signed-in user,
// walks each product's latest report + hackathon scan + offers + messages + feature report into a single set of
// per-product pipeline stats plus an account-wide funnel (discovered → offers → outreach → confirmed adopters).
import { query } from "./_generated/server";

// overview: the whole account's pipeline in one reactive read. No args. Returns null when signed out; otherwise
// { rows, agg, productCount } where rows are per-product stats and agg is the account funnel. Used by ProductList.
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;

    const products = await ctx.db
      .query("products")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const rows = await Promise.all(
      products.map(async (p) => {
        // Latest run of each downstream stage for this product (tables are append-only; take the newest).
        const reports = await ctx.db
          .query("reports")
          .withIndex("by_product", (q) => q.eq("productId", p._id))
          .collect();
        const report = reports.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;

        const scans = await ctx.db
          .query("hackathonScans")
          .withIndex("by_product", (q) => q.eq("productId", p._id))
          .collect();
        const scan = scans.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

        const offers = await ctx.db
          .query("offers")
          .withIndex("by_product", (q) => q.eq("productId", p._id))
          .collect();

        const messages = await ctx.db
          .query("outreachMessages")
          .withIndex("by_product", (q) => q.eq("productId", p._id))
          .collect();

        const featureReports = await ctx.db
          .query("featureReports")
          .withIndex("by_product", (q) => q.eq("productId", p._id))
          .collect();
        const featureReport = featureReports.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

        const teams = scan?.teams ?? [];
        return {
          productId: p._id,
          reportId: report?._id ?? null,
          discoveryStatus: report?.status ?? "none",
          builders: report?.builders?.length ?? 0,
          businesses: report?.businesses?.length ?? 0,
          universities: report?.universities?.length ?? 0,
          competitors: report?.competitors?.length ?? 0,
          events: report?.events?.length ?? 0,
          useCases: report?.useCases?.length ?? 0,
          scanStatus: scan?.status ?? "none",
          teamsScanned: teams.length,
          integrated: teams.filter((t) => t.integration === "integrated").length,
          competitorTeams: teams.filter((t) => t.integration === "competitor").length,
          offersTotal: offers.length,
          offersSelected: offers.filter((o) => o.selected).length,
          messages: messages.length,
          featureStatus: featureReport?.status ?? "none",
          featuresCount: featureReport?.features?.length ?? 0,
        };
      }),
    );

    // Account funnel: total prospects discovered → offers chosen → messages drafted → adopters confirmed.
    const agg = rows.reduce(
      (acc, r) => ({
        discovered: acc.discovered + r.builders + r.teamsScanned + r.businesses + r.universities,
        offers: acc.offers + r.offersSelected,
        messages: acc.messages + r.messages,
        integrated: acc.integrated + r.integrated,
      }),
      { discovered: 0, offers: 0, messages: 0, integrated: 0 },
    );

    return { rows, agg, productCount: products.length };
  },
});
