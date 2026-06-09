import Link from "next/link";
import { flagEmoji, countryName } from "@/app/lib/countries";

export type MembershipCardData = {
  /** Individual or organization legal name. */
  name: string;
  type: "individual" | "organization";
  /** Membership class; null when no membership row exists yet. */
  membershipClass?: "associate" | "contributor" | null;
  /** Membership status (pending | active | past_due | suspended | expired). */
  status?: string | null;
  /** Org only — the viewer's role: "manager" | "representative". */
  role?: string | null;
  /** Residence (individual) or jurisdiction (organization); ISO code → flag. */
  country?: string | null;
  /** Associate renewals: the period end, shown as "Expire YYYY/MM/DD". */
  periodEnd?: Date | string | null;
  /** When set, a "Manage →" button links here (manager/admin only). */
  manageHref?: string | null;
  /** When set, a "Download agreement" link to the signed PDF is shown. */
  agreementHref?: string | null;
};

// Status → badge tone. Unmapped statuses fall back to the neutral badge.
const STATUS_BADGE: Record<string, string> = {
  active: "badge-green",
  pending: "badge-amber",
  past_due: "badge-amber",
  suspended: "badge-red",
  expired: "badge-red",
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
  manageHref,
  agreementHref,
}: MembershipCardData) {
  const flag = flagEmoji(country);
  const label = countryName(country);
  // ISO format from en-CA is YYYY-MM-DD; the design wants slashes.
  const expiry =
    membershipClass === "associate" && periodEnd
      ? new Date(periodEnd).toLocaleDateString("en-CA").replace(/-/g, "/")
      : null;

  return (
    <div className="card">
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

      <h3 className="flex items-center gap-2">
        <span>{name}</span>
        {flag ? (
          <span aria-label={label ?? undefined} title={label ?? undefined}>
            {flag}
          </span>
        ) : label ? (
          <span className="text-sm font-normal text-muted">{label}</span>
        ) : null}
      </h3>

      {expiry && <p className="text-sm text-muted">Expire {expiry}</p>}

      {(agreementHref || manageHref) && (
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          {agreementHref ? (
            <a
              href={agreementHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-purple hover:underline"
            >
              Agreement PDF ↓
            </a>
          ) : (
            <span />
          )}
          {manageHref && (
            <Link href={manageHref} className="btn btn-secondary text-sm self-end">
              Manage →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
