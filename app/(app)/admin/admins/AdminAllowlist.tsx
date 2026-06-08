"use client";

import { useActionState } from "react";
import { addAdmin, removeAdmin, type AdminState } from "./actions";

export default function AdminAllowlist({
  entries,
}: {
  entries: { id: string; email: string }[];
}) {
  const [state, addAction, pending] = useActionState<AdminState, FormData>(
    addAdmin,
    {},
  );

  return (
    <div className="grid gap-6">
      <form action={addAction} className="flex flex-wrap items-end gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="admin@veranafoundation.org"
          className="rounded border border-rule bg-surface px-3 py-2 text-sm w-72"
        />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add admin"}
        </button>
        {state.error && <p className="text-sm text-red-600 w-full">{state.error}</p>}
        {state.ok && <p className="text-sm text-green-600 w-full">Added.</p>}
      </form>

      <ul className="grid gap-2">
        {entries.map((e) => (
          <li key={e.id} className="card flex items-center justify-between gap-3">
            <span className="text-sm">{e.email}</span>
            <form action={removeAdmin}>
              <input type="hidden" name="id" value={e.id} />
              <button
                type="submit"
                className="btn text-xs"
                disabled={entries.length <= 1}
              >
                Remove
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
