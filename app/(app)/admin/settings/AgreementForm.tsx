"use client";

import { useActionState } from "react";
import { setAgreement, type SettingsState } from "./actions";

export default function AgreementForm({
  current,
}: {
  current: { version: string; url: string; hash: string | null } | null;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    setAgreement,
    {},
  );
  const input = "rounded border border-rule bg-surface px-3 py-2 text-sm w-full";

  return (
    <form action={formAction} className="grid gap-4 max-w-xl">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Version</span>
        <input
          name="version"
          required
          defaultValue={current?.version}
          placeholder="v1"
          className={input}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">PDF URL</span>
        <input
          name="url"
          type="url"
          required
          defaultValue={current?.url}
          placeholder="https://…/membership-agreement.pdf"
          className={input}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Integrity hash (optional)</span>
        <input name="hash" defaultValue={current?.hash ?? ""} className={input} />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-600">Saved — new version is now active.</p>}

      <button type="submit" className="btn btn-primary w-fit" disabled={pending}>
        {pending ? "Saving…" : "Publish as active version"}
      </button>
    </form>
  );
}
