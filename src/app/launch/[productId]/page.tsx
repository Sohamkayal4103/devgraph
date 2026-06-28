"use client";
// page.tsx (/launch/[productId]) — "Viral Launch-in-a-box": generate + view a coordinated multi-channel launch
// campaign for a product. Shows the core hook, a transparent reach->customers->CAC projection vs the CAC budgets,
// copy-ready assets per channel (with copy + push-to-Orange-Slice), and a launch-day-through-week calendar.
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";

// Per-channel accent (emoji + tone) for a bit of visual identity in the feed.
const CHANNEL_ACCENT: Record<string, { icon: string; tone: string }> = {
  x_thread: { icon: "𝕏", tone: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" },
  linkedin: { icon: "in", tone: "bg-[#0a66c2] text-white" },
  show_hn: { icon: "Y", tone: "bg-[#ff6600] text-white" },
  reddit: { icon: "r/", tone: "bg-[#ff4500] text-white" },
  product_hunt: { icon: "P", tone: "bg-[#da552f] text-white" },
  cold_email: { icon: "✉", tone: "bg-indigo-600 text-white" },
  ugc_video: { icon: "▶", tone: "bg-pink-600 text-white" },
};

// LaunchPage: generate + render a product's viral launch campaign. No props; productId from the route.
export default function LaunchPage() {
  const params = useParams<{ productId: string }>();
  const productId = params.productId as Id<"products">;
  const campaign = useQuery(api.launch.getLaunch, { productId });
  const product = useQuery(api.outreach.getProduct, { productId });
  const start = useMutation(api.launch.startLaunch);
  const [starting, setStarting] = useState(false);

  async function generate() {
    setStarting(true);
    try {
      await start({ productId });
    } finally {
      setStarting(false);
    }
  }

  const running = campaign?.status === "running" || starting;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← Back to dashboard
      </Link>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Viral launch{product ? <span className="text-indigo-600"> — {product.companyName}</span> : ""}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            A coordinated, copy-ready launch across every channel — grounded in your research, with a reach→CAC
            projection against your budgets.
          </p>
        </div>
        {campaign && campaign.status !== "running" && (
          <button
            onClick={generate}
            disabled={running}
            className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            {running ? "Generating…" : "Regenerate"}
          </button>
        )}
      </div>

      {campaign === undefined ? (
        <p className="mt-8 text-sm text-zinc-500">Loading…</p>
      ) : !campaign ? (
        <div className="mt-8 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Generate a full viral launch campaign for this product — X thread, LinkedIn, Show HN, Reddit, Product
            Hunt, cold email and a UGC video, plus a launch calendar and a reach→signups→CAC projection.
          </p>
          <button
            onClick={generate}
            disabled={running}
            className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {running ? "Generating…" : "Generate launch campaign"}
          </button>
        </div>
      ) : campaign.status === "running" ? (
        <div className="mt-8 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <p className="text-sm font-medium">Crafting your launch…</p>
          <p className="mt-1 text-xs text-zinc-500">
            Writing channel assets, the launch sequence, and the projection (~30–60s).
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-2 w-1/3 animate-pulse rounded-full bg-indigo-600" />
          </div>
        </div>
      ) : campaign.status === "error" ? (
        <p className="mt-8 text-sm text-red-500">Generation failed: {campaign.error}</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {campaign.hook && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/30">
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">The hook</p>
              <p className="mt-1 text-lg font-medium text-zinc-900 dark:text-zinc-100">{campaign.hook}</p>
            </div>
          )}

          {campaign.projection && (
            <Projection
              p={campaign.projection}
              individualBudget={product?.individualBudget}
              businessBudget={product?.businessBudget}
            />
          )}

          {campaign.channels && campaign.channels.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Channel assets</h2>
              <div className="mt-3 flex flex-col gap-4">
                {campaign.channels.map((ch, i) => (
                  <ChannelCard key={i} channel={ch} campaignId={campaign._id} index={i} />
                ))}
              </div>
            </div>
          )}

          {campaign.calendar && campaign.calendar.length > 0 && <Calendar steps={campaign.calendar} />}
        </div>
      )}
    </div>
  );
}

// Projection: the reach→signups→customers→CAC funnel + assumptions, with the CAC compared to the budgets. Params:
// p = projection, individualBudget/businessBudget = the product's CAC caps.
function Projection({
  p,
  individualBudget,
  businessBudget,
}: {
  p: NonNullable<Doc<"launchCampaigns">["projection"]>;
  individualBudget?: number;
  businessBudget?: number;
}) {
  const budgets = [individualBudget, businessBudget].filter((b): b is number => typeof b === "number" && b > 0);
  const lo = budgets.length ? Math.min(...budgets) : 0;
  const hi = budgets.length ? Math.max(...budgets) : 0;
  const underSome = budgets.length > 0 && p.blendedCac <= hi;
  const underAll = budgets.length > 0 && p.blendedCac <= lo;
  const cacAccent = budgets.length === 0 ? undefined : underSome ? "good" : "warn";
  const tiles = [
    { label: "Reach", value: `${fmt(p.reachLow)}–${fmt(p.reachHigh)}` },
    { label: "Signups", value: fmt(p.signups) },
    { label: "Customers", value: fmt(p.customers) },
    { label: "Blended CAC", value: `$${fmt(p.blendedCac)}`, accent: cacAccent },
  ];
  return (
    <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Projected launch impact</p>
      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        {tiles.map((t, i) => (
          <div key={t.label} className="flex items-center gap-2">
            <div className="min-w-[110px] rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
              <div
                className={`text-xl font-semibold tabular-nums ${
                  t.accent === "good" ? "text-green-600" : t.accent === "warn" ? "text-amber-600" : ""
                }`}
              >
                {t.value}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">{t.label}</div>
            </div>
            {i < tiles.length - 1 && <span className="text-zinc-300 dark:text-zinc-700">→</span>}
          </div>
        ))}
      </div>
      {budgets.length > 0 && (
        <p className={`mt-3 text-sm font-medium ${underSome ? "text-green-600" : "text-amber-600"}`}>
          {underAll
            ? `✓ Blended CAC ($${fmt(p.blendedCac)}) is within your CAC budget${budgets.length > 1 ? "s" : ""} (${budgets.map((b) => `$${fmt(b)}`).join(" / ")}).`
            : underSome
              ? `✓ Within your $${fmt(hi)} budget — but above $${fmt(lo)}; tighten targeting for the cheaper segment.`
              : `⚠ Blended CAC ($${fmt(p.blendedCac)}) exceeds your CAC budget${budgets.length > 1 ? "s" : ""} (${budgets.map((b) => `$${fmt(b)}`).join(" / ")}).`}
        </p>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Assumptions:</span> {p.assumptions}
      </p>
      {p.payback && <p className="mt-1 text-xs text-zinc-500">{p.payback}</p>}
      {p.notes && <p className="mt-1 text-xs text-zinc-400">{p.notes}</p>}
    </div>
  );
}

// ChannelCard: one channel's copy-ready asset, with copy + push-to-Orange-Slice. Params: channel, campaignId, index.
function ChannelCard({
  channel,
  campaignId,
  index,
}: {
  channel: NonNullable<Doc<"launchCampaigns">["channels"]>[number];
  campaignId: Id<"launchCampaigns">;
  index: number;
}) {
  const pushAsset = useAction(api.launch.pushAsset);
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");
  const [pushState, setPushState] = useState<"idle" | "pushing" | "done" | "error">("idle");
  const accent = CHANNEL_ACCENT[channel.channel] ?? { icon: "•", tone: "bg-zinc-700 text-white" };

  async function copy() {
    try {
      await navigator.clipboard.writeText(channel.content);
      setCopyState("done");
    } catch {
      setCopyState("error");
    }
    setTimeout(() => setCopyState("idle"), 1500);
  }
  async function push() {
    setPushState("pushing");
    try {
      await pushAsset({ campaignId, channelIndex: index });
      setPushState("done");
    } catch {
      setPushState("error");
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${accent.tone}`}>
          {accent.icon}
        </span>
        <span className="text-sm font-semibold">{channel.label}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
          {channel.audience}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={copy} className="text-xs font-medium text-indigo-600 hover:underline">
            {copyState === "done" ? "Copied!" : copyState === "error" ? "Copy failed" : "Copy"}
          </button>
          <button
            onClick={push}
            disabled={pushState === "pushing"}
            className="text-xs font-medium text-zinc-500 hover:text-indigo-600 disabled:opacity-50"
          >
            {pushState === "pushing"
              ? "Pushing…"
              : pushState === "done"
                ? "Pushed ✓"
                : pushState === "error"
                  ? "Retry push"
                  : "Push to Orange Slice"}
          </button>
        </div>
      </div>
      <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-zinc-700 dark:text-zinc-300">
        {channel.content}
      </pre>
      {channel.tip && (
        <p className="mt-3 text-xs text-zinc-500">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Tip:</span> {channel.tip}
        </p>
      )}
    </div>
  );
}

// Calendar: the ordered launch sequence. Params: steps. Used by LaunchPage.
function Calendar({ steps }: { steps: NonNullable<Doc<"launchCampaigns">["calendar"]> }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Launch sequence</h2>
      <ol className="mt-3 flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <span className="text-xs font-semibold tabular-nums text-indigo-600">{i + 1}</span>
            <div>
              <p className="text-sm font-medium">
                {s.when} · <span className="text-zinc-500">{s.channel}</span>
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{s.action}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// fmt: compact number formatting for projection tiles (1,200 / 12K / 1.2M). Params: n.
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString();
}
