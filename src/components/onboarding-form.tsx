"use client";
// onboarding-form.tsx — The product profile form: company + product + the two CAC budgets. Client component;
// each submit inserts a new product into Convex via the createProduct mutation.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

// OnboardingForm: collects one product's details and acquisition budgets. No params. Rendered by the
// /onboarding page. On submit it inserts a new product (Convex mutation) and routes to /dashboard.
export function OnboardingForm() {
  const router = useRouter();
  const createProduct = useMutation(api.products.create);
  const [saving, setSaving] = useState(false);

  // handleSubmit: reads the form fields and inserts a new product into Convex, then navigates to the dashboard.
  // Params: e = the form submit event. Called when the user clicks "Add product".
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const data = new FormData(e.currentTarget);
    await createProduct({
      companyName: String(data.get("companyName") || ""),
      website: String(data.get("website") || ""),
      docsLink: data.get("docsLink") ? String(data.get("docsLink")) : undefined,
      productDescription: String(data.get("productDescription") || ""),
      targetCustomer: String(data.get("targetCustomer") || ""),
      individualBudget: Number(data.get("individualBudget") || 0),
      businessBudget: Number(data.get("businessBudget") || 0),
    });
    router.push("/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field label="Company / product name" name="companyName" placeholder="Acme API" required />
      <Field label="Website" name="website" type="url" placeholder="https://acme.dev" />
      <Field
        label="Docs / llms.txt link for AI agents (optional)"
        name="docsLink"
        type="url"
        placeholder="https://docs.acme.dev/llms.txt"
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="productDescription" className="text-sm font-medium">
          What does your product do?
        </label>
        <textarea
          id="productDescription"
          name="productDescription"
          required
          rows={4}
          placeholder="One or two sentences — DevGraph expands this into who should adopt it."
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <Field
        label="Who is your ideal customer? (optional)"
        name="targetCustomer"
        placeholder="e.g. AI infra startups, indie hackers"
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Budget to acquire one developer ($)" name="individualBudget" type="number" placeholder="50" />
        <Field label="Budget to acquire one business ($)" name="businessBudget" type="number" placeholder="500" />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="mt-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Add product"}
      </button>
    </form>
  );
}

// Field: a small labeled single-line input reused across the form. Params: label, name, and optional
// type/placeholder/required. Called by OnboardingForm for each text/number/url field.
function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
    </div>
  );
}
