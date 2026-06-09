"use client";

import { useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { ASSOCIATE_TIERS, formatEur } from "@/app/lib/dues";
import CountrySelect from "@/app/components/CountrySelect";
import { applyMember, previewAgreement, type ApplyState } from "./actions";

const input = "rounded border border-rule bg-surface px-3 py-2 text-sm w-full";

export default function ApplyForm({
  agreementVersion,
  initialClass = "contributor",
}: {
  agreementVersion: string;
  initialClass?: "contributor" | "associate";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [cls, setCls] = useState<"contributor" | "associate">(initialClass);
  const [type, setType] = useState<"individual" | "organization">("individual");
  const [accepted, setAccepted] = useState(false);
  const [preview, setPreview] = useState<string>("");
  const [previewError, setPreviewError] = useState<string>("");
  const [previewing, startPreview] = useTransition();
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(
    applyMember,
    {},
  );

  /** Required-field check for step 1 (CountrySelect submits a hidden input, so
   * native validation can't see it — we check the values ourselves). */
  function step1Error(fd: FormData): string | null {
    const has = (k: string) => !!(fd.get(k) as string)?.trim();
    if (!has("legalName")) return "Enter the legal name.";
    if (!has("signerName")) return "Enter the signatory's name.";
    if (cls === "contributor" && type === "individual" && !has("countryOfResidence"))
      return "Select the country of residence.";
    if (cls === "associate") {
      if (!has("country")) return "Select the country.";
      if (!has("tier")) return "Choose an annual dues tier.";
    }
    return null;
  }

  function toReview() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const err = step1Error(fd);
    if (err) {
      setPreviewError(err);
      return;
    }
    setPreviewError("");
    const get = (k: string) => (fd.get(k) as string) || undefined;
    startPreview(async () => {
      const res = await previewAgreement({
        class: cls,
        type,
        legalName: get("legalName"),
        entityType: get("entityType"),
        jurisdiction: get("jurisdiction"),
        registeredAddress: get("registeredAddress"),
        countryOfResidence: get("countryOfResidence"),
        country: get("country"),
        signerName: get("signerName"),
        signerTitle: get("signerTitle"),
      });
      if (res.error || !res.html) {
        setPreviewError(res.error ?? "Could not render the agreement.");
        return;
      }
      setPreview(res.html);
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-8 max-w-2xl">
      <input type="hidden" name="class" value={cls} />

      {/* ── Step 1: your details ─────────────────────────────────────── */}
      <div className={step === 1 ? "grid gap-8" : "hidden"}>
        <fieldset className="grid gap-2">
          <legend className="tag mb-2">Membership</legend>
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
          {cls === "contributor" && (
            <div className="flex gap-4 text-sm mt-1">
              {(["individual", "organization"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2">
                  <input type="radio" checked={type === t} onChange={() => setType(t)} />
                  {t === "individual" ? "An individual" : "An organization"}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="grid gap-5 border-t border-rule pt-6">
          <legend className="tag mb-2">Your details</legend>

          {cls === "contributor" ? (
            <>
              <input type="hidden" name="type" value={type} />
              <Field
                label={type === "organization" ? "Organization legal name" : "Full legal name"}
                name="legalName"
                required
              />
              {type === "organization" ? (
                <>
                  <Field label="Entity type" name="entityType" placeholder="corporation / association / …" />
                  <Labeled label="Jurisdiction of formation">
                    <CountrySelect name="jurisdiction" />
                  </Labeled>
                  <Field label="Registered address" name="registeredAddress" />
                </>
              ) : (
                <Labeled label="Country of residence" required>
                  <CountrySelect name="countryOfResidence" required />
                </Labeled>
              )}
            </>
          ) : (
            <>
              <Field label="Organization legal name" name="legalName" required />
              <Labeled label="Country" required>
                <CountrySelect name="country" required />
              </Labeled>
              <Field label="Registered address" name="registeredAddress" />
              <Field label="VAT number (EU — enables reverse charge)" name="vatNumber" />
              <Labeled label="Annual dues tier" required>
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
              </Labeled>
              <fieldset className="grid gap-1 text-sm">
                <span className="font-medium">
                  Payment <Req />
                </span>
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
        </fieldset>

        {previewError && <p className="text-sm text-red-600">{previewError}</p>}

        <button type="button" className="btn btn-primary w-fit" onClick={toReview} disabled={previewing}>
          {previewing ? "Preparing…" : "Next — review the agreement"}
        </button>
      </div>

      {/* ── Step 2: review & sign ────────────────────────────────────── */}
      <div className={step === 2 ? "grid gap-6" : "hidden"}>
        <fieldset className="grid gap-3">
          <legend className="tag mb-2">Membership Agreement ({agreementVersion})</legend>
          <p className="text-sm text-muted">
            Review the personalised agreement below. A PDF copy will be emailed to
            you and is available any time from your account.
          </p>
          <div
            className="agreement-prose max-h-[28rem] overflow-y-auto rounded border border-rule bg-surface p-5"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </fieldset>

        <fieldset className="grid gap-3 border-t border-rule pt-6">
          <legend className="tag mb-2">Sign</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="socialAnnouncementConsent" defaultChecked className="mt-1" />
            <span>You may announce our membership on the Foundation&rsquo;s social networks.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="accept"
              required
              className="mt-1"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              I have read and accept the Membership Agreement shown above, and I am
              authorized to enter into it. <Req />
            </span>
          </label>

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}

          <div className="flex items-center gap-3 mt-1">
            <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} disabled={pending}>
              ← Back
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending || !accepted}>
              {pending
                ? "Submitting…"
                : cls === "associate"
                  ? "Sign & continue to payment"
                  : "Sign & join"}
            </button>
          </div>
        </fieldset>
      </div>
    </form>
  );
}

/** Required-field asterisk. */
function Req() {
  return (
    <span className="text-purple" aria-hidden="true">
      *
    </span>
  );
}

/** Label wrapper for non-`<input>` controls (selects, CountrySelect). */
function Labeled({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">
        {label} {required && <Req />}
      </span>
      {children}
    </label>
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
      <span className="font-medium">
        {label} {required && <Req />}
      </span>
      <input name={name} required={required} placeholder={placeholder} className={input} />
    </label>
  );
}
