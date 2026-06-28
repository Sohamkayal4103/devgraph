// page.tsx — Public landing page at "/". Pitches DevGraph and routes visitors into sign-up.
import Link from "next/link";
import { Show, SignUpButton } from "@clerk/nextjs";

// Home: the marketing landing page. No params. Rendered at "/" for everyone; the CTA opens the Clerk
// sign-up modal for new visitors, or links to the dashboard for users who are already signed in.
export default function Home() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 py-28 text-center">
      <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-800">
        Adoption intelligence for devtools
      </span>
      <h1 className="text-5xl font-semibold leading-tight tracking-tight">
        The growth team for{" "}
        <span className="text-indigo-600">every devtool</span>.
      </h1>
      <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        DevGraph finds the builders who&apos;ll actually adopt your SDK, scores who
        will reach production, and converts them with the right deal — before they
        churn.
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
  );
}
