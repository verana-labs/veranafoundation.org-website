import { db } from "@/app/lib/db";

export type WgClass = "contributor" | "associate";

/** The set of membership classes a user holds via an *active* membership. */
export async function userActiveClasses(userId: string): Promise<Set<WgClass>> {
  const links = await db.userMember.findMany({
    where: { userId },
    include: { member: { include: { membership: true } } },
  });
  const set = new Set<WgClass>();
  for (const link of links) {
    const m = link.member.membership;
    if (m && m.status === "active") set.add(m.class as WgClass);
  }
  return set;
}

/** ADR-0002 WG access rule: any active membership, or an active Associate one. */
export function canAccessWg(
  requiredClass: "any" | "associate",
  classes: Set<WgClass>,
): boolean {
  return requiredClass === "associate"
    ? classes.has("associate")
    : classes.size > 0;
}

export function lockReason(requiredClass: "any" | "associate"): string {
  return requiredClass === "associate"
    ? "Requires an active Associate membership."
    : "Requires an active membership.";
}

/**
 * Working groups featured on the public home page (admin-flagged). Resilient:
 * the home is ISR-prerendered (incl. at build where there's no DB), so a DB
 * failure degrades to an empty board rather than breaking the build.
 */
export async function listHomeWorkingGroups() {
  try {
    return await db.workingGroup.findMany({
      where: { showOnHome: true, state: "enabled" },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    });
  } catch {
    return [];
  }
}

export type WorkingGroupCard = {
  id: string;
  name: string;
  description: string | null;
  requiredClass: "any" | "associate";
  link: string;
  accessible: boolean;
};

/**
 * All working groups (always the full list), with per-user clickability:
 * `accessible` is true only for a signed-in user whose memberships satisfy the
 * group's requiredClass. Pass null for a signed-out visitor (nothing clickable).
 */
export async function listWorkingGroupsWithAccess(
  userId: string | null,
): Promise<WorkingGroupCard[]> {
  const [groups, classes] = await Promise.all([
    db.workingGroup.findMany({
      where: { state: "enabled" },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    }),
    userId ? userActiveClasses(userId) : Promise.resolve(new Set<WgClass>()),
  ]);
  return groups.map((wg) => ({
    id: wg.id,
    name: wg.name,
    description: wg.description,
    requiredClass: wg.requiredClass,
    link: wg.link,
    accessible: !!userId && canAccessWg(wg.requiredClass, classes),
  }));
}
