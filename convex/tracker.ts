// tracker.ts — Retention & expansion signals via Fiber Tracker (https://api.fiber.ai). For a product, we create a
// Fiber company-list watching high-value rules (funding, tech-added, hiring, headcount, news, layoffs), then POLL
// signals in on demand (button-only — no automatic firing). A free "fire test signal" path uses Fiber's fire-dummy
// so the live feed always has a real-shaped, clearly-badged TEST signal without waiting for a real-world event.
// Setup/add/poll/fire-dummy are all FREE on Fiber; only real per-entity monitoring consumes credits.
import { v } from "convex/values";
import { action, query, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { signalValidator } from "./validators";

const FIBER_BASE = "https://api.fiber.ai";

// The company-side rules we watch — chosen for retention (churn risk) + expansion (upsell) intelligence.
const WATCH_RULES = [
  "new_funding_round", // budget unlocked → expansion
  "technology_added", // adopting/attaching tech → expansion (or competitor displacement risk)
  "headcount_crossed_threshold", // growing → expansion
  "recently_hired_with_title", // building a team → expansion
  "company_news", // awareness → neutral
  "recent_layoffs", // contraction → churn risk
];

// Signal categorization for the feed (expansion = upsell window, risk = churn watch).
const EXPANSION = new Set([
  "new_funding_round", "funding_stage_changed", "new_investor", "acquired_company",
  "headcount_crossed_threshold", "headcount_growth_percent", "employee_count_milestone",
  "department_size_threshold", "technology_added", "recently_hired_with_title",
  "job_posting_with_keyword", "job_posting_in_function", "person_is_hiring",
  "new_office_location", "follower_count_growth",
]);
const RISK = new Set(["recent_layoffs", "company_went_inactive", "company_status_changed"]);

const READABLE: Record<string, string> = {
  new_funding_round: "New funding round",
  funding_stage_changed: "Funding stage changed",
  new_investor: "New investor",
  acquired_company: "Made an acquisition",
  technology_added: "Technology added",
  headcount_crossed_threshold: "Headcount milestone",
  headcount_growth_percent: "Headcount growth",
  recently_hired_with_title: "Key hire",
  job_posting_with_keyword: "Relevant job posting",
  company_news: "Company news",
  recent_layoffs: "Layoffs",
  person_is_hiring: "Contact is hiring",
};

// ---------- Fiber response shapes (only the fields we read) ----------

type FiberRule = { name: string; readableName?: string; config?: { example?: Record<string, unknown> } };
type FiberSignal = {
  id?: string;
  type?: string;
  ruleType?: string;
  summary?: string | null;
  observedAt?: string;
  isDummy?: boolean;
  entityId?: string;
  linkedinIdentifier?: string;
  changeData?: Array<Record<string, unknown>>;
};
type Signal = {
  fiberSignalId: string; signalType: string; readableType: string;
  category: "expansion" | "risk" | "neutral"; entityName: string;
  summary: string; observedAt: string; isDummy: boolean;
};

// ---------- Fiber HTTP helpers (apiKey in body for POST/PUT, query for GET; fire-dummy is POST w/ apiKey in query) ----------

// requireFiberKey: the deployment's Fiber key, or a clear setup error. Used by every Fiber call.
function requireFiberKey(): string {
  const k = process.env.FIBER_API_KEY;
  if (!k) throw new Error("FIBER_API_KEY is not set on the Convex deployment. Run: npx convex env set FIBER_API_KEY ...");
  return k;
}

// fiberGet: GET a Fiber endpoint with apiKey + params in the query string. Params: path, extra query params.
async function fiberGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const qs = new URLSearchParams({ apiKey: requireFiberKey(), ...params }).toString();
  const res = await fetch(`${FIBER_BASE}${path}?${qs}`);
  // Never surface the upstream response body to the client — it can echo the apiKey. Status only.
  if (!res.ok) throw new Error(`Fiber GET ${path} failed (${res.status})`);
  return res.json();
}

// fiberSend: POST/PUT a Fiber endpoint with apiKey + body merged into the JSON body. Params: method, path, body.
async function fiberSend(method: "POST" | "PUT", path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${FIBER_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: requireFiberKey(), ...body }),
  });
  if (!res.ok) throw new Error(`Fiber ${method} ${path} failed (${res.status})`);
  return res.json();
}

// fiberFireDummy: POST fire-dummy — fires Fiber test (dummy) signals and returns them. Validated contract: apiKey
// in BOTH the query and the JSON body, plus a Content-Type header. Params: listId. Used by fireTestSignal.
async function fiberFireDummy(listId: string): Promise<unknown> {
  const key = requireFiberKey();
  const res = await fetch(`${FIBER_BASE}/v1/tracker/fire-dummy/${listId}?apiKey=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: key }),
  });
  if (!res.ok) throw new Error(`Fiber fire-dummy failed (${res.status})`);
  return res.json();
}

// humanize: a readable label for a raw rule type. Params: type. Used by mapSignal.
function humanize(type: string): string {
  return READABLE[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// categorize: expansion (upsell) / risk (churn) / neutral for a rule type. Params: type. Used by mapSignal.
function categorize(type: string): "expansion" | "risk" | "neutral" {
  if (RISK.has(type)) return "risk";
  if (EXPANSION.has(type)) return "expansion";
  return "neutral";
}

// mapSignal: normalize a raw Fiber signal into our stored shape. Params: s = a Fiber signal. Used by the poll paths.
function mapSignal(s: FiberSignal): Signal {
  const type = s.type ?? s.ruleType ?? "signal";
  const cd = (s.changeData?.[0] ?? {}) as Record<string, unknown>;
  const named =
    (typeof cd.companyName === "string" && cd.companyName) ||
    (typeof cd.name === "string" && cd.name) ||
    "";
  return {
    // Fiber sends a stable `id`; the composite fallback (only if `id` is ever absent) includes the summary so
    // distinct same-type signals can't collide and be deduped away.
    fiberSignalId: s.id ?? `${type}|${s.observedAt ?? ""}|${named}|${(s.summary ?? "").slice(0, 60)}`,
    signalType: type,
    readableType: humanize(type),
    category: categorize(type),
    entityName: String(named),
    summary: s.summary ?? `${humanize(type)} detected`,
    observedAt: s.observedAt ?? "",
    isDummy: s.isDummy ?? false,
  };
}

// domainFrom: extract a bare hostname from a website URL (for adding companies by domain). Params: website.
function domainFrom(website: string): string | null {
  if (!website) return null;
  try {
    const u = new URL(website.startsWith("http") ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ---------- Internal data access (actions read product/report via these, with ownership checks) ----------

// loadProduct: the product if owned by userId, else null. Args: productId, userId. Used by the actions.
export const loadProduct = internalQuery({
  args: { productId: v.id("products"), userId: v.string() },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.productId);
    if (!p || p.userId !== args.userId) return null;
    return p;
  },
});

// loadLatestReport: the product's most recent report if owned, else null. Args: productId, userId. Used by addTargetCompanies.
export const loadLatestReport = internalQuery({
  args: { productId: v.id("products"), userId: v.string() },
  handler: async (ctx, args) => {
    const r = await ctx.db
      .query("reports")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .first();
    if (!r || r.userId !== args.userId) return null;
    return r;
  },
});

// setTrackerListId: persist the Fiber list id onto the product, compare-and-set so concurrent setups don't clobber
// each other. Args: productId, listId. Returns the EFFECTIVE list id (the first one that won). Used by setupTracking.
export const setTrackerListId = internalMutation({
  args: { productId: v.id("products"), listId: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const p = await ctx.db.get(args.productId);
    if (p?.trackerListId) return p.trackerListId; // already claimed — keep the first list (idempotent)
    await ctx.db.patch(args.productId, { trackerListId: args.listId });
    return args.listId;
  },
});

// upsertSignals: insert new signals (deduped by fiberSignalId), returning how many were added. Args: productId,
// userId, signals. Used by the poll/fire paths.
export const upsertSignals = internalMutation({
  args: { productId: v.id("products"), userId: v.string(), signals: v.array(signalValidator) },
  handler: async (ctx, args): Promise<number> => {
    // Defense-in-depth: enforce the ownership invariant here too, regardless of caller.
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== args.userId) return 0;
    const existing = await ctx.db
      .query("signals")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    const seen = new Set(existing.map((s) => s.fiberSignalId));
    let added = 0;
    for (const s of args.signals) {
      if (seen.has(s.fiberSignalId)) continue;
      seen.add(s.fiberSignalId);
      await ctx.db.insert("signals", {
        ...s,
        productId: args.productId,
        userId: args.userId,
        createdAt: Date.now(),
      });
      added++;
    }
    return added;
  },
});

// ---------- Public actions (button-only triggers) ----------

// setupTracking: create the product's Fiber Tracker company-list with the retention/expansion watch rules. Args:
// productId. Called by the "Set up tracking" button. Idempotent. FREE on Fiber. Returns the list id.
export const setupTracking = action({
  args: { productId: v.id("products") },
  handler: async (ctx, args): Promise<{ listId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const product = await ctx.runQuery(internal.tracker.loadProduct, { productId: args.productId, userId: identity.subject });
    if (!product) throw new Error("Product not found");
    if (product.trackerListId) return { listId: product.trackerListId };

    // Build watch rules from Fiber's live catalog, reusing each rule's own example config so we never guess the
    // (undocumented) per-rule sub-fields. Each rule is added TWICE: a real one (isDummy:false) that monitors the
    // companies you add, and a dummy one (isDummy:true) that powers the free, instant "Fire test signal" demo.
    const cat = (await fiberGet("/v1/tracker/rules")) as { output?: { companyRules?: FiberRule[] } };
    const byName = new Map((cat.output?.companyRules ?? []).map((r) => [r.name, r] as const));
    const present = WATCH_RULES.map((name) => byName.get(name)).filter((r): r is FiberRule => Boolean(r));
    const ruleFrom = (r: FiberRule, isDummy: boolean): Record<string, unknown> => ({
      ...(r.config?.example ?? {}),
      type: r.name,
      entityType: "company",
      isDummy,
    });
    const trackingRules: Array<Record<string, unknown>> = [
      ...present.map((r) => ruleFrom(r, false)),
      ...present.map((r) => ruleFrom(r, true)),
    ];
    if (trackingRules.length === 0) {
      trackingRules.push(
        { type: "headcount_crossed_threshold", entityType: "company", direction: "above", threshold: 100, isDummy: false },
        { type: "headcount_crossed_threshold", entityType: "company", direction: "above", threshold: 100, isDummy: true },
      );
    }

    const created = (await fiberSend("POST", "/v1/tracker/company-lists", {
      name: `DevGraph · ${product.companyName}`.slice(0, 200),
      refreshIntervalDays: 7,
      trackingRules: trackingRules.slice(0, 25),
    })) as { output?: { id?: string } };
    const listId = created.output?.id;
    if (!listId) throw new Error("Fiber did not return a tracker list id");
    const effectiveId = await ctx.runMutation(internal.tracker.setTrackerListId, { productId: args.productId, listId });
    return { listId: effectiveId };
  },
});

// addTargetCompanies: add the discovered B2B target companies (by website domain) to the Fiber list so REAL signals
// can flow. Args: productId. Called by the "Add my company targets" button. NOTE: real monitoring consumes Fiber
// credits per company per refresh cycle. Returns counts.
export const addTargetCompanies = action({
  args: { productId: v.id("products") },
  handler: async (ctx, args): Promise<{ added: number; skipped: number; attempted: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const product = await ctx.runQuery(internal.tracker.loadProduct, { productId: args.productId, userId: identity.subject });
    if (!product?.trackerListId) throw new Error("Set up tracking first");

    const report = await ctx.runQuery(internal.tracker.loadLatestReport, { productId: args.productId, userId: identity.subject });
    const domains = Array.from(
      new Set((report?.businesses ?? []).map((b) => domainFrom(b.website)).filter((d): d is string => Boolean(d))),
    );
    if (domains.length === 0) throw new Error("No B2B company targets with a website were found. Run research first.");

    const res = (await fiberSend("PUT", `/v1/tracker/company-lists/${product.trackerListId}/companies`, {
      companies: domains.map((domain) => ({ domain })),
    })) as { output?: { added?: number; skipped?: number } };
    return { added: res.output?.added ?? 0, skipped: res.output?.skipped ?? 0, attempted: domains.length };
  },
});

// fireTestSignal: fire Fiber test (dummy) signals into the list and poll them into the feed. Args: productId.
// Called by the "Fire test signal" button — the free, reliable live-demo moment. Signals are badged TEST.
export const fireTestSignal = action({
  args: { productId: v.id("products") },
  handler: async (ctx, args): Promise<{ added: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const product = await ctx.runQuery(internal.tracker.loadProduct, { productId: args.productId, userId: identity.subject });
    if (!product?.trackerListId) throw new Error("Set up tracking first");

    const fired = (await fiberFireDummy(product.trackerListId)) as { output?: { signals?: FiberSignal[] } };
    const signals = (fired.output?.signals ?? []).map(mapSignal);
    const added = await ctx.runMutation(internal.tracker.upsertSignals, {
      productId: args.productId, userId: identity.subject, signals,
    });
    return { added };
  },
});

// refreshSignals: poll all (real + test) signals for the list into the feed. Args: productId. Called by the
// "Refresh signals" button. Deduped by id. Returns how many new signals were added.
export const refreshSignals = action({
  args: { productId: v.id("products") },
  handler: async (ctx, args): Promise<{ added: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const product = await ctx.runQuery(internal.tracker.loadProduct, { productId: args.productId, userId: identity.subject });
    if (!product?.trackerListId) throw new Error("Set up tracking first");

    const data = (await fiberGet(`/v1/tracker/signals/${product.trackerListId}`, { filter: "all", pageSize: "100" })) as {
      output?: { signals?: FiberSignal[] };
    };
    const signals = (data.output?.signals ?? []).map(mapSignal);
    const added = await ctx.runMutation(internal.tracker.upsertSignals, {
      productId: args.productId, userId: identity.subject, signals,
    });
    return { added };
  },
});

// ---------- Public queries (reactive UI) ----------

// getTrackerState: whether tracking is set up for a product (+ its name), for the owner. Args: productId. Used by
// the signals page. Returns null if not owned.
export const getTrackerState = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const p = await ctx.db.get(args.productId);
    if (!p || p.userId !== identity.subject) return null;
    return { trackerListId: p.trackerListId ?? null, companyName: p.companyName };
  },
});

// listSignals: the product's signal feed, newest first, for the owner. Args: productId. Used by the signals page.
export const listSignals = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const p = await ctx.db.get(args.productId);
    if (!p || p.userId !== identity.subject) return [];
    return await ctx.db
      .query("signals")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .collect();
  },
});
