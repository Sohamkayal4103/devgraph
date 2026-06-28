"use client";
// product-list.tsx — Lists the signed-in user's products from Convex (a live query) as cards. Each card has a
// delete action and a discovery/research section (begin research, live progress, view report).
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";

// ProductList: renders one card per saved product (live from Convex), or a prompt to add the first one. No
// params. Rendered by the dashboard page.
export function ProductList() {
  const products = useQuery(api.products.list);
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

  return (
    <div className="flex flex-col gap-4">
      {products.map((product) => (
        <ProductCard
          key={product._id}
          product={product}
          onDelete={() => removeProduct({ id: product._id })}
        />
      ))}
    </div>
  );
}

// ProductCard: one product's details, budgets, a delete button, and its research section. Params: product =
// the Convex document, onDelete = handler to remove it. Called by ProductList for each item.
function ProductCard({ product, onDelete }: { product: Doc<"products">; onDelete: () => void }) {
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

      <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-800/60">
        <ResearchSection productId={product._id} />
      </div>
    </div>
  );
}

// ResearchSection: the discovery/research control for one product. Params: productId. Reads the latest report
// live; shows "Begin research", a progress bar while running, or "View report" when complete. Called by ProductCard.
function ResearchSection({ productId }: { productId: Id<"products"> }) {
  const report = useQuery(api.research.getLatestReport, { productId });
  const startResearch = useMutation(api.research.startResearch);

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
