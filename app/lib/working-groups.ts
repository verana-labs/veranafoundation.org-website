import { db } from "@/app/lib/db";

export type WgClass = "contributor" | "associate";

/** The set of membership classes a user holds via an *active* membership. */
export async function userActiveClasses(userId: string): Promise<Set<WgClass>> {
  const links = await db.userMember.findMany({
    where: { userId },
    include: { member: { include: { memberships: true } } },
  });
  const set = new Set<WgClass>();
  for (const link of links) {
    for (const m of link.member.memberships) {
      if (m.status === "active") set.add(m.class as WgClass);
    }
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
    db.workingGroup.findMany({ orderBy: { name: "asc" } }),
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
