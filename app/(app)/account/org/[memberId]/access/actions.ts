"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser, isManagerOf } from "@/app/lib/authz";

export type AccessState = { error?: string; ok?: boolean };

async function assertManager(memberId: string) {
  const user = await currentUser();
  if (!user?.id || !(await isManagerOf(user.id, memberId))) {
    throw new Error("Forbidden");
  }
  return user;
}

/** Count managers that still count toward the "at least one admin" rule. */
async function managerCount(memberId: string, excludeAccessId?: string) {
  return db.memberAccess.count({
    where: {
      memberId,
      role: "manager",
      status: { not: "removed" },
      ...(excludeAccessId ? { id: { not: excludeAccessId } } : {}),
    },
  });
}

const addSchema = z.object({
  memberId: z.string().min(1),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["manager", "representative"]),
});

/** Add (or re-activate) an admin or representative email. */
export async function addAccess(
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const parsed = addSchema.safeParse({
    memberId: formData.get("memberId"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { memberId, email, role } = parsed.data;

  const user = await currentUser();
  if (!user?.id || !(await isManagerOf(user.id, memberId))) {
    return { error: "Forbidden" };
  }

  // If the person already has an account, link them immediately.
  const existing = await db.user.findUnique({ where: { email } });
  const status = existing ? "active" : "invited";

  await db.$transaction(async (tx) => {
    const access = await tx.memberAccess.upsert({
      where: { memberId_email: { memberId, email } },
      update: { role, status },
      create: { memberId, email, role, status, addedByUserId: user.id },
    });
    if (existing) {
      await tx.userMember.upsert({
        where: { userId_memberId: { userId: existing.id, memberId } },
        update: { role },
        create: { userId: existing.id, memberId, role },
      });
    }
    await tx.adminAction.create({
      data: {
        actorUserId: user.id,
        actorEmail: user.email!,
        action: "access.add",
        targetType: "MemberAccess",
        targetId: access.id,
        after: { email, role, status },
      },
    });
  });

  revalidatePath(`/account/org/${memberId}/access`);
  return { ok: true };
}

/** Remove an access entry (revokes any existing link). */
export async function removeAccess(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const accessId = String(formData.get("accessId"));
  const actor = await assertManager(memberId);

  const entry = await db.memberAccess.findUnique({ where: { id: accessId } });
  if (!entry || entry.memberId !== memberId) throw new Error("Not found");

  if (entry.role === "manager" && (await managerCount(memberId, accessId)) === 0) {
    throw new Error("An organization must keep at least one admin.");
  }

  const user = await db.user.findUnique({ where: { email: entry.email } });
  await db.$transaction(async (tx) => {
    await tx.memberAccess.update({
      where: { id: accessId },
      data: { status: "removed" },
    });
    if (user) {
      await tx.userMember.deleteMany({ where: { userId: user.id, memberId } });
    }
    await tx.adminAction.create({
      data: {
        actorUserId: actor.id,
        actorEmail: actor.email!,
        action: "access.remove",
        targetType: "MemberAccess",
        targetId: accessId,
        before: { email: entry.email, role: entry.role },
      },
    });
  });

  revalidatePath(`/account/org/${memberId}/access`);
}

/** Promote a representative to admin, or demote an admin to representative. */
export async function changeRole(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const accessId = String(formData.get("accessId"));
  const role = String(formData.get("role")) as "manager" | "representative";
  const actor = await assertManager(memberId);

  const entry = await db.memberAccess.findUnique({ where: { id: accessId } });
  if (!entry || entry.memberId !== memberId) throw new Error("Not found");

  if (
    entry.role === "manager" &&
    role === "representative" &&
    (await managerCount(memberId, accessId)) === 0
  ) {
    throw new Error("An organization must keep at least one admin.");
  }

  const user = await db.user.findUnique({ where: { email: entry.email } });
  await db.$transaction(async (tx) => {
    await tx.memberAccess.update({ where: { id: accessId }, data: { role } });
    if (user) {
      await tx.userMember.updateMany({
        where: { userId: user.id, memberId },
        data: { role },
      });
    }
    await tx.adminAction.create({
      data: {
        actorUserId: actor.id,
        actorEmail: actor.email!,
        action: "access.role",
        targetType: "MemberAccess",
        targetId: accessId,
        before: { role: entry.role },
        after: { role },
      },
    });
  });

  revalidatePath(`/account/org/${memberId}/access`);
}
