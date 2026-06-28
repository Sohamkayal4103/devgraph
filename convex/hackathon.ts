// hackathon.ts — Hackathon team discovery + SDK-integration detection. Given a Devpost hackathon URL, scrape its
// project gallery, follow each team's GitHub repo, and use the repo's SBOM + package.json (+ Devpost "Built With"
// tags) to detect whether they integrated the sponsor's SDK, a competitor's, or none — "which teams in this room
// integrated your SDK." Results are stored on a hackathonScan and shown in the discovery report.
import { v } from "convex/values";
import { mutation, query, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { hackathonTeamValidator } from "./validators";
import { openAIChat, strict, arrayOf, STR, MODEL_FAST } from "./openai";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const MAX_PROJECTS = 12; // cap per scan to stay fast + within rate limits

type Team = {
  projectName: string;
  projectUrl: string;
  repoUrl: string;
  builtWith: string[];
  integration: "integrated" | "competitor" | "none" | "no_repo";
  detail: string;
};

// ---------- Public: start + read ----------

// scanHackathon: start a hackathon scan for a product. Args: productId, hackathonUrl. Called by the report
// page's "Scan teams" button. Inserts a running scan and schedules the background action.
export const scanHackathon = mutation({
  args: { productId: v.id("products"), hackathonUrl: v.string() },
  handler: async (ctx, args): Promise<Id<"hackathonScans">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== identity.subject) throw new Error("Product not found");
    const id = await ctx.db.insert("hackathonScans", {
      productId: args.productId,
      userId: identity.subject,
      status: "running",
      progress: 0,
      stage: "Starting…",
      hackathonUrl: args.hackathonUrl,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.hackathon.runHackathonScan, {
      scanId: id,
      productId: args.productId,
      hackathonUrl: args.hackathonUrl,
    });
    return id;
  },
});

// getHackathonScan: the latest scan for a product. Args: productId. Called by the report page via useQuery.
export const getHackathonScan = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const product = await ctx.db.get(args.productId);
    if (!product || product.userId !== identity.subject) return null;
    return await ctx.db
      .query("hackathonScans")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .first();
  },
});

// getScanProduct: (internal) the product for a scan, for deriving SDK package names. Args: productId.
export const getScanProduct = internalQuery({
  args: { productId: v.id("products") },
  handler: async (ctx, args): Promise<Doc<"products"> | null> => {
    return await ctx.db.get(args.productId);
  },
});

// patchScan: (internal) update a scan's progress/stage/teams/status. Args: scanId + fields. Called by runHackathonScan.
export const patchScan = internalMutation({
  args: {
    scanId: v.id("hackathonScans"),
    progress: v.optional(v.number()),
    stage: v.optional(v.string()),
    status: v.optional(v.union(v.literal("running"), v.literal("complete"), v.literal("error"))),
    error: v.optional(v.string()),
    ourSdk: v.optional(v.array(v.string())),
    teams: v.optional(v.array(hackathonTeamValidator)),
  },
  handler: async (ctx, args): Promise<void> => {
    const { scanId, ...fields } = args;
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(fields)) if (val !== undefined) patch[k] = val;
    await ctx.db.patch(scanId, patch);
  },
});

// ---------- Internal: the scan action ----------

// runHackathonScan: derive the SDK package names, scrape the Devpost gallery, follow each repo, and detect SDK
// integration via SBOM/package.json. Args: scanId, productId, hackathonUrl. Scheduled by scanHackathon.
export const runHackathonScan = internalAction({
  args: { scanId: v.id("hackathonScans"), productId: v.id("products"), hackathonUrl: v.string() },
  handler: async (ctx, args): Promise<void> => {
    try {
      const product = await ctx.runQuery(internal.hackathon.getScanProduct, { productId: args.productId });
      if (!product) return;

      // 1. Derive the package names to look for (the product's own SDK + competitors').
      await ctx.runMutation(internal.hackathon.patchScan, { scanId: args.scanId, stage: "Identifying SDK packages…", progress: 8 });
      const aliases = await openAIChat<{ ours: string[]; competitors: string[] }>(
        `For this developer product, list the exact npm/PyPI package name(s) a developer installs/imports to use ITS OWN SDK ("ours"), and the package names of its top 4-5 competitors' SDKs ("competitors"). Lowercase, no versions. PRODUCT: ${product.companyName} — ${product.productDescription}`,
        strict({ ours: arrayOf(STR), competitors: arrayOf(STR) }),
        MODEL_FAST,
      );
      const ourSdk = aliases.ours.map((s) => s.toLowerCase()).filter(Boolean);
      const compSdk = aliases.competitors.map((s) => s.toLowerCase()).filter(Boolean);
      await ctx.runMutation(internal.hackathon.patchScan, { scanId: args.scanId, ourSdk });

      // 2. Scrape the project gallery → project slugs.
      await ctx.runMutation(internal.hackathon.patchScan, { scanId: args.scanId, stage: "Scraping Devpost gallery…", progress: 18 });
      const gallery = await fetchText(galleryUrl(args.hackathonUrl));
      const slugs = parseGallerySlugs(gallery).slice(0, MAX_PROJECTS);
      if (slugs.length === 0) {
        await ctx.runMutation(internal.hackathon.patchScan, {
          scanId: args.scanId, status: "error", stage: "No projects found",
          error: "No projects found at that Devpost URL. Use a hackathon's gallery URL (e.g. https://<event>.devpost.com).",
        });
        return;
      }

      // 3. For each project: fetch the page, detect SDK via repo SBOM/package.json.
      const teams: Team[] = [];
      for (let i = 0; i < slugs.length; i++) {
        await ctx.runMutation(internal.hackathon.patchScan, {
          scanId: args.scanId,
          stage: `Checking project ${i + 1}/${slugs.length}…`,
          progress: 20 + Math.round((i / slugs.length) * 70),
        });
        const team = await scanProject(slugs[i], ourSdk, compSdk);
        if (team) teams.push(team);
      }

      // 4. Sort: integrated first, then competitor, then the rest.
      const rank = { integrated: 0, competitor: 1, none: 2, no_repo: 3 } as const;
      teams.sort((a, b) => rank[a.integration] - rank[b.integration]);

      await ctx.runMutation(internal.hackathon.patchScan, {
        scanId: args.scanId, teams, status: "complete", stage: "Scan complete", progress: 100,
      });
    } catch (e) {
      await ctx.runMutation(internal.hackathon.patchScan, {
        scanId: args.scanId, status: "error", stage: "Scan failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
});

// ---------- Helpers (plain functions) ----------

// galleryUrl: normalize any hackathon URL to its project-gallery URL. Params: input. Used by runHackathonScan.
function galleryUrl(input: string): string {
  try {
    const u = new URL(input.startsWith("http") ? input : `https://${input}`);
    return `${u.protocol}//${u.host}/project-gallery`;
  } catch {
    return input;
  }
}

// fetchText: GET a URL as text with a browser user-agent. Params: url. Used for Devpost pages.
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Fetch ${url} failed (${res.status})`);
  return await res.text();
}

// parseGallerySlugs: extract unique project slugs from a gallery HTML, dropping non-project links. Params: html.
function parseGallerySlugs(html: string): string[] {
  const deny = new Set(["new", "search", "popular", "trending", "built-with"]);
  const set = new Set<string>();
  const re = /devpost\.com\/software\/([a-z0-9-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const slug = m[1];
    if (!deny.has(slug) && slug.length > 2) set.add(slug);
  }
  return [...set];
}

// scanProject: fetch one Devpost project page, find its repo, and classify SDK integration. Params: slug, the
// sponsor SDK aliases, competitor aliases. Returns a Team (or null). Used by runHackathonScan.
async function scanProject(slug: string, ourSdk: string[], compSdk: string[]): Promise<Team | null> {
  const projectUrl = `https://devpost.com/software/${slug}`;
  let html: string;
  try {
    html = await fetchText(projectUrl);
  } catch {
    return null;
  }
  const projectName = /<meta property="og:title" content="([^"]+)"/.exec(html)?.[1] ?? slug;
  const builtWith = parseBuiltWith(html);
  const repo = parseRepo(html);

  if (!repo) {
    const tagHit = match([...builtWith], ourSdk) ?? null;
    return {
      projectName, projectUrl, repoUrl: "", builtWith,
      integration: tagHit ? "integrated" : "no_repo",
      detail: tagHit ? `"Built With" lists ${tagHit} (no repo to verify)` : "No GitHub repo linked",
    };
  }

  const packages = await repoPackages(repo.owner, repo.repo);
  const hay = [...packages, ...builtWith];
  const ours = match(hay, ourSdk);
  if (ours) {
    return { projectName, projectUrl, repoUrl: repo.url, builtWith, integration: "integrated", detail: `Imports ${ours}` };
  }
  const comp = match(hay, compSdk);
  if (comp) {
    return { projectName, projectUrl, repoUrl: repo.url, builtWith, integration: "competitor", detail: `Uses competitor ${comp}` };
  }
  return { projectName, projectUrl, repoUrl: repo.url, builtWith, integration: "none", detail: "No SDK match in deps" };
}

// parseBuiltWith: extract Devpost "Built With" tag names from a project page. Params: html.
function parseBuiltWith(html: string): string[] {
  const out: string[] = [];
  const re = /<span class="cp-tag[^"]*"[^>]*>(?:<a[^>]*>)?([^<]+)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1].trim().toLowerCase());
  return [...new Set(out)].filter(Boolean);
}

// parseRepo: find the team's GitHub repo on a project page, skipping Devpost's own analytics links. Params: html.
function parseRepo(html: string): { owner: string; repo: string; url: string } | null {
  const re = /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const owner = m[1];
    const repo = m[2].replace(/\.git$/, "");
    if (["newrelic", "devpost", "facebook", "twitter"].includes(owner.toLowerCase())) continue;
    return { owner, repo, url: `https://github.com/${owner}/${repo}` };
  }
  return null;
}

// repoPackages: collect a repo's dependency package names from its GitHub SBOM + package.json. Params: owner, repo.
// Returns lowercased package names. Uses GITHUB_TOKEN if set (higher rate limit). Used by scanProject.
async function repoPackages(owner: string, repo: string): Promise<string[]> {
  const pkgs = new Set<string>();
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "devgraph" };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  // GitHub SBOM (all ecosystems).
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/dependency-graph/sbom`, { headers });
    if (r.ok) {
      const d = (await r.json()) as { sbom?: { packages?: Array<{ name?: string }> } };
      for (const p of d.sbom?.packages ?? []) if (p.name) pkgs.add(String(p.name).toLowerCase());
    }
  } catch {
    /* ignore */
  }
  // package.json (raw — not rate-limited), the most reliable signal for JS projects.
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/package.json`);
    if (r.ok) {
      const d = (await r.json()) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      for (const dep of [...Object.keys(d.dependencies ?? {}), ...Object.keys(d.devDependencies ?? {})]) {
        pkgs.add(dep.toLowerCase());
      }
    }
  } catch {
    /* ignore */
  }
  return [...pkgs];
}

// match: find the first alias that appears as a substring in any of the haystack strings. Params: haystack,
// aliases. Returns the matched alias or undefined. Used by scanProject.
function match(haystack: string[], aliases: string[]): string | undefined {
  const hay = haystack.join(" ");
  return aliases.find((a) => a && hay.includes(a));
}
