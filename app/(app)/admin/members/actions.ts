"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";

/** Toggle whether a membership appears on the public /members directory. */
export async function toggleListed(formData: FormData) {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) throw new Error("Forbidden");

  const membershipId = String(formData.get("membershipId"));
  const membership = await db.membership.findUnique({ where: { id: membershipId } });
  if (!membership) throw new Error("Not found");

  await db.$transaction([
    db.membership.update({
      where: { id: membershipId },
      data: { listed: !membership.listed },
    }),
    db.adminAction.create({
      data: {
        actorUserId: user.id,
        actorEmail: user.email!,
        action: membership.listed ? "membership.unlist" : "membership.list",
        targetType: "Membership",
        targetId: membershipId,
      },
    }),
  ]);

  revalidatePath("/admin/members");
  revalidatePath("/members");
}
