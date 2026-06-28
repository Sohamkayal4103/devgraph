"use client";
// page.tsx (/signals/[productId]) — Retention & expansion signal feed, powered by Fiber Tracker. The user sets up
// tracking (creates a Fiber company-list watching funding/hiring/tech/headcount/news/layoff rules), then drives it
// with buttons: "Fire test signal" (free, instant, Fiber-generated sample signals badged TEST), "Add my company
// targets" (starts real monitoring of the discovered B2B companies), and "Refresh signals" (polls real signals in).
// The feed itself is a reactive Convex query, so new signals appear without a refresh.
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";

const MONITORED = ["New funding", "Tech added", "Key hires", "Headcount", "Company news", "Layoffs"];

// SignalsPage: the per-product signal feed + controls. No props; reads productId from the route. Queries enforce ownership.
export default function SignalsPage() {
  const params = useParams<{ productId: string }>();
  const productId = params.productId as Id<"products">;
  const tracker = useQuery(api.tracker.getTrackerState, { productId });
  const signals = useQuery(api.tracker.listSignals, { productId });

  const setupTracking = useAction(api.tracker.setupTracking);
  const addCompanies = useAction(api.tracker.addTargetCompanies);
  const fireTest = useAction(api.tracker.fireTestSignal);
  const refresh = useAction(api.tracker.refreshSignals);

  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // run: execute an action with shared busy/note/error handling. Params: key (button id), fn, success message builder.
  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      setNote(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← Back to dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">
        Retention &amp; expansion signals
        {tracker && <span className="text-indigo-600"> — {tracker.companyName}</span>}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Live buying &amp; churn signals on your accounts via Fiber Tracker — funding, hiring, tech adoption,
        headcount, news, and layoffs. <span className="font-medium">Expansion</span> = upsell window;{" "}
        <span className="font-medium">risk</span> = churn watch.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-zinc-500">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">Monitoring:</span>
        {MONITORED.map((m) => (
          <span key={m} className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
            {m}
          </span>
        ))}
      </div>

      {/* Action feedback — rendered in every state so the setup CTA can show its own errors too. */}
      {note && <p className="mt-3 text-sm text-green-600">{note}</p>}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {tracker === undefined ? (
        <p className="mt-8 text-sm text-zinc-500">Loading…</p>
      ) : tracker === null ? (
        <p className="mt-8 text-sm text-zinc-500">Product not found.</p>
      ) : !tracker.trackerListId ? (
        // Not set up yet — single CTA.
        <div className="mt-8 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Set up a Fiber Tracker watchlist for this product. It monitors your target accounts for the signals
            above. Setup is free — real monitoring only consumes Fiber credits once you add companies.
          </p>
          <button
            onClick={() => run("setup", async () => { await setupTracking({ productId }); return "Tracking set up. Fire a test signal to see the feed."; })}
            disabled={busy !== null}
            className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy === "setup" ? "Setting up…" : "Set up tracking"}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              onClick={() => run("fire", async () => { const r = await fireTest({ productId }); return `Fired ${r.added} test signal${r.added === 1 ? "" : "s"}.`; })}
              disabled={busy !== null}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy === "fire" ? "Firing…" : "Fire test signal"}
            </button>
            <button
              onClick={() => run("add", async () => { const r = await addCompanies({ productId }); return `Added ${r.added} of ${r.attempted} target companies to live monitoring (${r.skipped} skipped).`; })}
              disabled={busy !== null}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              {busy === "add" ? "Adding…" : "Add my company targets"}
            </button>
            <button
              onClick={() => run("refresh", async () => { const r = await refresh({ productId }); return `${r.added} new signal${r.added === 1 ? "" : "s"} pulled in.`; })}
              disabled={busy !== null}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              {busy === "refresh" ? "Refreshing…" : "Refresh signals"}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            &quot;Add my company targets&quot; starts real monitoring of your discovered B2B companies and consumes
            Fiber credits per company per refresh. Test signals are free and clearly badged.
          </p>

          <div className="mt-6">
            {signals === undefined ? (
              <p className="text-sm text-zinc-500">Loading feed…</p>
            ) : signals.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
                No signals yet. Fire a test signal to see the pipeline, or add your company targets to start real
                monitoring.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {signals.map((s) => (
                  <SignalCard key={s._id} signal={s} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// SignalCard: one signal in the feed. Params: signal = the Convex doc. Used by SignalsPage.
function SignalCard({ signal }: { signal: Doc<"signals"> }) {
  const tone =
    signal.category === "expansion"
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
      : signal.category === "risk"
        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  const parsed = signal.observedAt ? new Date(signal.observedAt) : null;
  const when = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString() : "";
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
          {signal.category === "risk" ? "Churn risk" : signal.category === "expansion" ? "Expansion" : "Signal"}
        </span>
        <span className="text-sm font-medium">{signal.readableType}</span>
        {signal.isDummy && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            TEST
          </span>
        )}
        {when && <span className="ml-auto text-xs text-zinc-400">{when}</span>}
      </div>
      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{signal.summary}</p>
      {signal.entityName && <p className="mt-1 text-xs text-zinc-500">{signal.entityName}</p>}
    </div>
  );
}
