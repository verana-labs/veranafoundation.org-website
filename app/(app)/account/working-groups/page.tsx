import type { Metadata } from "next";
import { db } from "@/app/lib/db";
import { currentUser } from "@/app/lib/authz";
import {
  userActiveClasses,
  canAccessWg,
  lockReason,
} from "@/app/lib/working-groups";

export const metadata: Metadata = { title: "Working groups" };

export default async function WorkingGroupsPage() {
  const user = await currentUser();
  const [wgs, classes] = await Promise.all([
    db.workingGroup.findMany({ orderBy: { name: "asc" } }),
    user ? userActiveClasses(user.id) : Promise.resolve(new Set<never>()),
  ]);

  return (
    <div className="prose-body max-w-2xl">
      <h1 className="display text-3xl">Working groups</h1>
      <p className="text-muted mt-2">
        Access is computed from your memberships across every organization you
        belong to.
      </p>

      {wgs.length === 0 ? (
        <p className="text-muted mt-6">No working groups yet.</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {wgs.map((wg) => {
            const open = canAccessWg(wg.requiredClass, classes);
            return (
              <li key={wg.id} className="card">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">{wg.name}</span>
                  {open ? (
                    <a
                      href={wg.link}
                      target="_blank"
                      rel="noopener"
                      className="btn btn-primary text-xs"
                    >
                      Open ↗
                    </a>
                  ) : (
                    <span className="badge">Locked</span>
                  )}
                </div>
                {wg.description && (
                  <p className="text-sm text-muted mt-1">{wg.description}</p>
                )}
                {!open && (
                  <p className="text-xs text-muted mt-1">
                    {lockReason(wg.requiredClass)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
