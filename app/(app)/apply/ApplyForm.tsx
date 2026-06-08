"use client";

import { useActionState, useState } from "react";
import { ASSOCIATE_TIERS, formatEur } from "@/app/lib/dues";
import { applyMember, type ApplyState } from "./actions";

const input = "rounded border border-rule bg-surface px-3 py-2 text-sm w-full";

export default function ApplyForm({
  agreementUrl,
  agreementVersion,
}: {
  agreementUrl: string;
  agreementVersion: string;
}) {
  const [cls, setCls] = useState<"contributor" | "associate">("contributor");
  const [type, setType] = useState<"individual" | "organization">("individual");
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(
    applyMember,
    {},
  );

  return (
    <form action={formAction} className="grid gap-5 max-w-xl">
      <input type="hidden" name="class" value={cls} />

      <fieldset className="grid gap-2">
        <legend className="font-medium mb-1">Membership</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={cls === "contributor"} onChange={() => setCls("contributor")} />
            Contributor — free
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={cls === "associate"} onChange={() => setCls("associate")} />
            Associate — supporting (dues)
          </label>
        </div>
      </fieldset>

      {cls === "contributor" ? (
        <>
          <input type="hidden" name="type" value={type} />
          <div className="flex gap-4 text-sm">
            {(["individual", "organization"] as const).map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input type="radio" checked={type === t} onChange={() => setType(t)} />
                {t === "individual" ? "An individual" : "An organization"}
              </label>
            ))}
          </div>
          <Field label={type === "organization" ? "Organization legal name" : "Full legal name"} name="legalName" required />
          {type === "organization" ? (
            <>
              <Field label="Entity type" name="entityType" placeholder="corporation / association / …" />
              <Field label="Jurisdiction of formation" name="jurisdiction" />
              <Field label="Registered address" name="registeredAddress" />
            </>
          ) : (
            <Field label="Country of residence" name="countryOfResidence" required />
          )}
        </>
      ) : (
        <>
          <Field label="Organization legal name" name="legalName" required />
          <Field label="Country (2-letter code)" name="country" placeholder="EE" required />
          <Field label="Registered address" name="registeredAddress" />
          <Field label="VAT number (EU — enables reverse charge)" name="vatNumber" />
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Annual dues tier</span>
            <select name="tier" required defaultValue="" className={input}>
              <option value="" disabled>
                Choose by headcount…
              </option>
              {ASSOCIATE_TIERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} — {formatEur(t.amount)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="grid gap-1 text-sm">
            <span className="font-medium">Payment</span>
            <label className="flex items-center gap-2">
              <input type="radio" name="payMethod" value="bank_transfer" defaultChecked />
              Bank transfer (we&rsquo;ll send an invoice)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="payMethod" value="card" />
              Card
            </label>
          </fieldset>
        </>
      )}

      <Field label="Signed by (name)" name="signerName" required />
      {(cls === "associate" || type === "organization") && (
        <Field label="Title" name="signerTitle" />
      )}

      <div className="grid gap-1 text-sm">
        <span className="font-medium">Membership Agreement ({agreementVersion})</span>
        <iframe src={agreementUrl} title="Membership Agreement" className="w-full h-72 rounded border border-rule" />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="socialAnnouncementConsent" className="mt-1" />
        <span>You may announce our membership on the Foundation&rsquo;s social networks.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept" required className="mt-1" />
        <span>I have read and accept the Membership Agreement, and I am authorized to enter into it.</span>
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" className="btn btn-primary w-fit" disabled={pending}>
        {pending ? "Submitting…" : cls === "associate" ? "Sign & continue to payment" : "Sign & join"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input name={name} required={required} placeholder={placeholder} className={input} />
    </label>
  );
}
