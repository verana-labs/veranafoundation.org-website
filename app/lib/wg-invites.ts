import { db } from "@/app/lib/db";
import {
  canAccessWg,
  syncScheduleToGoogle,
  userActiveClasses,
  type WgClass,
} from "@/app/lib/working-groups";
import { notify } from "@/app/lib/access-emails";
import { sendWgJoinedEmail } from "@/app/lib/wg-invite-emails";

/**
 * Convert pending working-group invites into real lead/participant rows for
 * the given emails — the single conversion path, called from every place a
 * person can start satisfying the gate: sign-in, contributor application,
 * invoice payment (Associate activation), admin membership-status changes,
 * and org access-list additions.
 *
 * The gate is strict by design: an invite converts only when a user with that
 * verified email exists AND holds an active membership satisfying the group's
 * requiredClass. Idempotent and best-effort — callers (payment webhooks,
 * sign-in events) must never fail because a conversion did.
 */
export async function convertWgInvitesForEmails(
  emails: string[],
): Promise<void> {
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()))].filter(
    Boolean,
  );
  if (unique.length === 0) return;

  try {
    const invites = await db.wgInvite.findMany({
      where: { email: { in: unique }, acceptedAt: null },
      include: { wg: true },
    });
    if (invites.length === 0) return;

    // One classes lookup per user, not per invite.
    const classesByUserId = new Map<string, Set<WgClass>>();
    const usersByEmail = new Map(
      (
        await db.user.findMany({
          where: { email: { in: [...new Set(invites.map((i) => i.email))] } },
        })
      ).map((u) => [u.email!, u]),
    );

    const wgIdsToSync = new Set<string>();

    for (const invite of invites) {
      const user = usersByEmail.get(invite.email);
      if (!user) continue; // no account yet — stays pending

      let classes = classesByUserId.get(user.id);
      if (!classes) {
        classes = await userActiveClasses(user.id);
        classesByUserId.set(user.id, classes);
      }
      if (!canAccessWg(invite.wg.requiredClass, classes)) continue; // gate holds

      if (invite.role === "lead") {
        await db.wgLead.upsert({
          where: { wgId_userId: { wgId: invite.wgId, userId: user.id } },
          create: {
            wgId: invite.wgId,
            userId: user.id,
            addedByUserId: invite.invitedByUserId,
          },
          update: {},
        });
      } else {
        await db.wgParticipant.upsert({
          where: { wgId_userId: { wgId: invite.wgId, userId: user.id } },
          create: { wgId: invite.wgId, userId: user.id },
          update: { leftAt: null },
        });
      }
      await db.wgInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      await db.adminAction.create({
        data: {
          actorUserId: user.id,
          actorEmail: invite.email,
          action: "wg.invite.accept",
          targetType: "WorkingGroup",
          targetId: invite.wgId,
          after: { email: invite.email, role: invite.role },
        },
      });
      wgIdsToSync.add(invite.wgId);
      notify(
        sendWgJoinedEmail({
          to: invite.email,
          wgName: invite.wg.name,
          wgSlug: invite.wg.slug,
          role: invite.role,
        }),
      );
    }

    // New leads/participants become Calendar attendees; sync each touched WG.
    for (const wgId of wgIdsToSync) {
      try {
        await syncScheduleToGoogle(wgId);
      } catch {
        /* recorded as syncError by the sync itself */
      }
    }
  } catch (e) {
    console.error("[wg-invites] conversion failed:", e);
  }
}

/** Emails through which a member's people could newly qualify: the access
 * list (invited entries convert on their later sign-in via the sign-in hook)
 * plus the billing contact. Used when a membership becomes active. */
export async function memberReachableEmails(
  memberId: string,
): Promise<string[]> {
  try {
    const [member, access] = await Promise.all([
      db.member.findUnique({ where: { id: memberId } }),
      db.memberAccess.findMany({
        where: { memberId, status: { in: ["invited", "active"] } },
        select: { email: true },
      }),
    ]);
    const emails = access.map((a) => a.email);
    if (member?.primaryEmail) emails.push(member.primaryEmail);
    return emails;
  } catch (e) {
    console.error("[wg-invites] member email lookup failed:", e);
    return [];
  }
}
