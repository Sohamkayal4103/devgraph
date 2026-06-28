"use client";
// product-list.tsx — Lists the signed-in user's products from Convex (a live query) as cards, each with a
// delete action. Client component so it can use Convex React hooks.
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";

// ProductList: renders one card per saved product (live from Convex), or a prompt to add the first one. No
// params. Rendered by the dashboard page.
export function ProductList() {
  const products = useQuery(api.products.list);
  const removeProduct = useMutation(api.products.remove);

  // useQuery returns undefined until the first result arrives — show a placeholder during that load.
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

// ProductCard: one product's details + the two CAC budgets + a delete button. Params: product = the Convex
// document, onDelete = handler to remove it. Called by ProductList for each item.
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
        <button
          onClick={onDelete}
          className="text-sm font-medium text-zinc-400 hover:text-red-500"
        >
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
    </div>
  );
}

// Stat: a small budget tile. Params: label = caption text, value = dollar amount. Called by ProductCard to
// render each of the two CAC budgets.
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-zinc-50 p-4 dark:bg-zinc-900">
      <div className="text-2xl font-semibold">${value.toLocaleString()}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}
