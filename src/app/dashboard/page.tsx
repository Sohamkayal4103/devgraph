// page.tsx (/dashboard) — Authenticated home. Greets the user, lists all saved products, and offers an
// "Add new product" action. Protected by the Clerk proxy.
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { ProductList } from "@/components/product-list";

// DashboardPage: the signed-in landing screen (async server component, no params). Rendered at "/dashboard";
// the proxy guarantees auth. Greets by name, lists the user's products, and links to onboarding to add more.
export default async function DashboardPage() {
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
      </h1>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-zinc-600 dark:text-zinc-400">Your products</p>
        <Link
          href="/onboarding"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          + Add new product
        </Link>
      </div>

      <div className="mt-6">
        <ProductList />
      </div>

      <p className="mt-8 text-sm text-zinc-500">
        Next: DevGraph runs the research phase on each product to find the builders who&apos;ll adopt it.
      </p>
    </div>
  );
}
