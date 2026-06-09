"use client";

import { useActionState, useState } from "react";
import { createWg, type WgState } from "./actions";
import WorkingGroupAdminCard, { type AdminWg } from "./WorkingGroupAdminCard";

export default function WorkingGroupsAdmin({ groups }: { groups: AdminWg[] }) {
  const [state, createAction, pending] = useActionState<WgState, FormData>(
    createWg,
    {},
  );
  const [showDisabled, setShowDisabled] = useState(false);
  const visible = groups.filter((g) => showDisabled || g.state === "enabled");

  return (
    <div className="grid gap-10">
      <section>
        <h2 className="display text-xl">Add a working group</h2>
        <form action={createAction} className="space-y-1 max-w-xl mt-3">
          <div className="form-field">
            <label htmlFor="wg-name">
              Name <span className="req">*</span>
            </label>
            <input id="wg-name" name="name" required placeholder="Working group name" />
          </div>
          <div className="form-field">
            <label htmlFor="wg-description">
              Description <span className="opt">(optional)</span>
            </label>
            <input id="wg-description" name="description" placeholder="Short description" />
          </div>
          <div className="form-field">
            <label htmlFor="wg-link">
              External link <span className="req">*</span>
            </label>
            <input id="wg-link" name="link" type="url" required placeholder="https://… (external space)" />
          </div>
          <div className="form-field">
            <label htmlFor="wg-class">Required membership</label>
            <select id="wg-class" name="requiredClass" defaultValue="any">
              <option value="any">Any active membership</option>
              <option value="associate">Active Associate only</option>
            </select>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-5">
            <div className="form-field">
              <label htmlFor="wg-state">State</label>
              <select id="wg-state" name="state" defaultValue="enabled">
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="wg-priority">Priority</label>
              <input id="wg-priority" name="priority" type="number" defaultValue={0} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm py-2">
            <input type="checkbox" name="showOnHome" /> Show on home page
          </label>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state.ok && <p className="text-sm text-green-600">Created.</p>}
          <button type="submit" className="btn btn-primary w-fit" disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </button>
        </form>
      </section>

      <section>
        <div className="flex items-center justify-between gap-4">
          <h2 className="display text-xl">Working groups</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showDisabled}
              onChange={(e) => setShowDisabled(e.target.checked)}
            />
            Show disabled
          </label>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-muted mt-3">
            {groups.length === 0 ? "None yet." : "No enabled working groups."}
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {visible.map((wg) => (
              <WorkingGroupAdminCard key={wg.id} wg={wg} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
