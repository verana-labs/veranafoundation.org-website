import { auth } from "@/auth";
import { db } from "@/app/lib/db";

/** The signed-in user (with `id`), or null. */
export async function currentUser() {
  return (await auth())?.user ?? null;
}

/** Foundation-admin grant = verified email present in the admin allowlist (ADR-0002). */
export async function isAdmin(email?: string | null) {
  if (!email) return false;
  // Allowlist entries are stored lowercased (seed + /admin/admins); match case-insensitively.
  return !!(
    await db.adminAllowlistEntry.findUnique({
      where: { email: email.toLowerCase() },
    })
  );
}

/**
 * A user's links to Members (their own + every org that lists them), with the
 * Member and its memberships. The basis for the dashboard and entitlements.
 */
export async function effectiveMemberships(userId: string) {
  return db.userMember.findMany({
    where: { userId },
    include: { member: { include: { memberships: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Whether the user is a `manager` of the given Member. */
export async function isManagerOf(userId: string, memberId: string) {
  const link = await db.userMember.findUnique({
    where: { userId_memberId: { userId, memberId } },
  });
  return link?.role === "manager";
}
