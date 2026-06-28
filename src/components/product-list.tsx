"use client";
// product-list.tsx — The dashboard's product view (live Convex queries). Renders an account-wide pipeline funnel
// (discovered → offers → outreach → adopters) over all products, then one card per product with its budgets,
// a research control, a per-product pipeline strip, and quick links into each stage (report/outreach/improve/graph).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";

// Per-product pipeline stats, a structural subset of one api.dashboard.overview row.
type PipelineStats = {
  productId: Id<"products">;
  reportId: Id<"reports"> | null;
  discoveryStatus: string;
  builders: number;
  businesses: number;
  universities: number;
  competitors: number;
  teamsScanned: number;
  integrated: number;
  offersTotal: number;
  offersSelected: number;
  messages: number;
  featuresCount: number;
};

// ProductList: the account funnel + one card per saved product (all live from Convex), or a prompt to add the
// first one. No params. Rendered by the dashboard page.
export function ProductList() {
  const products = useQuery(api.products.list);
  const overview = useQuery(api.dashboard.overview);
  const removeProduct = useMutation(api.products.remove);

  if (products === undefined) {
    return <p className="text-sm text-zinc-500">Loading your products…</p>;
  }

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
        <p className="text-zinc-600 dark:text-zinc-400">You haven&apos;t added a product yet.</p>
        <Link
          href="/onboarding"
          className="mt-3 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Add your first product
        </Link>
      </div>
    );
  }

  const statsById = new Map<string, PipelineStats>((overview?.rows ?? []).map((r) => [r.productId, r]));

  return (
    <div className="flex flex-col gap-6">
      {overview && <PipelineFunnel agg={overview.agg} />}
      <div className="flex flex-col gap-4">
        {products.map((product) => (
          <ProductCard
            key={product._id}
            product={product}
            stats={statsById.get(product._id)}
            onDelete={() => removeProduct({ id: product._id })}
          />
        ))}
      </div>
    </div>
  );
}

// PipelineFunnel: the account-wide scoreboard — four pipeline stages with their running totals. Params: agg =
// the aggregate from api.dashboard.overview. Called by ProductList.
function PipelineFunnel({
  agg,
}: {
  agg: { discovered: number; offers: number; messages: number; integrated: number };
}) {
  const stages = [
    { label: "Prospects discovered", value: agg.discovered, hint: "builders, companies, campuses + teams" },
    { label: "Offers selected", value: agg.offers, hint: "deals you chose to run" },
    { label: "Outreach drafted", value: agg.messages, hint: "messages ready to send" },
    { label: "Adopters confirmed", value: agg.integrated, hint: "teams found using your SDK" },
  ];
  return (
    <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Your growth pipeline</p>
      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="min-w-[140px] rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
              <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
              <div className="mt-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">{s.label}</div>
              <div className="text-[11px] text-zinc-400">{s.hint}</div>
            </div>
            {i < stages.length - 1 && <span className="text-zinc-300 dark:text-zinc-700">→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ProductCard: one product's details, budgets, research control, pipeline strip, and stage links. Params:
// product = the Convex doc, stats = its pipeline counts (undefined while loading), onDelete. Called by ProductList.
function ProductCard({
  product,
  stats,
  onDelete,
}: {
  product: Doc<"products">;
  stats: PipelineStats | undefined;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{product.companyName}</h2>
          {product.website && (
            <a
              href={product.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-600 hover:underline"
            >
              {product.website}
            </a>
          )}
        </div>
        <button onClick={onDelete} className="text-sm font-medium text-zinc-400 hover:text-red-500">
          Delete
        </button>
      </div>
      <p className="mt-4 text-zinc-700 dark:text-zinc-300">{product.productDescription}</p>
      {product.targetCustomer && (
        <p className="mt-3 text-sm text-zinc-500">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Ideal customer:</span>{" "}
          {product.targetCustomer}
        </p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Stat label="Budget / developer" value={product.individualBudget} />
        <Stat label="Budget / business" value={product.businessBudget} />
      </div>

      {stats && <PipelineStrip productId={product._id} stats={stats} />}

      <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-800/60">
        <ResearchSection productId={product._id} />
      </div>
    </div>
  );
}

// PipelineStrip: a product's per-stage counts as chips, plus quick links into each stage. Params: productId,
// stats = the product's pipeline counts. Called by ProductCard once any stage has data.
function PipelineStrip({ productId, stats }: { productId: Id<"products">; stats: PipelineStats }) {
  const chips = [
    { label: "Builders", value: stats.builders },
    { label: "Companies", value: stats.businesses },
    { label: "Campuses", value: stats.universities },
    { label: "Teams scanned", value: stats.teamsScanned },
    { label: "Integrated", value: stats.integrated, accent: stats.integrated > 0 },
    { label: "Offers", value: `${stats.offersSelected}/${stats.offersTotal}` },
    { label: "Messages", value: stats.messages },
  ];
  const hasData =
    stats.builders > 0 || stats.businesses > 0 || stats.universities > 0 ||
    stats.teamsScanned > 0 || stats.offersTotal > 0 || stats.messages > 0;
  return (
    <div className="mt-5 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/60">
      {hasData && (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {chips.map((c) => (
            <div key={c.label} className="text-sm">
              <span
                className={`font-semibold tabular-nums ${c.accent ? "text-green-600" : ""}`}
              >
                {c.value}
              </span>{" "}
              <span className="text-zinc-500">{c.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className={`flex flex-wrap gap-3 text-sm font-medium ${hasData ? "mt-3" : ""}`}>
        {stats.reportId && (
          <Link href={`/report/${stats.reportId}`} className="text-indigo-600 hover:underline">
            Report →
          </Link>
        )}
        <Link href={`/outreach/${productId}`} className="text-indigo-600 hover:underline">
          Outreach →
        </Link>
        <Link href={`/improve/${productId}`} className="text-indigo-600 hover:underline">
          Improve →
        </Link>
        <Link href={`/graph/${productId}`} className="text-indigo-600 hover:underline">
          Graph →
        </Link>
        <Link href={`/signals/${productId}`} className="text-indigo-600 hover:underline">
          Signals →
        </Link>
        <Link href={`/launch/${productId}`} className="text-indigo-600 hover:underline">
          Launch →
        </Link>
      </div>
    </div>
  );
}

// ResearchSection: the discovery/research control for one product. Params: productId. Reads the latest report
// live; shows "Begin research", a progress bar while running, or "View report" when complete. Called by ProductCard.
function ResearchSection({ productId }: { productId: Id<"products"> }) {
  const report = useQuery(api.research.getLatestReport, { productId });
  const startResearch = useMutation(api.research.startResearch);
  // Track "now" in state via async ticks so render stays pure (no Date.now() in render, no sync setState in the
  // effect). A running report older than the 600s action cap was killed mid-flight — surface a restart.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t0 = setTimeout(tick, 0);
    const t = setInterval(tick, 30000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);
  const isStale = !!report && report.status === "running" && now > 0 && now - report.startedAt > 11 * 60 * 1000;

  if (report === undefined) {
    return <p className="text-xs text-zinc-400">Loading research status…</p>;
  }

  // No report yet, or the last run errored — offer to (re)start.
  if (!report || report.status === "error") {
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Discovery &amp; research</p>
          {report?.status === "error" && (
            <p className="mt-0.5 text-xs text-red-500">Last run failed: {report.error}</p>
          )}
        </div>
        <button
          onClick={() => startResearch({ productId })}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {report?.status === "error" ? "Retry research" : "Begin research phase"}
        </button>
      </div>
    );
  }

  // Running — show a live progress bar + current stage.
  if (report.status === "running") {
    return (
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Research in progress…</span>
          <span className="text-zinc-500">{report.progress}%</span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">{report.stage}</p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-2 rounded-full bg-indigo-600 transition-all duration-500"
            style={{ width: `${report.progress}%` }}
          />
        </div>
        {isStale && (
          <button
            onClick={() => startResearch({ productId })}
            className="mt-3 text-xs font-medium text-indigo-600 hover:underline"
          >
            Taking too long? Restart research
          </button>
        )}
      </div>
    );
  }

  // Complete — link to the report, with the option to re-run.
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-green-600">✓ Research complete</span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => startResearch({ productId })}
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Re-run
        </button>
        <Link
          href={`/report/${report._id}`}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          View report
        </Link>
      </div>
    </div>
  );
}

// Stat: a small budget tile. Params: label = caption text, value = dollar amount. Called by ProductCard.
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-zinc-50 p-4 dark:bg-zinc-900">
      <div className="text-2xl font-semibold">${value.toLocaleString()}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}
