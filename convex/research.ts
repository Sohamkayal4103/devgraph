// research.ts — The discovery/research phase, grounded in REAL data (not model guesses). If the product supplies an
// AI-agent docs / llms.txt link, we read it FIRST so every stage is grounded in the product's real documented features:
//   • use cases ............ OpenAI (analytical; no external data needed)
//   • competitors + feedback  OpenAI web search (live, with source URLs)
//   • customers + sentiment   OpenAI web search (live, with source URLs)
//   • B2B company targets ... OpenAI web search (named companies + a real current buying signal, with sources)
//   • university targets .... OpenAI web search (departments/labs/clubs/hackathons to seed adoption, with sources)
//   • upcoming events ....... OpenAI web search (real SF/Bay Area events, dates + URLs, next ~month)
//   • promising builders .... GitHub search (real repos/owners) -> Fiber github-to-linkedin (real name/LinkedIn/email)
// A public mutation kicks off a background action that runs the stages, writing progress + each section into the
// product's report row so the dashboard updates live.
import { v } from "convex/values";
import { mutation, query, internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  useCaseValidator,
  competitorValidator,
  productFeedbackValidator,
  eventValidator,
  builderValidator,
  businessTargetValidator,
  universityTargetValidator,
} from "./validators";

// Model for grounded research. GPT-5 (reasoning model) — strongest quality; slower, especially with web
// search. Swap to "gpt-5-mini" for faster/cheaper runs, or "gpt-4o" to revert.
const MODEL = "gpt-5";

// Result row shapes (compile-time mirrors of the validators).
type UseCase = { title: string; description: string; whoBuildsIt: string };
type Competitor = { name: string; whatTheyDo: string; publicFeedback: string; sources: string[] };
type ProductFeedback = { currentCustomers: string; publicSentiment: string; sources: string[] };
type EventItem = { name: string; date: string; location: string; url: string; whyRelevant: string };
type Builder = {
  name: string; githubUrl: string; githubSignal: string;
  linkedinUrl: string; email: string; whyPromising: string; confidence: number;
};
type BusinessTarget = {
  name: string; segment: string; whatTheyDo: string; whyFit: string;
  buyingSignal: string; contactRole: string; website: string; sources: string[];
};
type UniversityTarget = {
  name: string; program: string; whyFit: string; contactPath: string;
  location: string; url: string; sources: string[];
};

// ---------- Public: start + read ----------

// startResearch: kick off (or resume) the research phase for a product. Args: productId. Called by the
// dashboard "Begin research" button. Inserts a running report and schedules the background action.
export const startResearch = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args): Promise<Id<"reports">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== identity.subject) {
      throw new Error("Product not found");
    }
    const latest = await ctx.db
      .query("reports")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .first();
    // Reuse an in-flight run only if it's genuinely still going. Convex actions hard-cap at 600s, so a "running"
    // report older than that was killed mid-flight — let a fresh run start instead of blocking on a dead one.
    if (latest && latest.status === "running" && Date.now() - latest.startedAt < 11 * 60 * 1000) return latest._id;

    const reportId = await ctx.db.insert("reports", {
      productId: args.productId,
      userId: identity.subject,
      status: "running",
      progress: 0,
      stage: "Starting research…",
      startedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.research.runResearch, {
      reportId,
      companyName: product.companyName,
      website: product.website,
      productDescription: product.productDescription,
      targetCustomer: product.targetCustomer,
      docsLink: product.docsLink,
    });
    return reportId;
  },
});

// getLatestReport: the most recent report for a product (drives the card's status + "View report"). Args:
// productId. Called by ProductCard via useQuery. Returns null if none, or not owned by the caller.
export const getLatestReport = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const report = await ctx.db
      .query("reports")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .first();
    if (!report || report.userId !== identity.subject) return null;
    return report;
  },
});

// getReport: one report by id (for the report page). Args: reportId. Called by the /report page via useQuery.
export const getReport = query({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const report = await ctx.db.get(args.reportId);
    if (!report || report.userId !== identity.subject) return null;
    return report;
  },
});

// ---------- Internal: progress writer ----------

// patchReport: shallow-update a report (progress/stage/sections/status). Args: reportId + any fields to set.
// Called only by runResearch to record progress as each stage completes.
export const patchReport = internalMutation({
  args: {
    reportId: v.id("reports"),
    progress: v.optional(v.number()),
    stage: v.optional(v.string()),
    status: v.optional(v.union(v.literal("running"), v.literal("complete"), v.literal("error"))),
    error: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    useCases: v.optional(v.array(useCaseValidator)),
    competitors: v.optional(v.array(competitorValidator)),
    productFeedback: v.optional(productFeedbackValidator),
    events: v.optional(v.array(eventValidator)),
    builders: v.optional(v.array(builderValidator)),
    businesses: v.optional(v.array(businessTargetValidator)),
    universities: v.optional(v.array(universityTargetValidator)),
  },
  handler: async (ctx, args): Promise<void> => {
    const { reportId, ...fields } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    await ctx.db.patch(reportId, patch);
  },
});

// ---------- Internal: the background research action ----------

// runResearch: runs the grounded research stages, recording progress + each section as it goes, and marks the
// report complete (or error). Args: reportId + product details. Scheduled by startResearch.
export const runResearch = internalAction({
  args: {
    reportId: v.id("reports"),
    companyName: v.string(),
    website: v.string(),
    productDescription: v.string(),
    targetCustomer: v.string(),
    docsLink: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    let blurb = `Product: ${args.companyName} (${args.website || "no site"})
What it does: ${args.productDescription}
Ideal customer: ${args.targetCustomer || "unspecified"}`;
    const today = new Date(Date.now()).toISOString().slice(0, 10);

    try {
      // Stage 0 — read the product's own AI-agent docs (optional) so every downstream stage is grounded in the
      // product's REAL, documented features, not just the one-line description.
      if (args.docsLink) {
        await ctx.runMutation(internal.research.patchReport, {
          reportId: args.reportId, stage: "Reading product docs…", progress: 4,
        });
        const docsText = await fetchDocsText(args.docsLink);
        if (docsText) {
          const docs = await openAIChat<{ features: string }>(
            `From this product's OWN documentation below, extract a concise, factual bullet summary of its key features and capabilities (specific; no marketing fluff). Use ONLY what the docs state.\n\nDOCS:\n${docsText}`,
            strict({ features: STR }),
          );
          blurb += `\nDocumented features (from the product's own docs): ${docs.features}`;
        }
      }

      // Stages 1–6 run CONCURRENTLY. Convex actions hard-cap at 600s and the gpt-5 web-search stages are slow, so
      // running them sequentially overran the limit (it was killed mid-fetch). In parallel the wall-clock is ~one
      // stage, and each section patches itself the moment it lands so the report fills in live.
      await ctx.runMutation(internal.research.patchReport, {
        reportId: args.reportId, stage: "Researching the market across the web…", progress: 15,
      });
      const patchSection = (fields: Record<string, unknown>) =>
        ctx.runMutation(internal.research.patchReport, { reportId: args.reportId, ...fields });

      const useCasesP = openAIChat<{ useCases: UseCase[] }>(
        `List 4 innovative, specific use cases a hackathon builder could build USING this product. ${blurb}`,
        strict({ useCases: arrayOf(strict({ title: STR, description: STR, whoBuildsIt: STR })) }),
      ).then((r) => patchSection({ useCases: r.useCases }));

      const competitorsP = openAIWeb<{ competitors: Competitor[] }>(
        `Using web search, find 4 real competitors to this product and summarize the ACTUAL public feedback developers give them (from Reddit, Hacker News, G2, X/Twitter, reviews). For each include the real source URLs you used. Do not invent feedback. ${blurb}`,
        strict({ competitors: arrayOf(strict({ name: STR, whatTheyDo: STR, publicFeedback: STR, sources: STR_ARR })) }),
      ).then((r) => patchSection({ competitors: r.competitors }));

      const customersP = openAIWeb<{ productFeedback: ProductFeedback }>(
        `Using web search, find who ACTUALLY uses this specific product (named customers/companies if public) and the real public sentiment about it. Include source URLs. If there is genuinely no public information, say so honestly instead of inventing. ${blurb}`,
        strict({ productFeedback: strict({ currentCustomers: STR, publicSentiment: STR, sources: STR_ARR }) }),
      ).then((r) => patchSection({ productFeedback: r.productFeedback }));

      const businessesP = openAIWeb<{ businesses: BusinessTarget[] }>(
        `Today is ${today}. Using web search, find up to 6 REAL, named companies that are strong B2B customers for this product — pick companies whose CURRENT stack, hiring, or public engineering needs match what this product does. For EACH company include: name; segment (e.g. "Series B fintech", "AI infra startup", "enterprise SaaS"); what they do; why this product specifically fits them; the SPECIFIC buying signal you actually found (a real job posting, funding round, public tech-stack mention, conference talk, GitHub usage, engineering blog, etc.) — it MUST be RECENT (within ~the last 12 months) and you MUST state its date; the role to contact (e.g. "Head of Platform Engineering"); the company website; and the real source URLs. Each source URL must be the actual page where you found the buying signal (the job posting, funding announcement, blog post, etc.), NOT just the company homepage. Only include companies you can verify from a real source — do NOT invent or pad. If you cannot verify at least one real company with a genuine, recent, dated buying signal, return an EMPTY list rather than filling the quota with generic well-known companies — it is better to return 1 truly verified company (or none) than 6 plausible guesses. Prefer companies matching the ideal customer. ${blurb}`,
        strict({ businesses: arrayOf(strict({ name: STR, segment: STR, whatTheyDo: STR, whyFit: STR, buyingSignal: STR, contactRole: STR, website: STR, sources: STR_ARR })) }),
      ).then((r) => patchSection({ businesses: r.businesses }));

      const universitiesP = openAIWeb<{ universities: UniversityTarget[] }>(
        `Using web search, find up to 5 REAL universities / CS departments / research labs / student developer clubs / university hackathons that are strong adoption AND community-seeding targets for this product (student developers, research use, course adoption, campus ambassadors, hackathon sponsorship). For EACH include: name; the specific program/lab/club/course/hackathon; why it fits THIS product's specific value proposition and ideal customer (reference a concrete attribute of the program — not a generic claim that students like new tools); a concrete way to ACTIVATE them (a named faculty member/course, the club + how to reach it, a career fair, or sponsoring the hackathon); location; a URL; and the real source URLs. The activation path you give must itself be confirmed from a real source — do NOT invent professor names, courses, or club contacts; if you can only verify the school but not a concrete activation path, say so rather than fabricating one. Each source URL must evidence the specific program/lab/club/hackathon and the activation path, not just the university homepage. Do NOT list a school merely because it is famous: only include a target when a real source shows a concrete, product-specific fit. If you cannot find such verifiable, product-specific targets, return an EMPTY list rather than defaulting to well-known CS departments. ${blurb}`,
        strict({ universities: arrayOf(strict({ name: STR, program: STR, whyFit: STR, contactPath: STR, location: STR, url: STR, sources: STR_ARR })) }),
      ).then((r) => patchSection({ universities: r.universities }));

      const eventsP = openAIWeb<{ events: EventItem[] }>(
        `Today is ${today}. Using web search, find up to 5 REAL developer / startup / hackathon events in San Francisco or the Bay Area happening between today and ~1 month out, where this product could sponsor or get publicity. For each: exact name, date (YYYY-MM-DD or range), location, the event page URL, and why it's relevant to this product. Only include real events you can verify with a source URL — do not invent any. ${blurb}`,
        strict({ events: arrayOf(strict({ name: STR, date: STR, location: STR, url: STR, whyRelevant: STR })) }),
      ).then((r) => patchSection({ events: r.events }));

      await Promise.all([useCasesP, competitorsP, customersP, businessesP, universitiesP, eventsP]);

      // Builders last — real people via GitHub + Fiber (uses the docs-enriched blurb).
      await ctx.runMutation(internal.research.patchReport, {
        reportId: args.reportId, stage: "Finding real builders (GitHub + Fiber)…", progress: 88,
      });
      const builders = await findBuilders(blurb);
      await ctx.runMutation(internal.research.patchReport, {
        reportId: args.reportId,
        builders,
        progress: 100,
        status: "complete",
        stage: "Research complete",
        completedAt: Date.now(),
      });
    } catch (e) {
      await ctx.runMutation(internal.research.patchReport, {
        reportId: args.reportId,
        status: "error",
        stage: "Research failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
});

// ---------- Builders: GitHub (real repos) + Fiber (real identity) ----------

// findBuilders: derive a GitHub search from the product, take the top user-owned repos, and resolve each owner
// to a real person via Fiber. Params: blurb = the product summary. Returns real, named builders. Used by runResearch.
async function findBuilders(blurb: string): Promise<Builder[]> {
  // 1. Ask the model for one concise GitHub search query (keywords only) for the product's space.
  const q = await openAIChat<{ query: string }>(
    `Give ONE concise GitHub repository search query (plain keywords, no operators) to find open-source projects whose authors would be ideal users of this product. ${blurb}`,
    strict({ query: STR }),
  );

  // 2. Real repos, sorted by stars; keep individual (User) owners only.
  const repos = await githubSearchRepos(q.query);
  const owners = repos.filter((r) => r.ownerType === "User" && r.login).slice(0, 5);

  // 3. Resolve each GitHub owner to a real LinkedIn/email via Fiber (guarded — GitHub data stands either way).
  const builders: Builder[] = [];
  for (const repo of owners) {
    const fiber = await fiberGithubToLinkedin(repo.login);
    builders.push({
      name: fiber?.name || repo.login,
      githubUrl: repo.ownerUrl || `https://github.com/${repo.login}`,
      githubSignal: `Maintains ${repo.repoName} — ${repo.stars.toLocaleString()}★`,
      linkedinUrl: fiber?.linkedinUrl || "",
      email: fiber?.email || "",
      whyPromising: repo.description
        ? `Building "${repo.description}" — active in this product's space.`
        : "Active open-source maintainer in this product's space.",
      confidence: fiber?.confidence ?? 0,
    });
  }
  return builders;
}

// githubSearchRepos: search GitHub for the top-starred repos matching a query. Params: query. Returns real repo
// + owner facts. Uses GITHUB_TOKEN if set (higher rate limit), otherwise unauthenticated. Used by findBuilders.
async function githubSearchRepos(query: string): Promise<
  Array<{ login: string; ownerType: string; ownerUrl: string; repoName: string; stars: number; description: string }>
> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "devgraph",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`;
  const res = await fetch(url, { headers });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    items?: Array<{
      owner?: { login?: string; type?: string; html_url?: string };
      full_name?: string;
      stargazers_count?: number;
      description?: string | null;
    }>;
  };
  return (data.items ?? []).map((r) => ({
    login: r.owner?.login ?? "",
    ownerType: r.owner?.type ?? "",
    ownerUrl: r.owner?.html_url ?? "",
    repoName: r.full_name ?? "",
    stars: r.stargazers_count ?? 0,
    description: r.description ?? "",
  }));
}

// fiberGithubToLinkedin: resolve a GitHub username to a real LinkedIn URL + name + email via Fiber. Params:
// username. Returns null if FIBER_API_KEY is unset or the call fails. Used by findBuilders.
async function fiberGithubToLinkedin(
  username: string,
): Promise<{ linkedinUrl: string; name: string; email: string; confidence: number } | null> {
  const apiKey = process.env.FIBER_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.fiber.ai/v1/github-to-linkedin/single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, githubUsername: username, outputType: "both" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const out = data.output ?? {};
    const emails = out.extractedEmails ?? [];
    return {
      linkedinUrl: out.linkedInUrl ?? "",
      name: out.githubProfile?.name ?? "",
      email: emails[0] ?? "",
      confidence: out.confidenceOutOf10 ?? 0,
    };
  } catch {
    return null;
  }
}

// ---------- Product docs ----------

// fetchDocsText: fetch the product's docs / llms.txt URL and return plain text (HTML stripped, truncated to keep
// the prompt bounded). Returns "" on any failure so research proceeds (just ungrounded-by-docs) instead of
// erroring. Params: url. Used by runResearch's Stage 0.
async function fetchDocsText(url: string): Promise<string> {
  try {
    // Bound the fetch so a slow/hanging docs host can't eat the action's time budget.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { headers: { "User-Agent": "devgraph" }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return "";
    const body = await res.text();
    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 8000);
  } catch {
    return "";
  }
}

// ---------- OpenAI helpers ----------

// openAIChat: plain (no-web) chat-completions call with a strict JSON schema. Params: prompt, schema. Generic
// <T> is the parsed return type. Used by the analytical stages (use cases, GitHub query).
async function openAIChat<T>(prompt: string, schema: object): Promise<T> {
  const apiKey = requireOpenAIKey();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a precise GTM research analyst for developer tools. Reply ONLY with JSON matching the schema." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content) as T;
}

// openAIWeb: Responses-API call WITH the live web_search tool + a strict JSON schema, so the result is grounded
// in real, current pages (and carries source URLs). Params: prompt, schema. Used by the web-grounded stages.
async function openAIWeb<T>(prompt: string, schema: object): Promise<T> {
  const apiKey = requireOpenAIKey();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      tools: [{ type: "web_search" }],
      input: prompt,
      text: { format: { type: "json_schema", name: "result", strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI web search failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  // Prefer the convenience field; fall back to scanning the output items for the message text.
  let text: string | undefined = data.output_text;
  if (!text && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === "output_text" && typeof c.text === "string") text = c.text;
        }
      }
    }
  }
  return JSON.parse(text ?? "{}") as T;
}

// requireOpenAIKey: read the deployment's OpenAI key or throw a clear setup error. Used by both OpenAI helpers.
function requireOpenAIKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set on the Convex deployment. Run: npx convex env set OPENAI_API_KEY sk-...");
  }
  return apiKey;
}

// ---------- JSON-schema builders ----------

const STR = { type: "string" };
const STR_ARR = { type: "array", items: { type: "string" } };

// strict: a strict object schema (all properties required, no extras). Params: fields = property->schema map.
function strict(fields: Record<string, object>): object {
  return { type: "object", additionalProperties: false, required: Object.keys(fields), properties: fields };
}

// arrayOf: an array schema wrapping an item schema. Params: item = the item's schema.
function arrayOf(item: object): object {
  return { type: "array", items: item };
}
