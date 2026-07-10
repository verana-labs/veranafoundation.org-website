"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import {
  convertWgInvitesForEmails,
  memberReachableEmails,
} from "@/app/lib/wg-invites";
import { MEMBERSHIP_TRANSITIONS, type MembershipStatus } from "./transitions";

async function assertAdmin() {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) throw new Error("Forbidden");
  return user;
}

/** Transition a membership to a new status (only along the allowed edges). */
export async function setMembershipStatus(
  membershipId: string,
  memberId: string,
  status: MembershipStatus,
) {
  const actor = await assertAdmin();
  const before = await db.membership.findUnique({ where: { id: membershipId } });
  if (!before) throw new Error("Membership not found");

  const allowed = MEMBERSHIP_TRANSITIONS[before.status as MembershipStatus] ?? [];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid transition: ${before.status} → ${status}`);
  }

  await db.membership.update({ where: { id: membershipId }, data: { status } });
  await db.adminAction.create({
    data: {
      actorUserId: actor.id,
      actorEmail: actor.email!,
      action: "membership.status",
      targetType: "Membership",
      targetId: membershipId,
      before: { status: before.status },
      after: { status },
    },
  });
  // An admin activation counts like any other: convert pending WG invites.
  if (status === "active") {
    await convertWgInvitesForEmails(await memberReachableEmails(memberId));
  }
  revalidatePath(`/admin/members/${memberId}`);
}
