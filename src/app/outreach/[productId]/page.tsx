"use client";
// page.tsx (/outreach/[productId]) — The outreach phase. Optional sales-data upload, generate + select offers
// (grounded in the discovery report + sales notes + budgets), then run a campaign: generate messages carrying
// the selected offers, copy them, and request changes. Sending is copy-paste (always) or Orange Slice (optional).
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { extractTextFromFile } from "@/lib/parse-file";

// OutreachPage: the outreach screen for one product. No props; reads productId from the route. Rendered at
// /outreach/<id>; the Clerk proxy guarantees auth and every query enforces ownership.
export default function OutreachPage() {
  const params = useParams<{ productId: string }>();
  const productId = params.productId as Id<"products">;
  const product = useQuery(api.outreach.getProduct, { productId });
  const offers = useQuery(api.outreach.listOffers, { productId });
  const messages = useQuery(api.outreach.listMessages, { productId });

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← Back to dashboard
      </Link>

      {product === null && <p className="mt-8 text-sm text-zinc-500">Product not found.</p>}
      {product && (
        <>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            Outreach — <span className="text-indigo-600">{product.companyName}</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Generate deals, then write the messages that carry them.</p>

          <SalesData productId={productId} initial={product.salesNotes ?? ""} />
          <OffersSection productId={productId} generating={product.offersGenerating ?? false} offers={offers} />
          <CampaignSection offers={offers} />
          <MessagesSection messages={messages} />
        </>
      )}
    </div>
  );
}

// SalesData: optional sales report — upload a CSV/Excel/PDF (extracted to text for review) or paste directly.
// Params: productId, initial = any previously saved notes. Rendered by OutreachPage.
function SalesData({ productId, initial }: { productId: Id<"products">; initial: string }) {
  const save = useMutation(api.outreach.setSalesNotes);
  const [notes, setNotes] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileError, setFileError] = useState("");

  // onFile: read the chosen CSV/Excel/PDF, extract its text, and load it into the textarea for review.
  // Params: e = the file-input change event. Called when the user picks a file.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setFileError("");
    setSaved(false);
    try {
      setNotes(await extractTextFromFile(file));
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Couldn't read that file — try CSV/Excel or paste below.");
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  }

  return (
    <Section
      title="1 · Sales data (optional)"
      subtitle="Upload a CSV / Excel / PDF report, or paste — used to tailor current-customer offers"
    >
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
          {parsing ? "Reading file…" : "Upload file"}
          <input type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={onFile} className="hidden" />
        </label>
        <span className="text-xs text-zinc-400">CSV, Excel, or PDF — extracted text appears below for review</span>
      </div>
      {fileError && <p className="mb-2 text-xs text-red-500">{fileError}</p>}
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        rows={5}
        placeholder="…or paste customer usage / sales notes here"
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        onClick={async () => {
          await save({ productId, notes });
          setSaved(true);
        }}
        className="mt-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {saved ? "Saved ✓" : "Save sales data"}
      </button>
    </Section>
  );
}

// OffersSection: generate + list offers, each with a select checkbox. Params: productId, generating flag,
// offers list. Rendered by OutreachPage.
function OffersSection({
  productId,
  generating,
  offers,
}: {
  productId: Id<"products">;
  generating: boolean;
  offers: Doc<"offers">[] | undefined;
}) {
  const generate = useMutation(api.outreach.generateOffers);
  const customerOffers = (offers ?? []).filter((o) => o.targetType === "current_customer");
  const builderOffers = (offers ?? []).filter((o) => o.targetType === "builder");

  return (
    <Section
      title="2 · Offers"
      subtitle="Deals grounded in the discovery report (competitor pricing/feedback, your feedback) + your sales data + budgets"
    >
      <button
        onClick={() => generate({ productId })}
        disabled={generating}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {generating ? "Generating offers…" : (offers && offers.length ? "Regenerate offers" : "Generate offers")}
      </button>

      {offers && offers.length > 0 && (
        <div className="mt-4 space-y-4">
          {customerOffers.length > 0 && <OfferGroup label="For current customers" offers={customerOffers} />}
          {builderOffers.length > 0 && <OfferGroup label="For discovered builders" offers={builderOffers} />}
        </div>
      )}
    </Section>
  );
}

// OfferGroup: a labelled list of offer rows. Params: label, offers. Used by OffersSection.
function OfferGroup({ label, offers }: { label: string; offers: Doc<"offers">[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</h3>
      <div className="flex flex-col gap-2">
        {offers.map((o) => (
          <OfferRow key={o._id} offer={o} />
        ))}
      </div>
    </div>
  );
}

// OfferRow: one offer with a select checkbox. Params: offer. Used by OfferGroup.
function OfferRow({ offer }: { offer: Doc<"offers"> }) {
  const toggle = useMutation(api.outreach.toggleOffer);
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <input
        type="checkbox"
        checked={offer.selected}
        onChange={(e) => toggle({ offerId: offer._id, selected: e.target.checked })}
        className="mt-1 h-4 w-4 accent-indigo-600"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{offer.title}</span>
          <span className="text-xs text-zinc-400">· {offer.targetName}</span>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{offer.details}</p>
        <p className="mt-1 text-xs text-zinc-400">{offer.rationale}</p>
      </div>
    </label>
  );
}

// CampaignSection: per selected offer, pick a channel and generate a message. Params: offers. Rendered by OutreachPage.
function CampaignSection({ offers }: { offers: Doc<"offers">[] | undefined }) {
  const selected = (offers ?? []).filter((o) => o.selected);
  if (selected.length === 0) {
    return (
      <Section title="3 · Outreach campaign" subtitle="Select offers above to write messages for them">
        <p className="text-sm text-zinc-500">No offers selected yet.</p>
      </Section>
    );
  }
  return (
    <Section title="3 · Outreach campaign" subtitle="Generate a message for each selected offer">
      <div className="flex flex-col gap-2">
        {selected.map((o) => (
          <CampaignRow key={o._id} offer={o} />
        ))}
      </div>
    </Section>
  );
}

// CampaignRow: a selected offer with a channel picker + "Generate message" button. Params: offer. Used by CampaignSection.
function CampaignRow({ offer }: { offer: Doc<"offers"> }) {
  const generate = useAction(api.outreach.generateMessage);
  const [channel, setChannel] = useState<"linkedin" | "x" | "email">("email");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="min-w-0">
        <span className="text-sm font-medium">{offer.title}</span>
        <span className="ml-2 text-xs text-zinc-400">{offer.targetName}</span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as "linkedin" | "x" | "email")}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="email">Email</option>
          <option value="linkedin">LinkedIn</option>
          <option value="x">X / Twitter</option>
        </select>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await generate({ offerId: offer._id, channel });
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? "Writing…" : "Generate message"}
        </button>
      </div>
    </div>
  );
}

// MessagesSection: the generated messages, each copyable + revisable + pushable. Params: messages. Rendered by OutreachPage.
function MessagesSection({ messages }: { messages: Doc<"outreachMessages">[] | undefined }) {
  if (!messages || messages.length === 0) return null;
  return (
    <Section title="Generated messages" subtitle="Copy to send, or request changes (offers + meaning are preserved)">
      <div className="flex flex-col gap-3">
        {messages.map((m) => (
          <MessageCard key={m._id} message={m} />
        ))}
      </div>
    </Section>
  );
}

// MessageCard: one message with copy, a request-changes box, and the optional Orange Slice push. Params:
// message. Used by MessagesSection.
function MessageCard({ message }: { message: Doc<"outreachMessages"> }) {
  const revise = useAction(api.outreach.reviseMessage);
  const push = useAction(api.outreach.pushToOrangeSlice);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pushMsg, setPushMsg] = useState("");

  return (
    <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-medium">{message.targetName}</span>
          <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
            {message.channel}
          </span>
        </div>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <pre className="mt-3 whitespace-pre-wrap break-words rounded-md bg-zinc-50 p-3 font-sans text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        {message.content}
      </pre>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Request changes (e.g. make it shorter, warmer)…"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={async () => {
            if (!instruction.trim()) return;
            setBusy(true);
            try {
              await revise({ messageId: message._id, instruction });
              setInstruction("");
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? "Revising…" : "Request changes"}
        </button>
        <button
          onClick={async () => {
            try {
              await push({ messageId: message._id });
              setPushMsg("Pushed to Orange Slice ✓");
            } catch (e) {
              setPushMsg(e instanceof Error ? e.message : "Push failed");
            }
          }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Push to Orange Slice
        </button>
      </div>
      {pushMsg && <p className="mt-2 text-xs text-zinc-500">{pushMsg}</p>}
    </div>
  );
}

// Section: a titled block on the outreach page. Params: title, subtitle, children. Used throughout.
function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mb-4 mt-0.5 text-sm text-zinc-500">{subtitle}</p>
      {children}
    </section>
  );
}
