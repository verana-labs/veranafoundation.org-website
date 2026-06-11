"use client";

import { useActionState } from "react";
import { updateDisplayName, type SettingsState } from "./actions";

export default function SettingsForm({
  displayName,
  providerName,
}: {
  displayName: string | null;
  providerName: string | null;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateDisplayName,
    {},
  );

  return (
    <form action={action} className="max-w-md">
      <div className="form-field">
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={displayName ?? ""}
          placeholder={providerName ?? "Your name"}
          maxLength={80}
        />
      </div>
      <p className="text-sm text-muted mt-1">
        Shown on working-group pages, attendance lists and published minutes.
        Leave empty to use the name from your sign-in provider
        {providerName ? ` (${providerName})` : ""}.
      </p>
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      {state.ok && !pending && (
        <p className="text-sm mt-3" style={{ color: "var(--color-green)" }}>
          Saved.
        </p>
      )}
      <button type="submit" className="btn btn-primary text-sm mt-4" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
