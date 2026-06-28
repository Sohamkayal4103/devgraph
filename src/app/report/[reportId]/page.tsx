"use client";
// page.tsx (/report/[reportId]) — The discovery/research report for one product. Reads the report live from
// Convex and renders each grounded section (use cases, competitors+feedback, real customers, upcoming events,
// real named builders) with markdown formatting + source links, or a progress view while research runs.
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Markdown } from "@/components/markdown";

// ReportPage: renders the research report named in the URL. No props; reads the reportId from the route.
// Rendered at /report/<id>; the Clerk proxy guarantees auth, and the query enforces ownership.
export default function ReportPage() {
  const params = useParams<{ reportId: string }>();
  const report = useQuery(api.research.getReport, {
    reportId: params.reportId as Id<"reports">,
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← Back to dashboard
      </Link>

      {report === undefined && <p className="mt-8 text-sm text-zinc-500">Loading report…</p>}
      {report === null && (
        <p className="mt-8 text-sm text-zinc-500">Report not found (or you don&apos;t have access).</p>
      )}

      {report && (
        <>
          <div className="mt-4 flex items-center justify-between gap-4">
            <h1 className="text-3xl font-semibold tracking-tight">Discovery report</h1>
            <div className="flex items-center gap-3">
              <StatusPill status={report.status} progress={report.progress} />
              <Link
                href={`/graph/${report.productId}`}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Explore graph →
              </Link>
              <Link
                href={`/improve/${report.productId}`}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Improve →
              </Link>
              <Link
                href={`/outreach/${report.productId}`}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Outreach →
              </Link>
            </div>
          </div>

          {report.status === "running" && (
            <div className="mt-6 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{report.stage}</span>
                <span className="text-zinc-500">{report.progress}%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-2 rounded-full bg-indigo-600 transition-all duration-500"
                  style={{ width: `${report.progress}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-zinc-400">Sections appear below as each stage finishes.</p>
            </div>
          )}

          {report.status === "error" && (
            <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40">
              Research failed: {report.error}
            </p>
          )}

          {report.useCases && (
            <Section title="Buildable use cases" subtitle="What builders could build using this product">
              {report.useCases.map((u, i) => (
                <Card key={i} heading={u.title} sub={u.whoBuildsIt}>
                  <Markdown>{u.description}</Markdown>
                </Card>
              ))}
            </Section>
          )}

          {report.competitors && (
            <Section title="Competitors & public feedback" subtitle="Real sentiment from the web, with sources">
              {report.competitors.map((c, i) => (
                <Card key={i} heading={c.name} sub={c.whatTheyDo}>
                  <Markdown>{c.publicFeedback}</Markdown>
                  <Sources urls={c.sources} />
                </Card>
              ))}
            </Section>
          )}

          {report.productFeedback && (
            <Section title="Current customers & sentiment" subtitle="Grounded in real web sources">
              <Card heading="Current customers">
                <Markdown>{report.productFeedback.currentCustomers}</Markdown>
              </Card>
              <Card heading="Public sentiment">
                <Markdown>{report.productFeedback.publicSentiment}</Markdown>
                <Sources urls={report.productFeedback.sources} />
              </Card>
            </Section>
          )}

          {report.events && (
            <Section
              title="Upcoming events to sponsor / publicize at"
              subtitle="Real SF & Bay Area events in the next ~month"
            >
              {report.events.length === 0 && (
                <p className="text-sm text-zinc-500">No matching upcoming events found.</p>
              )}
              {report.events.map((e, i) => (
                <Card key={i} heading={e.name} sub={`${e.date}${e.location ? ` · ${e.location}` : ""}`}>
                  <Markdown>{e.whyRelevant}</Markdown>
                  {e.url && (
                    <div className="mt-2">
                      <Chip href={e.url}>Event page ↗</Chip>
                    </div>
                  )}
                </Card>
              ))}
            </Section>
          )}

          {report.builders && (
            <Section title="Promising builders to reach out to" subtitle="Real people via GitHub + Fiber">
              {report.builders.length === 0 && (
                <p className="text-sm text-zinc-500">No individual builders resolved for this query.</p>
              )}
              {report.builders.map((b, i) => (
                <Card
                  key={i}
                  heading={b.name}
                  sub={b.confidence > 0 ? `match ${b.confidence}/10` : undefined}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{b.githubSignal}</p>
                  <div className="mt-1.5">
                    <Markdown>{b.whyPromising}</Markdown>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {b.githubUrl && <Chip href={b.githubUrl}>GitHub ↗</Chip>}
                    {b.linkedinUrl && <Chip href={b.linkedinUrl}>LinkedIn ↗</Chip>}
                    {b.email && <Chip href={`mailto:${b.email}`}>{b.email}</Chip>}
                  </div>
                </Card>
              ))}
            </Section>
          )}
          <HackathonScan productId={report.productId} />
        </>
      )}
    </div>
  );
}

// StatusPill: a colored status chip in the header. Params: status, progress. Used by ReportPage.
function StatusPill({ status, progress }: { status: string; progress: number }) {
  if (status === "complete") {
    return (
      <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-950/50 dark:text-green-400">
        ✓ Complete
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400">
        Failed
      </span>
    );
  }
  return (
    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400">
      Researching · {progress}%
    </span>
  );
}

// Section: a titled group of report cards. Params: title, subtitle, children (the cards). Used by ReportPage.
function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

// Card: one item within a section. Params: heading, optional sub label, children (body). Used by ReportPage.
function Card({ heading, sub, children }: { heading: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h3 className="font-semibold">{heading}</h3>
      {sub && <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{sub}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

// Sources: a row of numbered source-link chips. Params: urls = the source URLs. Used by ReportPage.
function Sources({ urls }: { urls: string[] }) {
  if (!urls || urls.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800/60">
      <span className="mr-1 text-xs text-zinc-400">Sources</span>
      {urls.map((u, i) => (
        <a
          key={i}
          href={u}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-indigo-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-indigo-400 dark:hover:bg-zinc-700"
        >
          {i + 1}
        </a>
      ))}
    </div>
  );
}

// Chip: a small pill-style external link (GitHub/LinkedIn/email/event). Params: href, children. Used by ReportPage.
function Chip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
    >
      {children}
    </a>
  );
}

// HackathonScan: scan a Devpost hackathon for teams that integrated this product's SDK. Params: productId.
// Rendered at the bottom of the report; runs the scan (Devpost → GitHub SBOM) and shows each team's status.
function HackathonScan({ productId }: { productId: Id<"products"> }) {
  const scan = useQuery(api.hackathon.getHackathonScan, { productId });
  const start = useMutation(api.hackathon.scanHackathon);
  const [url, setUrl] = useState("");
  const running = scan?.status === "running";

  return (
    <Section
      title="Hackathon team scan"
      subtitle="Which teams in a hackathon actually integrated this SDK — Devpost gallery → each repo's GitHub SBOM"
    >
      <div className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-hackathon.devpost.com"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={() => url.trim() && start({ productId, hackathonUrl: url.trim() })}
          disabled={running}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {running ? "Scanning…" : "Scan teams"}
        </button>
      </div>

      {running && (
        <div className="mt-3">
          <p className="text-xs text-zinc-500">
            {scan.stage} · {scan.progress}%
          </p>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-2 rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${scan.progress}%` }} />
          </div>
        </div>
      )}
      {scan?.status === "error" && <p className="mt-3 text-sm text-red-500">{scan.error}</p>}
      {scan?.status === "complete" && scan.teams && (
        <div className="mt-4 flex flex-col gap-2">
          {scan.teams.length === 0 && <p className="text-sm text-zinc-500">No teams found.</p>}
          {scan.teams.map((t, i) => (
            <TeamRow key={i} team={t} />
          ))}
        </div>
      )}
    </Section>
  );
}

// TeamRow: one hackathon team + its SDK-integration badge + Devpost/GitHub links. Params: team. Used by HackathonScan.
function TeamRow({
  team,
}: {
  team: { projectName: string; projectUrl: string; repoUrl: string; builtWith: string[]; integration: string; detail: string };
}) {
  const badge =
    team.integration === "integrated"
      ? { label: "✓ Integrated", cls: "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400" }
      : team.integration === "competitor"
        ? { label: "Competitor SDK", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400" }
        : { label: team.integration === "no_repo" ? "No repo" : "No match", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" };
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{team.projectName}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{team.detail}</p>
      {team.builtWith.length > 0 && (
        <p className="mt-1 text-xs text-zinc-400">Built with: {team.builtWith.slice(0, 8).join(", ")}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Chip href={team.projectUrl}>Devpost ↗</Chip>
        {team.repoUrl && <Chip href={team.repoUrl}>GitHub ↗</Chip>}
      </div>
    </div>
  );
}
