"use client";

import { useEffect, useState } from "react";

type HomeWg = {
  id: string;
  name: string;
  description: string | null;
  requiredClass: "any" | "associate";
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
        <div key={wg.id} className="wg-tile">
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
        </div>
      ))}
    </div>
  );
}
