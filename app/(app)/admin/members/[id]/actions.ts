"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";

async function assertAdmin() {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) throw new Error("Forbidden");
  return user;
}

async function setStatus(formData: FormData, status: "suspended" | "active") {
  const actor = await assertAdmin();
  const membershipId = String(formData.get("membershipId"));
  const memberId = String(formData.get("memberId"));
  const before = await db.membership.findUnique({ where: { id: membershipId } });
  await db.membership.update({ where: { id: membershipId }, data: { status } });
  await db.adminAction.create({
    data: {
      actorUserId: actor.id,
      actorEmail: actor.email!,
      action: status === "suspended" ? "membership.suspend" : "membership.reinstate",
      targetType: "Membership",
      targetId: membershipId,
      before: { status: before?.status },
      after: { status },
    },
  });
  revalidatePath(`/admin/members/${memberId}`);
}

export async function suspendMembership(formData: FormData) {
  await setStatus(formData, "suspended");
}

export async function reinstateMembership(formData: FormData) {
  await setStatus(formData, "active");
}
