"use client";

import { useActionState } from "react";
import { addAdmin, removeAdmin, type AdminState } from "./actions";

type Entry = {
  id: string;
  email: string;
  addedByUserId: string | null;
  addedAt: string;
};

export default function AdminAllowlist({
  entries,
  currentEmail,
}: {
  entries: Entry[];
  currentEmail: string;
}) {
  const [state, addAction, pending] = useActionState<AdminState, FormData>(
    addAdmin,
    {},
  );

  return (
    <div className="grid gap-12">
      {/* Add an Admin */}
      <section>
        <h2 className="display text-2xl mb-6">Add an Admin</h2>
        <form action={addAction} className="space-y-1 max-w-md">
          <div className="form-field">
            <label htmlFor="admin-email">
              Admin email <span className="req">*</span>
            </label>
            <input
              id="admin-email"
              name="email"
              type="email"
              required
              placeholder="admin@veranafoundation.org"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Adding…" : "Add admin"}
          </button>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state.ok && <p className="text-sm text-green-600">Added.</p>}
        </form>
      </section>

      {/* Admins list */}
      <section>
        <h2 className="display text-2xl mb-6">Admins</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="p-2">Email</th>
                <th className="p-2">Added by user id</th>
                <th className="p-2">Added at</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const isSelf = e.email === currentEmail;
                return (
                  <tr key={e.id} className="border-t border-rule">
                    <td className="p-2">
                      {e.email}
                      {isSelf && <span className="badge ml-2">you</span>}
                    </td>
                    <td className="p-2 text-muted font-mono text-xs">
                      {e.addedByUserId ?? "—"}
                    </td>
                    <td className="p-2 text-muted whitespace-nowrap">{e.addedAt}</td>
                    <td className="p-2">
                      {isSelf ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <form action={removeAdmin}>
                          <input type="hidden" name="id" value={e.id} />
                          <button type="submit" className="text-purple hover:underline">
                            remove
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
