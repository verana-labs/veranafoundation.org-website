"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { flagEmoji, countryName } from "@/app/lib/countries";
import {
  leaveOrganization,
  cancelMembership,
  updateOrgAddress,
  uploadOrgLogo,
  removeOrgLogo,
} from "@/app/(app)/account/actions";

export type MembershipMenu = {
  memberId: string;
  /** Manager-only — link to the access ("Manage Participants") page. */
  manageHref?: string | null;
  /** Manager-only — link to the billing page. */
  billingHref?: string | null;
  /** Manager-only — offer inline editing of the registered address. */
  canEditAddress?: boolean;
  /** Manager-only — offer logo upload/replace/remove. */
  canEditLogo?: boolean;
  /** Show "Leave Organization" (representatives, or a manager when not the last). */
  canLeave?: boolean;
  /** Show "Cancel membership" (individuals, or an org's sole manager w/ no reps). */
  canCancel?: boolean;
};

export type MembershipCardData = {
  name: string;
  type: "individual" | "organization";
  membershipClass?: "associate" | "contributor" | null;
  status?: string | null;
  role?: string | null;
  country?: string | null;
  periodEnd?: Date | string | null;
  /** Organization's registered address (shown + editable for managers). */
  address?: string | null;
  /** Organization's VAT number. Only rendered when `showVat` (EU companies). */
  vatNumber?: string | null;
  showVat?: boolean;
  /** Serving URL of the uploaded logo (cache-busted), if any. */
  logoUrl?: string | null;
  /** Current display consent — preselects the checkbox when replacing. */
  logoConsent?: boolean;
  /** When set, a "Download agreement" link to the signed PDF is shown. */
  agreementHref?: string | null;
  /** When set, a ⋮ actions menu is shown top-right. */
  menu?: MembershipMenu | null;
};

const STATUS_BADGE: Record<string, string> = {
  active: "badge-green",
  pending: "badge-amber",
  past_due: "badge-amber",
  suspended: "badge-red",
  expired: "badge-red",
  cancelled: "badge-red",
};

function titleize(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MembershipCard({
  name,
  type,
  membershipClass,
  status,
  role,
  country,
  periodEnd,
  address,
  vatNumber,
  showVat,
  logoUrl,
  logoConsent,
  agreementHref,
  menu,
}: MembershipCardData) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [draftAddress, setDraftAddress] = useState("");
  const [editingLogo, setEditingLogo] = useState(false);
  const [logoError, setLogoError] = useState("");
  const logoFormRef = useRef<HTMLFormElement>(null);
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

  const flag = flagEmoji(country);
  const label = countryName(country);
  const expiry =
    membershipClass === "associate" && periodEnd
      ? new Date(periodEnd).toLocaleDateString("en-CA").replace(/-/g, "/")
      : null;

  function act(confirmMsg: string, fn: () => Promise<void>) {
    if (!window.confirm(confirmMsg)) return;
    startTransition(async () => {
      await fn();
      setMenuOpen(false);
    });
  }

  const hasMenu =
    !!menu &&
    (menu.canLeave ||
      menu.canCancel ||
      menu.canEditAddress ||
      menu.canEditLogo ||
      !!menu.manageHref ||
      !!menu.billingHref);

  function saveAddress() {
    startTransition(async () => {
      await updateOrgAddress(menu!.memberId, draftAddress);
      setEditingAddress(false);
    });
  }

  function saveLogo() {
    const form = logoFormRef.current;
    if (!form) return;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await uploadOrgLogo(fd);
      if (res.error) setLogoError(res.error);
      else {
        setLogoError("");
        setEditingLogo(false);
      }
    });
  }

  return (
    <div ref={rootRef} className="card relative">
      <div className="flex items-start justify-between gap-2">
        {/* Up to three pills, each only as wide as its content. */}
        <div className="flex flex-wrap items-center gap-2">
          {membershipClass && (
            <span
              className={`badge ${
                membershipClass === "associate" ? "badge-purple" : "badge-green"
              }`}
            >
              {titleize(membershipClass)}
            </span>
          )}
          {status && (
            <span className={`badge ${STATUS_BADGE[status] ?? ""}`}>
              {titleize(status)}
            </span>
          )}
          {type === "organization" && role && (
            <span className="badge">{titleize(role)}</span>
          )}
        </div>

        {hasMenu && (
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
                className="absolute right-3 top-10 z-20 w-56 rounded-lg border border-rule bg-elevated py-1 shadow-lg text-sm"
              >
                {menu!.canLeave && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    className="block w-full px-3 py-2 text-left hover:bg-rule/40"
                    onClick={() =>
                      act(
                        `Leave ${name}? You'll lose access to this organization.`,
                        () => leaveOrganization(menu!.memberId),
                      )
                    }
                  >
                    Leave Organization
                  </button>
                )}
                {menu!.canCancel && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    className="block w-full px-3 py-2 text-left hover:bg-rule/40 text-red-600"
                    onClick={() =>
                      act(
                        "Cancel this membership? This ends it and can't be undone here.",
                        () => cancelMembership(menu!.memberId),
                      )
                    }
                  >
                    Cancel membership
                  </button>
                )}
                {menu!.canEditAddress && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    className="block w-full px-3 py-2 text-left hover:bg-rule/40"
                    onClick={() => {
                      setDraftAddress(address ?? "");
                      setEditingAddress(true);
                      setMenuOpen(false);
                    }}
                  >
                    Update address
                  </button>
                )}
                {menu!.canEditLogo && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    className="block w-full px-3 py-2 text-left hover:bg-rule/40"
                    onClick={() => {
                      setLogoError("");
                      setEditingLogo(true);
                      setMenuOpen(false);
                    }}
                  >
                    {logoUrl ? "Replace logo" : "Upload logo"}
                  </button>
                )}
                {menu!.canEditLogo && logoUrl && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    className="block w-full px-3 py-2 text-left hover:bg-rule/40"
                    onClick={() =>
                      act("Remove the organization's logo?", () =>
                        removeOrgLogo(menu!.memberId),
                      )
                    }
                  >
                    Remove logo
                  </button>
                )}
                {menu!.manageHref && (
                  <Link
                    role="menuitem"
                    href={menu!.manageHref}
                    className="block w-full px-3 py-2 text-left hover:bg-rule/40"
                    onClick={() => setMenuOpen(false)}
                  >
                    Manage Participants
                  </Link>
                )}
                {menu!.billingHref && (
                  <Link
                    role="menuitem"
                    href={menu!.billingHref}
                    className="block w-full px-3 py-2 text-left hover:bg-rule/40"
                    onClick={() => setMenuOpen(false)}
                  >
                    Billing &amp; Invoice
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <h3 className="flex items-center gap-2">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- served by our
          // own /logo route; next/image can't optimize SVGs anyway.
          <img
            src={logoUrl}
            alt=""
            className="h-9 w-9 object-contain rounded"
          />
        )}
        <span>{name}</span>
        {flag ? (
          <span aria-label={label ?? undefined} title={label ?? undefined}>
            {flag}
          </span>
        ) : label ? (
          <span className="text-sm font-normal text-muted">{label}</span>
        ) : null}
      </h3>

      {type === "organization" &&
        (editingAddress ? (
          <div className="mt-1 grid gap-2">
            <textarea
              value={draftAddress}
              onChange={(e) => setDraftAddress(e.target.value)}
              rows={3}
              placeholder="Registered address"
              className="field w-full text-sm"
              disabled={pending}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary text-xs"
                disabled={pending}
                onClick={saveAddress}
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn btn-secondary text-xs"
                disabled={pending}
                onClick={() => setEditingAddress(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted whitespace-pre-line">
            {address || <span className="italic">No registered address</span>}
          </p>
        ))}
      {type === "organization" && showVat && (
        <p className="text-sm text-muted">
          VAT: {vatNumber || <span className="italic">not set</span>}
        </p>
      )}

      {editingLogo && menu && (
        <form ref={logoFormRef} className="mt-2 grid gap-2 text-sm">
          <input type="hidden" name="memberId" value={menu.memberId} />
          <input
            type="file"
            name="logo"
            accept=".svg,.png,.webp,.jpg,.jpeg,image/svg+xml,image/png,image/webp,image/jpeg"
            className="text-xs"
            disabled={pending}
          />
          <p className="text-xs text-muted">SVG, PNG, WebP or JPG — max 1 MB.</p>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              name="logoDisplayConsent"
              defaultChecked={logoConsent ?? true}
              className="mt-0.5"
            />
            <span>We may display this logo on veranafoundation.org.</span>
          </label>
          {logoError && <p className="text-xs text-red-600">{logoError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary text-xs"
              disabled={pending}
              onClick={saveLogo}
            >
              {pending ? "Uploading…" : "Save"}
            </button>
            <button
              type="button"
              className="btn btn-secondary text-xs"
              disabled={pending}
              onClick={() => setEditingLogo(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {expiry && <p className="text-sm text-muted">Expire {expiry}</p>}

      {agreementHref && (
        <a
          href={agreementHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-purple hover:underline mt-auto pt-2"
        >
          Agreement PDF ↓
        </a>
      )}
    </div>
  );
}
