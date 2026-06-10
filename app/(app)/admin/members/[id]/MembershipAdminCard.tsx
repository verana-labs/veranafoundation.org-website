"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { setMembershipStatus } from "./actions";
import {
  MEMBERSHIP_TRANSITIONS,
  MEMBERSHIP_STATUS_LABEL,
  type MembershipStatus,
} from "./transitions";

export type AdminMembership = {
  id: string;
  memberId: string;
  class: "associate" | "contributor";
  status: MembershipStatus;
  tier: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  active: "badge-green",
  pending: "badge-amber",
  past_due: "badge-amber",
  suspended: "badge-red",
  expired: "badge-red",
  cancelled: "badge-red",
};

const titleize = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export default function MembershipAdminCard({ membership: m }: { membership: AdminMembership }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const targets = MEMBERSHIP_TRANSITIONS[m.status] ?? [];

  function go(status: MembershipStatus) {
    startTransition(async () => {
      await setMembershipStatus(m.id, m.memberId, status);
      setMenuOpen(false);
    });
  }

  return (
    <div ref={rootRef} className="card relative mt-2 max-w-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${m.class === "associate" ? "badge-purple" : "badge-green"}`}>
            {titleize(m.class)}
          </span>
          <span className={`badge ${STATUS_BADGE[m.status] ?? ""}`}>{titleize(m.status)}</span>
        </div>

        {targets.length > 0 && (
          <div className="flex-shrink-0">
            <button
              type="button"
              aria-label="Membership actions"
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
                className="absolute right-3 top-10 z-20 w-48 rounded-lg border border-rule bg-elevated py-1 shadow-lg text-sm"
              >
                {targets.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() => go(t)}
                    className={`block w-full px-3 py-2 text-left hover:bg-rule/40 ${
                      t === "cancelled" || t === "suspended" || t === "expired"
                        ? "text-red-600"
                        : ""
                    }`}
                  >
                    {MEMBERSHIP_STATUS_LABEL[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {m.tier && (
          <>
            <dt className="text-muted">Tier</dt>
            <dd>{m.tier}</dd>
          </>
        )}
        <dt className="text-muted">Period</dt>
        <dd>
          {day(m.periodStart)} → {day(m.periodEnd)}
        </dd>
      </dl>
    </div>
  );
}
