"use client";
// page.tsx (/improve/[productId]) — Product-improvement report. "Improve" generates the immediate next features
// to build (grounded in the discovery report's customer + competitor feedback) as a shareable report, and
// "Share with product & engineering" forwards them to the engineering Orange Slice sheet.
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

// ImprovePage: the improvement screen for one product. No props; reads productId from the route. Rendered at
// /improve/<id>; the Clerk proxy guarantees auth and every query enforces ownership.
export default function ImprovePage() {
  const params = useParams<{ productId: string }>();
  const productId = params.productId as Id<"products">;
  const product = useQuery(api.outreach.getProduct, { productId });
  const report = useQuery(api.improve.getFeatureReport, { productId });
  const generate = useMutation(api.improve.generateFeatures);
  const share = useAction(api.improve.shareWithEngineering);
  const [shareMsg, setShareMsg] = useState("");
  const [sharing, setSharing] = useState(false);

  const generating = report?.status === "running";

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← Back to dashboard
      </Link>

      {product === null && <p className="mt-8 text-sm text-zinc-500">Product not found.</p>}
      {product && (
        <>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            Next features — <span className="text-indigo-600">{product.companyName}</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Grounded in your customers&apos; + competitors&apos; feedback from the discovery report.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => generate({ productId })}
              disabled={generating}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {generating ? "Generating…" : report ? "Regenerate" : "Improve — suggest next features"}
            </button>
            {report?.status === "complete" && (
              <button
                onClick={async () => {
                  setSharing(true);
                  setShareMsg("");
                  try {
                    await share({ featureReportId: report._id });
                    setShareMsg("Shared with product & engineering ✓");
                  } catch (e) {
                    setShareMsg(e instanceof Error ? e.message : "Share failed");
                  } finally {
                    setSharing(false);
                  }
                }}
                disabled={sharing}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {sharing ? "Sharing…" : "Share with product & engineering"}
              </button>
            )}
          </div>
          {shareMsg && <p className="mt-2 text-xs text-zinc-500">{shareMsg}</p>}

          {report?.status === "running" && (
            <p className="mt-8 text-sm text-zinc-500">Analyzing feedback and drafting features…</p>
          )}
          {report?.status === "error" && (
            <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40">
              Failed: {report.error}
            </p>
          )}

          {report?.status === "complete" && (
            <>
              {report.summary && (
                <p className="mt-8 rounded-xl border border-zinc-200 p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                  {report.summary}
                </p>
              )}
              <div className="mt-4 flex flex-col gap-3">
                {(report.features ?? []).map((f, i) => (
                  <div key={i} className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-semibold">{f.title}</h3>
                      <PriorityBadge priority={f.priority} />
                    </div>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{f.description}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">Why:</span> {f.rationale}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">Impact:</span> {f.impact}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// PriorityBadge: a colored P0/P1/P2 pill. Params: priority. Used by ImprovePage.
function PriorityBadge({ priority }: { priority: string }) {
  const p = priority.toUpperCase();
  const color = p.includes("0")
    ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400"
    : p.includes("1")
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>{priority}</span>;
}
