"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser } from "@/app/lib/authz";

/** Count active (non-removed) access entries of a role, optionally excluding an email. */
async function roleCount(
  memberId: string,
  role: "manager" | "representative",
  excludeEmail?: string,
) {
  return db.memberAccess.count({
    where: {
      memberId,
      role,
      status: { not: "removed" },
      ...(excludeEmail ? { email: { not: excludeEmail } } : {}),
    },
  });
}

/**
 * The current user leaves an organization (revokes their own access + link).
 * A manager may only leave if another manager remains — enforced here so the
 * org is never orphaned, even if the UI offered the option stale.
 */
export async function leaveOrganization(memberId: string) {
  const user = await currentUser();
  if (!user?.id || !user.email) throw new Error("Forbidden");
  const email = user.email.toLowerCase();

  const link = await db.userMember.findUnique({
    where: { userId_memberId: { userId: user.id, memberId } },
  });
  if (!link) throw new Error("You do not belong to this organization.");

  if (link.role === "manager" && (await roleCount(memberId, "manager", email)) === 0) {
    throw new Error("You are the last manager — promote another manager before leaving.");
  }

  await db.$transaction(async (tx) => {
    await tx.userMember.deleteMany({ where: { userId: user.id, memberId } });
    await tx.memberAccess.updateMany({
      where: { memberId, email },
      data: { status: "removed" },
    });
    await tx.adminAction.create({
      data: {
        actorUserId: user.id,
        actorEmail: user.email!,
        action: "member.leave",
        targetType: "Member",
        targetId: memberId,
        before: { email, role: link.role },
      },
    });
  });

  revalidatePath("/account");
}

/**
 * The current user cancels their membership: their individual membership, or an
 * organization's when they are its sole manager with no representatives left.
 * Memberships are marked `cancelled` (records retained); the user is unlinked.
 */
export async function cancelMembership(memberId: string) {
  const user = await currentUser();
  if (!user?.id || !user.email) throw new Error("Forbidden");
  const email = user.email.toLowerCase();

  const member = await db.member.findUnique({
    where: { id: memberId },
    include: { userLinks: { where: { userId: user.id } } },
  });
  if (!member || member.userLinks.length === 0) throw new Error("Forbidden");

  if (member.type === "organization") {
    if (member.userLinks[0].role !== "manager") {
      throw new Error("Only a manager can cancel the organization's membership.");
    }
    const otherManagers = await roleCount(memberId, "manager", email);
    const reps = await roleCount(memberId, "representative");
    if (otherManagers > 0 || reps > 0) {
      throw new Error(
        "Cancel is only allowed for the sole manager of an organization with no representatives.",
      );
    }
  }

  await db.$transaction(async (tx) => {
    await tx.membership.updateMany({
      where: { memberId, status: { not: "cancelled" } },
      data: { status: "cancelled" },
    });
    await tx.userMember.deleteMany({ where: { userId: user.id, memberId } });
    await tx.memberAccess.updateMany({
      where: { memberId, email },
      data: { status: "removed" },
    });
    await tx.adminAction.create({
      data: {
        actorUserId: user.id,
        actorEmail: user.email!,
        action: "membership.cancel",
        targetType: "Member",
        targetId: memberId,
        before: { type: member.type },
      },
    });
  });

  revalidatePath("/account");
}

/**
 * Update an organization's registered address (managers only). Invoices render
 * their PDF on demand, so a corrected address shows on the next download.
 */
export async function updateOrgAddress(memberId: string, address: string) {
  const user = await currentUser();
  if (!user?.id || !user.email) throw new Error("Forbidden");

  const link = await db.userMember.findUnique({
    where: { userId_memberId: { userId: user.id, memberId } },
  });
  if (link?.role !== "manager") {
    throw new Error("Only a manager can update the organization's address.");
  }
  const member = await db.member.findUnique({ where: { id: memberId } });
  if (!member || member.type !== "organization") throw new Error("Not found");

  const trimmed = address.trim().slice(0, 500);
  await db.$transaction([
    db.member.update({
      where: { id: memberId },
      data: { registeredAddress: trimmed || null },
    }),
    db.adminAction.create({
      data: {
        actorUserId: user.id,
        actorEmail: user.email,
        action: "member.update_address",
        targetType: "Member",
        targetId: memberId,
        before: { registeredAddress: member.registeredAddress },
        after: { registeredAddress: trimmed || null },
      },
    }),
  ]);

  revalidatePath("/account");
}
