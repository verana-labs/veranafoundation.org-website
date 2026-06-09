import type { WorkingGroupCard } from "@/app/lib/working-groups";

// The working-group tile design, shared by the public Contribute page and
// /account/working-groups. Accessible groups link out; the rest render as
// non-clickable tiles (same look, no link).
export default function WorkingGroupCards({
  groups,
}: {
  groups: WorkingGroupCard[];
}) {
  if (groups.length === 0) {
    return <p className="text-sm text-muted">No working groups yet.</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((wg) => {
        const requires =
          wg.requiredClass === "associate"
            ? "Associate only"
            : "Associate or Contributor";
        const body = (
          <>
            <div className="flex items-center justify-between gap-4">
              <p className="display text-lg text-ink">{wg.name}</p>
              <span
                className={`badge flex-shrink-0 ${
                  wg.requiredClass === "associate" ? "badge-purple" : ""
                }`}
              >
                {requires}
              </span>
            </div>
            {wg.description && (
              <p className="text-sm text-muted mt-1">{wg.description}</p>
            )}
          </>
        );

        return wg.accessible ? (
          <a
            key={wg.id}
            href={wg.link}
            rel="noopener"
            className="wg-tile block hover:no-underline"
          >
            {body}
          </a>
        ) : (
          <div key={wg.id} className="wg-tile">
            {body}
          </div>
        );
      })}
    </div>
  );
}
