// site-header.tsx — Global top nav: brand + auth controls. Shows Log in / Sign up when logged out,
// and a Dashboard link + Clerk user menu when logged in.
import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

// SiteHeader: the persistent header rendered by the root layout on every page. No params.
// Clerk's <Show when="signed-in|signed-out"> swaps the controls based on auth state; the buttons open modals.
export function SiteHeader() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Dev<span className="text-indigo-600">Graph</span>
      </Link>
      <nav className="flex items-center gap-3">
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
              Log in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              Sign up
            </button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <Link
            href="/dashboard"
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Dashboard
          </Link>
          <UserButton />
        </Show>
      </nav>
    </header>
  );
}
