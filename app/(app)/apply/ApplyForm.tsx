"use client";

import { useActionState, useState } from "react";
import { applyContributor, type ApplyState } from "./actions";

export default function ApplyForm({
  agreementUrl,
  agreementVersion,
}: {
  agreementUrl: string;
  agreementVersion: string;
}) {
  const [type, setType] = useState<"individual" | "organization">("individual");
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(
    applyContributor,
    {},
  );

  const input =
    "rounded border border-rule bg-surface px-3 py-2 text-sm w-full";

  return (
    <form action={formAction} className="grid gap-5 max-w-xl">
      <fieldset className="grid gap-2">
        <legend className="font-medium mb-1">I&rsquo;m applying as</legend>
        <div className="flex gap-4 text-sm">
          {(["individual", "organization"] as const).map((t) => (
            <label key={t} className="flex items-center gap-2">
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
              />
              {t === "individual" ? "An individual" : "An organization"}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">
          {type === "organization" ? "Organization legal name" : "Full legal name"}
        </span>
        <input name="legalName" required className={input} />
      </label>

      {type === "organization" ? (
        <>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Entity type</span>
            <input
              name="entityType"
              placeholder="corporation / association / …"
              className={input}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Jurisdiction of formation</span>
            <input name="jurisdiction" className={input} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Registered address</span>
            <input name="registeredAddress" className={input} />
          </label>
        </>
      ) : (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Country of residence</span>
          <input name="countryOfResidence" required className={input} />
        </label>
      )}

      <div className="grid gap-1 text-sm">
        <span className="font-medium">Membership Agreement ({agreementVersion})</span>
        <iframe
          src={agreementUrl}
          title="Membership Agreement"
          className="w-full h-80 rounded border border-rule"
        />
      </div>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Signed by (name)</span>
        <input name="signerName" required className={input} />
      </label>
      {type === "organization" && (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Title</span>
          <input name="signerTitle" className={input} />
        </label>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="socialAnnouncementConsent" className="mt-1" />
        <span>
          You may announce our membership on the Foundation&rsquo;s social networks.
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept" required className="mt-1" />
        <span>
          I have read and accept the Membership Agreement, and I am authorized to
          enter into it.
        </span>
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" className="btn btn-primary w-fit" disabled={pending}>
        {pending ? "Signing…" : "Sign & join"}
      </button>
    </form>
  );
}
