import { db } from "@/app/lib/db";

/**
 * Auto-link a signed-in user to every org that allowlisted their verified email
 * (ADR-0002). Runs on sign-in. Idempotent; promotes `invited` entries to
 * `active`. The verified-email rule (enforced at sign-in) is what makes this safe.
 */
export async function linkMemberAccess(userId: string, email: string) {
  const entries = await db.memberAccess.findMany({
    where: { email, status: { in: ["invited", "active"] } },
  });

  for (const entry of entries) {
    await db.userMember.upsert({
      where: { userId_memberId: { userId, memberId: entry.memberId } },
      update: { role: entry.role },
      create: { userId, memberId: entry.memberId, role: entry.role },
    });
    if (entry.status === "invited") {
      await db.memberAccess.update({
        where: { id: entry.id },
        data: { status: "active" },
      });
    }
  }
}
