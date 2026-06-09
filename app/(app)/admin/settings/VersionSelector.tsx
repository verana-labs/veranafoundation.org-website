"use client";

import { useActionState } from "react";
import { activateAgreementVersion, type SettingsState } from "./actions";

type Option = { filename: string; version: string; selectable: boolean; note: string };

export default function VersionSelector({ options }: { options: Option[] }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    activateAgreementVersion,
    {},
  );
  const input = "rounded border border-rule bg-surface px-3 py-2 text-sm w-full";
  const anySelectable = options.some((o) => o.selectable);

  if (options.length === 0) {
    return <p className="text-sm text-muted mt-2">No other versions in legal/.</p>;
  }

  return (
    <form action={formAction} className="mt-2 grid gap-3 max-w-xl">
      <select name="filename" defaultValue="" required className={input}>
        <option value="" disabled>
          Choose a version…
        </option>
        {options.map((o) => (
          <option key={o.filename} value={o.filename} disabled={!o.selectable}>
            {o.filename} — {o.note}
          </option>
        ))}
      </select>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-600">Activated — this is now the active version.</p>}

      <button type="submit" className="btn btn-primary w-fit" disabled={pending || !anySelectable}>
        {pending ? "Activating…" : "Make this the Active version"}
      </button>
    </form>
  );
}
