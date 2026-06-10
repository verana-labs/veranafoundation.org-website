"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { ASSOCIATE_TIERS, formatEur } from "@/app/lib/dues";
import CountrySelect from "@/app/components/CountrySelect";
import PayMethodChooser from "@/app/components/PayMethodChooser";
import { applyMember, previewAgreement, type ApplyState } from "./actions";


export default function ApplyForm({
  agreementVersion,
  initialClass = "contributor",
  hasIndividual = false,
}: {
  agreementVersion: string;
  initialClass?: "contributor" | "associate";
  /** The signed-in user already holds an individual membership. */
  hasIndividual?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cls, setCls] = useState<"contributor" | "associate">(initialClass);
  const [type, setType] = useState<"individual" | "organization">(
    hasIndividual ? "organization" : "individual",
  );
  const [accepted, setAccepted] = useState(false);
  const [preview, setPreview] = useState<string>("");
  const [previewError, setPreviewError] = useState<string>("");
  const [previewing, startPreview] = useTransition();
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(
    applyMember,
    {},
  );
  const reviewRef = useRef<HTMLFieldSetElement>(null);
  const payRef = useRef<HTMLDivElement>(null);
  const acceptRef = useRef<HTMLSpanElement>(null);

  /** Scroll so `el` sits just below the sticky site header. */
  function scrollBelowHeader(el: HTMLElement) {
    const headerH =
      document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0;
    const y = el.getBoundingClientRect().top + window.scrollY - headerH - 12;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  // An Associate signature returns the invoice + pay link: show the payment step.
  useEffect(() => {
    if (state.success) setStep(3);
  }, [state.success]);

  // On reaching the review or payment step, scroll its title ("Membership
  // Agreement" / "Application signed") to just below the sticky site header.
  useEffect(() => {
    if (step === 2 && reviewRef.current) scrollBelowHeader(reviewRef.current);
    if (step === 3 && payRef.current) scrollBelowHeader(payRef.current);
  }, [step]);

  /** Flash the acceptance text twice (when the disabled Sign button is clicked). */
  function blinkAccept() {
    acceptRef.current?.animate(
      [{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }],
      { duration: 220, iterations: 2 },
    );
  }

  /** Required-field check for step 1 (CountrySelect submits a hidden input, so
   * native validation can't see it — we check the values ourselves). */
  /** Individuals sign as themselves — their legal name IS the signature. */
  const selfSigned = cls === "contributor" && type === "individual";

  function step1Error(fd: FormData): string | null {
    const has = (k: string) => !!(fd.get(k) as string)?.trim();
    if (!has("legalName")) return "Enter the legal name.";
    if (!selfSigned && !has("signerName")) return "Enter the signatory's name.";
    if (cls === "contributor") {
      if (type === "individual" && !has("countryOfResidence"))
        return "Select the country of residence.";
      if (type === "organization" && !has("jurisdiction")) return "Select the country.";
    }
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
        signerName: selfSigned ? get("legalName") : get("signerName"),
        signerTitle: get("signerTitle"),
      });
      if (res.error || !res.html) {
        setPreviewError(res.error ?? "Could not render the agreement.");
        return;
      }
      setPreview(res.html);
      setStep(2);
    });
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-8 max-w-2xl">
      <input type="hidden" name="class" value={cls} />

      {/* ── Step 1: your details ─────────────────────────────────────── */}
      <div className={step === 1 ? "grid gap-8" : "hidden"}>
        <fieldset className="grid gap-2">
          <SectionHeading tag="Membership" title="How will you join?" />
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
              {(["individual", "organization"] as const).map((t) => {
                const disabled = t === "individual" && hasIndividual;
                return (
                  <label
                    key={t}
                    className={`flex items-center gap-2 ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    title={disabled ? "You already have an individual membership." : undefined}
                  >
                    <input
                      type="radio"
                      checked={type === t}
                      disabled={disabled}
                      onChange={() => setType(t)}
                    />
                    {t === "individual" ? "An individual" : "An organization"}
                    {disabled && <span className="text-xs text-muted">(already a member)</span>}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <fieldset className="grid gap-1 border-t border-rule pt-8">
          <SectionHeading tag="Your details" title="Tell us who's joining" />

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
                  <Labeled label="Country" required>
                    <CountrySelect name="jurisdiction" required />
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
                <select name="tier" required defaultValue="">
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
              <p className="text-sm text-muted">
                After signing you&rsquo;ll receive an invoice, payable online or
                by bank transfer.
              </p>
            </>
          )}

          {/* Individuals sign as themselves — asking again would duplicate
              the "Full legal name" field; the server falls back to it. */}
          {!selfSigned && <Field label="Signed by (name)" name="signerName" required />}
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
        <fieldset ref={reviewRef} className="grid gap-3 scroll-mt-24">
          <SectionHeading
            tag={`Membership Agreement (${agreementVersion})`}
            title="Review your agreement"
          />
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
          <SectionHeading tag="Sign" title="Make it official" />
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
            <span ref={acceptRef}>
              I have read and accept the Membership Agreement shown above, and I am
              authorized to enter into it. <Req />
            </span>
          </label>

          {state.error && step === 2 && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}

          <div className="flex items-center gap-3 mt-1">
            <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} disabled={pending}>
              ← Back
            </button>
            <button
              type="submit"
              className={`btn btn-primary ${!accepted ? "opacity-50 cursor-not-allowed" : ""}`}
              disabled={pending}
              aria-disabled={!accepted}
              onClick={(e) => {
                if (!accepted) {
                  e.preventDefault();
                  blinkAccept();
                }
              }}
            >
              {pending
                ? "Submitting…"
                : cls === "associate"
                  ? "Sign & continue to payment"
                  : "Sign & join"}
            </button>
          </div>
        </fieldset>
      </div>

      {/* ── Step 3: payment (Associate) ──────────────────────────────── */}
      {state.success && (
        <div className={step === 3 ? "grid gap-8" : "hidden"}>
          <div ref={payRef} className="scroll-mt-24">
            <p className="tag mb-3">Application signed</p>
            <h2 className="display text-3xl sm:text-4xl leading-tight">
              One last step — payment
            </h2>
            <div className="accent-line mt-5" />
          </div>

          <p className="text-muted leading-relaxed max-w-prose">
            Thank you — the Membership Agreement for{" "}
            <strong className="text-ink">{state.success.memberName}</strong> is
            signed, and a copy is on its way to your inbox. Your Associate
            membership activates as soon as the annual dues are received.
          </p>

          <div className="card max-w-md">
            <p className="tag mb-4">
              <a
                href={`/account/invoice/${state.success.invoiceId}`}
                className="hover:text-purple"
                title="Download the invoice (PDF)"
              >
                Invoice {state.success.invoiceNumber} ↓
              </a>
            </p>
            <p className="display text-4xl">{state.success.amountDue}</p>
            <p className="text-sm text-muted mt-2">
              {state.success.vatNote ? (
                <>
                  {state.success.vatNote}
                  <br />
                </>
              ) : null}
              Due by {state.success.dueDate}
            </p>
            <PayMethodChooser
              payUrl={state.success.payUrl}
              bankDetails={state.success.bankDetails}
              invoiceNumber={state.success.invoiceNumber}
            />
          </div>

          <p className="text-sm text-muted">
            <a href="/account" className="text-purple hover:underline">
              Or pay later from your account →
            </a>
          </p>
        </div>
      )}
    </form>
  );
}

/** Contact-form-style section header (tag + display title), legal in a <legend>. */
function SectionHeading({ tag, title }: { tag: string; title: string }) {
  return (
    <legend className="grid gap-3 mb-5">
      <span className="tag">{tag}</span>
      <span className="display text-2xl text-ink">{title}</span>
    </legend>
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
    <div className="form-field">
      <label>
        {label} {required && <Req />}
      </label>
      {children}
    </div>
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
    <div className="form-field">
      <label htmlFor={name}>
        {label} {required && <Req />}
      </label>
      <input id={name} name={name} required={required} placeholder={placeholder} />
    </div>
  );
}
