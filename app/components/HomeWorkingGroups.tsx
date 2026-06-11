"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PersonAvatars, { type Person } from "@/app/components/PersonAvatars";

type HomeWg = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  requiredClass: "any" | "associate";
  leads: Person[];
};

// The home "Working groups" board, fetched client-side so it always reflects the
// DB even though the home page is ISR-cached (see /api/home-working-groups).
export default function HomeWorkingGroups() {
  const [groups, setGroups] = useState<HomeWg[] | null>(null);

  useEffect(() => {
    fetch("/api/home-working-groups")
      .then((r) => r.json())
      .then(setGroups)
      .catch(() => setGroups([]));
  }, []);

  if (groups !== null && groups.length === 0) {
    return (
      <p className="text-sm text-muted">Working groups will be announced soon.</p>
    );
  }

  return (
    <div className="space-y-3">
      {(groups ?? []).map((wg) => (
        <Link
          key={wg.id}
          href={`/working-groups/${wg.slug}`}
          className="wg-tile block hover:no-underline"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-ink">{wg.name}</p>
            <span
              className={`badge flex-shrink-0 ${
                wg.requiredClass === "associate" ? "badge-purple" : ""
              }`}
            >
              {wg.requiredClass === "associate"
                ? "Associate only"
                : "Associate or Contributor"}
            </span>
          </div>
          {wg.description && (
            <p className="text-sm text-muted mt-1">{wg.description}</p>
          )}
          {wg.leads.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted mt-2">
              <PersonAvatars people={wg.leads} size={22} max={5} />
              Led by {wg.leads.map((l) => l.name).join(", ")}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}
