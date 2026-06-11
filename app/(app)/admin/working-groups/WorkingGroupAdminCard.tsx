"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical, faXmark } from "@fortawesome/free-solid-svg-icons";
import { updateWg, toggleShowOnHome, toggleState } from "./actions";
import {
  addLead,
  removeLead,
  type ActionState,
} from "@/app/(marketing)/working-groups/[slug]/actions";
import PersonAvatars from "@/app/components/PersonAvatars";

export type AdminLead = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
};

export type AdminWg = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  requiredClass: "any" | "associate";
  link: string;
  showOnHome: boolean;
  state: "enabled" | "disabled";
  priority: number;
  /** ISO timestamp of when it last became disabled, or null. */
  disabledAt: string | null;
  leads: AdminLead[];
};

// Admin-side lead management: the ADR-0003 invariant (never zero leads once
// set) is enforced by the server action; errors surface inline.
function LeadsEditor({ wg }: { wg: AdminWg }) {
  const [state, addAction, adding] = useActionState<ActionState, FormData>(
    addLead,
    {},
  );
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onRemove(userId: string) {
    startTransition(async () => {
      const res = await removeLead(wg.id, userId);
      setRemoveError(res.error ?? null);
    });
  }

  return (
    <div className="mt-3 border-t border-rule pt-3">
      <p className="text-sm text-muted mb-2">Leads</p>
      {wg.leads.length === 0 ? (
        <p className="text-sm text-muted">
          None yet — assign at least one lead.
        </p>
      ) : (
        <ul className="space-y-1">
          {wg.leads.map((l) => (
            <li key={l.userId} className="flex items-center gap-2 text-sm">
              <PersonAvatars people={[l]} size={22} />
              <span>{l.name}</span>
              <span className="text-muted truncate">{l.email}</span>
              <button
                type="button"
                aria-label={`Remove lead ${l.name}`}
                className="text-muted hover:text-ink px-1"
                disabled={pending}
                onClick={() => onRemove(l.userId)}
              >
                <FontAwesomeIcon icon={faXmark} className="w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form action={addAction} className="mt-2 flex items-center gap-2">
        <input type="hidden" name="wgId" value={wg.id} />
        <input
          name="email"
          type="email"
          required
          placeholder="lead@example.org"
          className="text-sm flex-1 min-w-0"
        />
        <button type="submit" className="btn text-sm" disabled={adding}>
          {adding ? "Adding…" : "Add lead"}
        </button>
      </form>
      {(state.error || removeError) && (
        <p className="text-sm text-red-600 mt-2">{state.error ?? removeError}</p>
      )}
    </div>
  );
}

export default function WorkingGroupAdminCard({ wg }: { wg: AdminWg }) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const enabled = wg.state === "enabled";
  const requires =
    wg.requiredClass === "associate" ? "Associate only" : "Associate or Contributor";

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      setMenuOpen(false);
    });
  }

  function onSave(fd: FormData) {
    startTransition(async () => {
      await updateWg(fd);
      setEditing(false);
    });
  }

  return (
    <div
      ref={rootRef}
      className="wg-tile relative"
      style={{
        borderLeftWidth: 4,
        borderLeftColor: enabled ? "var(--color-green)" : "#9ca3af",
        opacity: enabled ? 1 : 0.85,
      }}
    >
      {editing ? (
        <form action={onSave} className="space-y-1">
          <input type="hidden" name="id" value={wg.id} />
          <div className="form-field">
            <label htmlFor={`name-${wg.id}`}>Name</label>
            <input id={`name-${wg.id}`} name="name" defaultValue={wg.name} required />
          </div>
          <div className="form-field">
            <label htmlFor={`desc-${wg.id}`}>Description</label>
            <input id={`desc-${wg.id}`} name="description" defaultValue={wg.description ?? ""} />
          </div>
          <div className="form-field">
            <label htmlFor={`link-${wg.id}`}>External link</label>
            <input id={`link-${wg.id}`} name="link" type="url" defaultValue={wg.link} required />
          </div>
          <div className="grid sm:grid-cols-2 gap-x-5">
            <div className="form-field">
              <label htmlFor={`state-${wg.id}`}>State</label>
              <select id={`state-${wg.id}`} name="state" defaultValue={wg.state}>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor={`prio-${wg.id}`}>Priority</label>
              <input id={`prio-${wg.id}`} name="priority" type="number" defaultValue={wg.priority} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm py-2">
            <input type="checkbox" name="showOnHome" defaultChecked={wg.showOnHome} /> Show on
            home page
          </label>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn text-sm"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="display text-lg text-ink">{wg.name}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={`badge ${wg.requiredClass === "associate" ? "badge-purple" : ""}`}
              >
                {requires}
              </span>
              <button
                type="button"
                aria-label="Working group actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className="px-1.5 py-1 rounded hover:bg-rule/50 text-muted"
              >
                <FontAwesomeIcon icon={faEllipsisVertical} />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-3 top-11 z-20 w-52 rounded-lg border border-rule bg-elevated py-1 shadow-lg text-sm"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left hover:bg-rule/40"
                    disabled={pending}
                    onClick={() => run(() => toggleShowOnHome(wg.id))}
                  >
                    {wg.showOnHome ? "Remove from home page" : "Show in home page"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left hover:bg-rule/40"
                    disabled={pending}
                    onClick={() => run(() => toggleState(wg.id))}
                  >
                    {enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left hover:bg-rule/40"
                    onClick={() => {
                      setEditing(true);
                      setMenuOpen(false);
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>

          {wg.description && <p className="text-sm text-muted mt-1">{wg.description}</p>}

          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Page</dt>
            <dd className="truncate">
              <a href={`/working-groups/${wg.slug}`} className="text-purple hover:underline">
                /working-groups/{wg.slug}
              </a>
            </dd>
            <dt className="text-muted">External link</dt>
            <dd className="truncate">
              <a href={wg.link} target="_blank" rel="noopener noreferrer" className="text-purple hover:underline">
                {wg.link} ↗
              </a>
            </dd>
            <dt className="text-muted">Show on home page</dt>
            <dd>{wg.showOnHome ? "Yes" : "No"}</dd>
            <dt className="text-muted">State</dt>
            <dd>
              <span className={`badge ${enabled ? "badge-green" : ""}`}>
                {enabled ? "Enabled" : "Disabled"}
              </span>
            </dd>
            <dt className="text-muted">Priority</dt>
            <dd>{wg.priority}</dd>
          </dl>

          <LeadsEditor wg={wg} />
        </>
      )}
    </div>
  );
}
