"use client";

import { useState } from "react";

/**
 * Payment-method picker for an issued dues invoice, used on the apply wizard's
 * payment step and the account "dues pending" card. Nothing is preselected:
 * the pay button (card) or the wire instructions (bank transfer) only appear
 * after a choice, so members consciously pick a path. Options self-hide when
 * unavailable (no Stripe key → no card; no BANK_TRANSFER_DETAILS → no bank).
 */
export default function PayMethodChooser({
  payUrl,
  bankDetails,
  invoiceNumber,
}: {
  payUrl: string | null;
  bankDetails: string | null;
  invoiceNumber: string;
}) {
  const [method, setMethod] = useState<"card" | "bank" | null>(null);

  const options = [
    payUrl && { id: "card" as const, label: "Card", hint: "Pay online now — activates immediately" },
    bankDetails && { id: "bank" as const, label: "Bank transfer", hint: "Wire from your bank — activates on receipt" },
  ].filter(Boolean) as { id: "card" | "bank"; label: string; hint: string }[];

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted mt-4">
        Payment instructions are in the email we sent you.
      </p>
    );
  }

  return (
    <div className="mt-6 grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium mb-2">
          How would you like to pay?
        </legend>
        <div className="grid sm:grid-cols-2 gap-3">
          {options.map((o) => {
            const selected = method === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setMethod(o.id)}
                aria-pressed={selected}
                className={`text-left rounded-lg border p-4 transition-colors ${
                  selected
                    ? "border-purple bg-surface"
                    : "border-rule hover:border-purple/50"
                }`}
              >
                <span className="block font-medium text-sm">
                  <span
                    aria-hidden="true"
                    className={`inline-block w-3 h-3 mr-2 rounded-full border align-baseline ${
                      selected ? "border-purple bg-purple" : "border-rule"
                    }`}
                  />
                  {o.label}
                </span>
                <span className="block text-xs text-muted mt-1">{o.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {method === "card" && payUrl && (
        <a href={payUrl} className="btn btn-primary w-full justify-center">
          Pay membership dues
        </a>
      )}

      {method === "bank" && bankDetails && (
        <div className="rounded-lg border border-rule bg-surface p-4 text-sm">
          <p className="font-medium mb-2">Wire the amount to:</p>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
            {bankDetails}
          </pre>
          <p className="text-xs text-muted mt-3 leading-relaxed">
            Use <strong className="text-ink">{invoiceNumber}</strong> as the
            payment reference. Your membership activates automatically once the
            transfer arrives (typically 1–2 business days) — we&rsquo;ll email a
            receipt.
          </p>
        </div>
      )}
    </div>
  );
}
