"use client";

import { useActionState, useState } from "react";
import { addAccess, removeAccess, changeRole, type AccessState } from "./actions";

type Entry = {
  id: string;
  email: string;
  role: "manager" | "representative";
  status: "invited" | "active" | "removed";
};

export default function AccessManager({
  memberId,
  admins,
  representatives,
  lastAdminId,
}: {
  memberId: string;
  admins: Entry[];
  representatives: Entry[];
  /** The sole remaining admin (if any) — its remove/demote is disabled. */
  lastAdminId: string | null;
}) {
  const [state, addAction, pending] = useActionState<AccessState, FormData>(
    addAccess,
    {},
  );

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="display text-xl">Add someone</h2>
        <form action={addAction} className="space-y-1 mt-3 max-w-md">
          <input type="hidden" name="memberId" value={memberId} />
          <div className="form-field">
            <label htmlFor="access-email">
              Email <span className="req">*</span>
            </label>
            <input id="access-email" name="email" type="email" required placeholder="person@org.com" />
          </div>
          <div className="form-field">
            <label htmlFor="access-role">Role</label>
            <select id="access-role" name="role" defaultValue="representative">
              <option value="representative">Representative</option>
              <option value="manager">Admin</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </button>
        </form>
        {state.error && <p className="text-sm text-red-600 mt-2">{state.error}</p>}
        {state.ok && <p className="text-sm text-green-600 mt-2">Added.</p>}
        <p className="text-xs text-muted mt-2">
          They get access by signing in with this email. Until then they&rsquo;re
          shown as <em>invited</em>.
        </p>
      </section>

      <section>
        <h2 className="display text-xl">Admins</h2>
        <p className="text-sm text-muted">
          Can manage billing and this access list, and participate in working
          groups.
        </p>
        <EntryTable
          memberId={memberId}
          entries={admins}
          typeLabel="Admin"
          counterRole="representative"
          counterLabel="Make representative"
          lockedId={lastAdminId}
        />
      </section>

      <section>
        <h2 className="display text-xl">Representatives</h2>
        <p className="text-sm text-muted">
          Participate in working groups on the organization&rsquo;s behalf.
        </p>
        <EntryTable
          memberId={memberId}
          entries={representatives}
          typeLabel="Representative"
          counterRole="manager"
          counterLabel="Make admin"
          lockedId={null}
        />
      </section>
    </div>
  );
}

function EntryTable({
  memberId,
  entries,
  typeLabel,
  counterRole,
  counterLabel,
  lockedId,
}: {
  memberId: string;
  entries: Entry[];
  typeLabel: string;
  counterRole: "manager" | "representative";
  counterLabel: string;
  lockedId: string | null;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query
    ? entries.filter((e) => e.email.toLowerCase().includes(query))
    : entries;

  return (
    <div className="mt-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by email"
        className="field w-64"
      />

      {entries.length === 0 ? (
        <p className="text-sm text-muted mt-3">None yet.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted mt-3">No matches.</p>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full border-collapse text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="p-2">Email</th>
                <th className="p-2">Type</th>
                <th className="p-2">Change type</th>
                <th className="p-2">Remove</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const locked = e.id === lockedId;
                return (
                  <tr key={e.id} className="border-t border-rule">
                    <td className="p-2">
                      {e.email}
                      {e.status === "invited" && (
                        <span className="badge ml-2">invited</span>
                      )}
                    </td>
                    <td className="p-2 text-muted">{typeLabel}</td>
                    <td className="p-2">
                      <form action={changeRole}>
                        <input type="hidden" name="memberId" value={memberId} />
                        <input type="hidden" name="accessId" value={e.id} />
                        <input type="hidden" name="role" value={counterRole} />
                        <button
                          type="submit"
                          className="text-purple hover:underline disabled:text-muted disabled:no-underline disabled:cursor-not-allowed"
                          disabled={locked}
                        >
                          {counterLabel}
                        </button>
                      </form>
                    </td>
                    <td className="p-2">
                      <form action={removeAccess}>
                        <input type="hidden" name="memberId" value={memberId} />
                        <input type="hidden" name="accessId" value={e.id} />
                        <button
                          type="submit"
                          className="text-purple hover:underline disabled:text-muted disabled:no-underline disabled:cursor-not-allowed"
                          disabled={locked}
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
