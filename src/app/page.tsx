// page.tsx — Public landing page at "/". Pitches DevGraph, explains how it works, and routes visitors into sign-up.
import Link from "next/link";
import { Show, SignUpButton } from "@clerk/nextjs";

// The growth-loop steps shown in the "How it works" section.
const STEPS = [
  {
    icon: "🔎",
    title: "Discover & research",
    body: "One click runs 8 grounded stages in parallel — real competitors with cited public feedback, named B2B accounts each with a recent, dated buying signal, dev & campus communities, and real builders scored 0–100 (GitHub + Fiber).",
  },
  {
    icon: "🔁",
    title: "Feedback → your roadmap",
    body: "Turns that real, cited feedback into prioritized, shippable features — shared straight back with your engineering and GTM teams. Real complaints become your roadmap.",
  },
  {
    icon: "🎯",
    title: "Acquire & make the deal",
    body: "Budget-aware deals and copy-ready outreach for LinkedIn, X, or email — one click pushes the deal + message into Orange Slice.",
  },
  {
    icon: "🧩",
    title: "Prove adoption from code",
    body: "Scan a hackathon (Devpost → GitHub SBOM) to see exactly who integrated your SDK vs a competitor's — plus a tech-ecosystem graph of where you fit. Receipts, not vibes.",
  },
  {
    icon: "📡",
    title: "Retain in real time",
    body: "Live signals via Fiber Tracker — funding, hiring, new tech, layoffs — split into expansion vs churn-risk, so you act the moment one fires.",
  },
  {
    icon: "🚀",
    title: "Launch",
    body: "Viral Launch-in-a-box writes your entire multi-channel launch in ~40 seconds — X, LinkedIn, Show HN, Reddit, Product Hunt, email, UGC — with a transparent reach→CAC projection.",
  },
];

// Home: the marketing landing page. No params. Rendered at "/" for everyone; the CTA opens the Clerk sign-up modal
// for new visitors, or links to the dashboard for users who are already signed in. Includes a "How it works" section.
export default function Home() {
  return (
    <div>
      {/* Hero */}
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 py-28 text-center">
        <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-800">
          Adoption intelligence for devtools
        </span>
        <h1 className="text-5xl font-semibold leading-tight tracking-tight">
          The growth team for <span className="text-indigo-600">every devtool</span>.
        </h1>
        <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          DevGraph finds the builders who&apos;ll actually adopt your SDK, scores who will reach production, and
          converts them with the right deal — before they churn.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <button className="rounded-md bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500">
                Get started — it&apos;s free
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="rounded-md bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Go to dashboard
            </Link>
          </Show>
          <a
            href="#how"
            className="rounded-md border border-zinc-300 px-6 py-3 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            How it works
          </a>
        </div>
      </div>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-5xl scroll-mt-24 px-6 pb-28">
        <h2 className="text-center text-3xl font-semibold tracking-tight">How it works</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-600 dark:text-zinc-400">
          Describe your product once. DevGraph runs your entire growth loop — grounded in real, cited data, not
          generic AI filler.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-xl border border-zinc-200 p-6 text-left dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{s.icon}</span>
                <span className="text-xs font-medium tabular-nums text-zinc-300 dark:text-zinc-700">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{s.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-zinc-500">
          Every claim is grounded in live web search and cited · every send is button-only · all keys live
          server-side · reactive &amp; multi-tenant on Convex.
        </p>

        <div className="mt-10 flex justify-center">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <button className="rounded-md bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500">
                Run it on your product — free
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="rounded-md bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Go to dashboard
            </Link>
          </Show>
        </div>
      </section>
    </div>
  );
}
