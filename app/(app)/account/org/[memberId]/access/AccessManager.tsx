"use client";

import { useActionState } from "react";
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
        <h2 className="display text-xl">Admins</h2>
        <p className="text-sm text-muted">
          Can manage billing and this access list, and participate in working
          groups.
        </p>
        <EntryList
          memberId={memberId}
          entries={admins}
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
        <EntryList
          memberId={memberId}
          entries={representatives}
          counterRole="manager"
          counterLabel="Make admin"
          lockedId={null}
        />
      </section>

      <section>
        <h2 className="display text-xl">Add someone</h2>
        <form action={addAction} className="flex flex-wrap items-end gap-2 mt-2">
          <input type="hidden" name="memberId" value={memberId} />
          <input
            name="email"
            type="email"
            required
            placeholder="person@org.com"
            className="rounded border border-rule bg-surface px-3 py-2 text-sm"
          />
          <select
            name="role"
            className="rounded border border-rule bg-surface px-3 py-2 text-sm"
            defaultValue="representative"
          >
            <option value="representative">Representative</option>
            <option value="manager">Admin</option>
          </select>
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
    </div>
  );
}

function EntryList({
  memberId,
  entries,
  counterRole,
  counterLabel,
  lockedId,
}: {
  memberId: string;
  entries: Entry[];
  counterRole: "manager" | "representative";
  counterLabel: string;
  lockedId: string | null;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted mt-2">None yet.</p>;
  }
  return (
    <ul className="mt-2 grid gap-2">
      {entries.map((e) => {
        const locked = e.id === lockedId;
        return (
          <li
            key={e.id}
            className="card flex flex-wrap items-center justify-between gap-3"
          >
            <span className="text-sm">
              {e.email}
              {e.status === "invited" && (
                <span className="badge ml-2">invited</span>
              )}
            </span>
            <div className="flex gap-2">
              <form action={changeRole}>
                <input type="hidden" name="memberId" value={memberId} />
                <input type="hidden" name="accessId" value={e.id} />
                <input type="hidden" name="role" value={counterRole} />
                <button type="submit" className="btn text-xs" disabled={locked}>
                  {counterLabel}
                </button>
              </form>
              <form action={removeAccess}>
                <input type="hidden" name="memberId" value={memberId} />
                <input type="hidden" name="accessId" value={e.id} />
                <button type="submit" className="btn text-xs" disabled={locked}>
                  Remove
                </button>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
