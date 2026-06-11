import Link from "next/link";
import type { WorkingGroupCard } from "@/app/lib/working-groups";
import PersonAvatars from "@/app/components/PersonAvatars";

// The working-group tile design, shared by the public Contribute page and
// /account/working-groups. Every tile links to the group's page; what you can
// do there (join, meeting link) depends on your memberships.
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
        return (
          <Link
            key={wg.id}
            href={`/working-groups/${wg.slug}`}
            className="wg-tile block hover:no-underline"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="display text-lg text-ink">{wg.name}</p>
              <span className="flex items-center gap-2 flex-shrink-0">
                {wg.joined && <span className="badge badge-green">Joined</span>}
                <span
                  className={`badge ${
                    wg.requiredClass === "associate" ? "badge-purple" : ""
                  }`}
                >
                  {requires}
                </span>
              </span>
            </div>
            {wg.description && (
              <p className="text-sm text-muted mt-1">{wg.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-sm text-muted">
              {wg.leads.length > 0 && (
                <span className="flex items-center gap-2">
                  <PersonAvatars people={wg.leads} size={24} max={5} />
                  Led by {wg.leads.map((l) => l.name).join(", ")}
                </span>
              )}
              {wg.participantCount > 0 && (
                <span>
                  {wg.participantCount} participant
                  {wg.participantCount === 1 ? "" : "s"}
                </span>
              )}
              {wg.nextMeeting && (
                <span>
                  Next meeting:{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    day: "numeric", month: "short",
                    hour: "2-digit", minute: "2-digit",
                  }).format(new Date(wg.nextMeeting))}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
