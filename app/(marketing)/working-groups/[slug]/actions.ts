"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import {
  canAccessWg,
  isWgLead,
  personName,
  syncMeetConfig,
  syncScheduleToGoogle,
  userActiveClasses,
} from "@/app/lib/working-groups";
import {
  cancelOccurrence,
  deleteScheduleEvent,
  moveOccurrence,
  restoreOccurrence,
} from "@/app/lib/google-calendar";
import { setAutoTranscriptionByName } from "@/app/lib/google-meet";
import { buildRrule, nextOccurrences, wallToUtc, type Frequency } from "@/app/lib/recurrence";
import { minutesTargetFor, publishMinutes, publishTranscript } from "@/app/lib/minutes";
import { minutesAiConfigured } from "@/app/lib/minutes-ai";
import { MINUTES_LANGUAGES } from "@/app/lib/languages";
import {
  processInBackground,
  requestRegeneration,
  requestRetry,
} from "@/app/lib/transcripts";
import type { MeetAttendee, TranscriptEntry } from "@/app/lib/transcript-format";
import { notify } from "@/app/lib/access-emails";
import {
  sendJoinDeclinedEmail,
  sendJoinRequestEmail,
  sendWgInviteEmail,
  sendWgJoinedEmail,
} from "@/app/lib/wg-invite-emails";

export type ActionState = { error?: string; ok?: boolean; message?: string };

async function requireUser() {
  const user = await currentUser();
  if (!user?.id || !user.email) throw new Error("Not signed in.");
  return user as { id: string; email: string };
}

/** Lead-or-admin gate for every management action on a WG. */
async function requireManager(wgId: string) {
  const user = await requireUser();
  if (!(await isWgLead(user.id, wgId)) && !(await isAdmin(user.email))) {
    throw new Error("Forbidden");
  }
  return user;
}

async function audit(
  user: { id: string; email: string },
  action: string,
  wgId: string,
  after?: object,
) {
  await db.adminAction.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email,
      action,
      targetType: "WorkingGroup",
      targetId: wgId,
      after: after ? JSON.parse(JSON.stringify(after)) : undefined,
    },
  });
}

async function revalidateWg(wgId: string) {
  const wg = await db.workingGroup.findUnique({ where: { id: wgId } });
  if (wg) revalidatePath(`/working-groups/${wg.slug}`);
  revalidatePath("/working-groups");
  // The admin board reuses these actions (leads, invites) in its cards.
  revalidatePath("/admin/working-groups");
}

/** Push the attendee list / schedule to Google; never blocks the user action. */
async function trySync(wgId: string) {
  try {
    await syncScheduleToGoogle(wgId);
  } catch {
    /* recorded as syncError by the sync itself */
  }
}

// ── Participation ────────────────────────────────────────────────────────────

export async function joinWg(wgId: string, message?: string): Promise<ActionState> {
  const user = await requireUser();
  const wg = await db.workingGroup.findUniqueOrThrow({
    where: { id: wgId },
    include: { leads: { include: { user: true } } },
  });
  const classes = await userActiveClasses(user.id);
  if (!canAccessWg(wg.requiredClass, classes)) {
    return { error: "Your memberships don't grant access to this group." };
  }
  if (wg.visibility === "private") {
    // Private group: a lead must approve. Leads and admins join directly.
    const direct = (await isWgLead(user.id, wgId)) || (await isAdmin(user.email));
    if (!direct) {
      const existing = await db.wgJoinRequest.findUnique({
        where: { wgId_userId: { wgId, userId: user.id } },
      });
      if (existing?.status === "pending") {
        return { ok: true, message: "Your request is pending — a lead will review it." };
      }
      const note = (message ?? "").trim().slice(0, 1000) || null;
      await db.wgJoinRequest.upsert({
        where: { wgId_userId: { wgId, userId: user.id } },
        create: { wgId, userId: user.id, message: note },
        update: { status: "pending", message: note, decidedByUserId: null, decidedAt: null },
      });
      await audit(user, "wg.join.request", wgId, { userId: user.id });
      const requester = await db.user.findUnique({ where: { id: user.id } });
      for (const lead of wg.leads) {
        if (!lead.user.email) continue;
        notify(
          sendJoinRequestEmail({
            to: lead.user.email,
            wgName: wg.name,
            wgSlug: wg.slug,
            requesterName: requester ? personName(requester) : user.email,
            requesterEmail: user.email,
            message: note,
          }),
        );
      }
      await revalidateWg(wgId);
      return { ok: true, message: "Request sent — a lead will review it and you will be emailed." };
    }
  }
  await db.wgParticipant.upsert({
    where: { wgId_userId: { wgId, userId: user.id } },
    create: { wgId, userId: user.id },
    update: { leftAt: null, joinedAt: new Date() },
  });
  await trySync(wgId); // adds them as a Calendar attendee → Google sends the invite
  await revalidateWg(wgId);
  return { ok: true };
}

export async function leaveWg(wgId: string): Promise<ActionState> {
  const user = await requireUser();
  await db.wgParticipant.update({
    where: { wgId_userId: { wgId, userId: user.id } },
    data: { leftAt: new Date() },
  });
  await trySync(wgId);
  await revalidateWg(wgId);
  return { ok: true };
}

/** The requester withdraws a pending request to join a private group. */
export async function withdrawJoinRequest(wgId: string): Promise<ActionState> {
  const user = await requireUser();
  await db.wgJoinRequest.deleteMany({ where: { wgId, userId: user.id, status: "pending" } });
  await audit(user, "wg.join.withdraw", wgId, { userId: user.id });
  await revalidateWg(wgId);
  return { ok: true };
}

/** Lead approves a join request: the member joins like any participant. */
export async function approveJoinRequest(
  wgId: string,
  requestId: string,
): Promise<ActionState> {
  const user = await requireManager(wgId);
  const request = await db.wgJoinRequest.findUnique({
    where: { id: requestId },
    include: { user: true, wg: true },
  });
  if (!request || request.wgId !== wgId) return { error: "Request not found." };
  if (request.status !== "pending") return { error: "This request was already decided." };
  // The gate is re-checked at decision time: memberships may have lapsed.
  if (!canAccessWg(request.wg.requiredClass, await userActiveClasses(request.userId))) {
    return { error: "This member's memberships no longer grant access to the group." };
  }
  await db.$transaction([
    db.wgParticipant.upsert({
      where: { wgId_userId: { wgId, userId: request.userId } },
      create: { wgId, userId: request.userId },
      update: { leftAt: null, joinedAt: new Date() },
    }),
    db.wgJoinRequest.update({
      where: { id: requestId },
      data: { status: "approved", decidedByUserId: user.id, decidedAt: new Date() },
    }),
  ]);
  await audit(user, "wg.join.approve", wgId, { requestId, userId: request.userId });
  if (request.user.email) {
    notify(
      sendWgJoinedEmail({
        to: request.user.email,
        wgName: request.wg.name,
        wgSlug: request.wg.slug,
        role: "participant",
      }),
    );
  }
  await trySync(wgId); // Calendar attendee → Google sends the invitation
  await revalidateWg(wgId);
  return { ok: true, message: "Approved — they're a participant now." };
}

/** Lead declines a join request; the requester is told, without a reason. */
export async function declineJoinRequest(
  wgId: string,
  requestId: string,
): Promise<ActionState> {
  const user = await requireManager(wgId);
  const request = await db.wgJoinRequest.findUnique({
    where: { id: requestId },
    include: { user: true, wg: true },
  });
  if (!request || request.wgId !== wgId) return { error: "Request not found." };
  if (request.status !== "pending") return { error: "This request was already decided." };
  await db.wgJoinRequest.update({
    where: { id: requestId },
    data: { status: "declined", decidedByUserId: user.id, decidedAt: new Date() },
  });
  await audit(user, "wg.join.decline", wgId, { requestId, userId: request.userId });
  if (request.user.email) {
    notify(
      sendJoinDeclinedEmail({
        to: request.user.email,
        wgName: request.wg.name,
        wgSlug: request.wg.slug,
      }),
    );
  }
  await revalidateWg(wgId);
  return { ok: true, message: "Declined." };
}

/** Lead removes a participant. */
export async function removeParticipant(
  wgId: string,
  userId: string,
): Promise<ActionState> {
  const user = await requireManager(wgId);
  await db.wgParticipant.update({
    where: { wgId_userId: { wgId, userId } },
    data: { leftAt: new Date() },
  });
  await audit(user, "wg.participant.remove", wgId, { userId });
  await trySync(wgId);
  await revalidateWg(wgId);
  return { ok: true };
}

// ── Leads & email invites ────────────────────────────────────────────────────

const inviteMessage =
  "Invitation sent — they've been asked to join the Foundation and will " +
  "enter the group as soon as their membership is active.";

/** Record a pending invite and email the person to join the Foundation. */
async function createInvite(
  actor: { id: string; email: string },
  wg: { id: string; name: string; requiredClass: "any" | "associate" },
  email: string,
  role: "lead" | "participant",
): Promise<ActionState> {
  const existing = await db.wgInvite.findUnique({
    where: { wgId_email: { wgId: wg.id, email } },
  });
  const resending =
    existing && !existing.acceptedAt && existing.role === role;
  await db.wgInvite.upsert({
    where: { wgId_email: { wgId: wg.id, email } },
    create: { wgId: wg.id, email, role, invitedByUserId: actor.id },
    update: { role, invitedByUserId: actor.id, acceptedAt: null },
  });
  await audit(actor, resending ? "wg.invite.resend" : "wg.invite.add", wg.id, {
    email,
    role,
  });
  const inviter = await db.user.findUnique({ where: { id: actor.id } });
  notify(
    sendWgInviteEmail({
      to: email,
      wgName: wg.name,
      role,
      requiredClass: wg.requiredClass,
      invitedByName: inviter ? personName(inviter) : "The Verana Foundation",
    }),
  );
  return {
    ok: true,
    message: resending ? "Already invited — invitation re-sent." : inviteMessage,
  };
}

export async function addLead(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const wgId = String(formData.get("wgId"));
  const user = await requireManager(wgId);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid email is required." };
  }
  const wg = await db.workingGroup.findUniqueOrThrow({ where: { id: wgId } });
  const target = await db.user.findUnique({ where: { email } });
  if (!target) {
    // No account yet: invite instead — the person is emailed to join the
    // Foundation and becomes a lead once their membership is active.
    const res = await createInvite(user, wg, email, "lead");
    await revalidateWg(wgId);
    return res;
  }
  await db.wgLead.upsert({
    where: { wgId_userId: { wgId, userId: target.id } },
    create: { wgId, userId: target.id, addedByUserId: user.id },
    update: {},
  });
  await audit(user, "wg.lead.add", wgId, { email });
  await trySync(wgId); // leads are Calendar attendees too
  await revalidateWg(wgId);
  return { ok: true };
}

/** Lead/admin invites an email as a participant. Qualifying accounts are added
 * directly; everyone else gets a pending invite + a join-the-Foundation email. */
export async function inviteParticipant(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const wgId = String(formData.get("wgId"));
  const user = await requireManager(wgId);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid email is required." };
  }
  const wg = await db.workingGroup.findUniqueOrThrow({ where: { id: wgId } });
  const target = await db.user.findUnique({ where: { email } });
  const qualifies =
    !!target && canAccessWg(wg.requiredClass, await userActiveClasses(target.id));

  if (!target || !qualifies) {
    const res = await createInvite(user, wg, email, "participant");
    await revalidateWg(wgId);
    return res;
  }

  const prior = await db.wgParticipant.findUnique({
    where: { wgId_userId: { wgId, userId: target.id } },
  });
  if (prior && !prior.leftAt) {
    return { ok: true, message: "They're already a participant." };
  }
  await db.wgParticipant.upsert({
    where: { wgId_userId: { wgId, userId: target.id } },
    create: { wgId, userId: target.id },
    update: { leftAt: null, joinedAt: new Date() },
  });
  await audit(user, "wg.participant.add", wgId, { email });
  notify(
    sendWgJoinedEmail({
      to: email,
      wgName: wg.name,
      wgSlug: wg.slug,
      role: "participant",
    }),
  );
  await trySync(wgId);
  await revalidateWg(wgId);
  return { ok: true, message: "Added — they're a participant now." };
}

/** Withdraw a pending invite (the audit log keeps the trace). */
export async function revokeInvite(
  wgId: string,
  inviteId: string,
): Promise<ActionState> {
  const user = await requireManager(wgId);
  const invite = await db.wgInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.wgId !== wgId) return { error: "Invite not found." };
  if (invite.acceptedAt) return { error: "This invite was already accepted." };
  await db.wgInvite.delete({ where: { id: inviteId } });
  await audit(user, "wg.invite.revoke", wgId, {
    email: invite.email,
    role: invite.role,
  });
  await revalidateWg(wgId);
  return { ok: true };
}

/** Re-send the join-the-Foundation email for a pending invite. */
export async function resendInvite(
  wgId: string,
  inviteId: string,
): Promise<ActionState> {
  const user = await requireManager(wgId);
  const invite = await db.wgInvite.findUnique({
    where: { id: inviteId },
    include: { wg: true },
  });
  if (!invite || invite.wgId !== wgId) return { error: "Invite not found." };
  if (invite.acceptedAt) return { error: "This invite was already accepted." };
  const inviter = await db.user.findUnique({ where: { id: user.id } });
  notify(
    sendWgInviteEmail({
      to: invite.email,
      wgName: invite.wg.name,
      role: invite.role,
      requiredClass: invite.wg.requiredClass,
      invitedByName: inviter ? personName(inviter) : "The Verana Foundation",
    }),
  );
  await audit(user, "wg.invite.resend", wgId, { email: invite.email });
  return { ok: true, message: "Invitation re-sent." };
}

export async function removeLead(
  wgId: string,
  userId: string,
): Promise<ActionState> {
  const user = await requireManager(wgId);
  // ADR-0003 invariant: a WG with leads never drops to zero.
  const count = await db.wgLead.count({ where: { wgId } });
  if (count <= 1) {
    return { error: "A working group must keep at least one lead." };
  }
  await db.wgLead.delete({ where: { wgId_userId: { wgId, userId } } });
  await audit(user, "wg.lead.remove", wgId, { userId });
  await trySync(wgId);
  await revalidateWg(wgId);
  return { ok: true };
}

// ── Schedule ─────────────────────────────────────────────────────────────────

const scheduleSchema = z.object({
  wgId: z.string().min(1),
  // From <input type="datetime-local">: wall time in the chosen timezone.
  firstAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
  timezone: z.string().min(1),
  durationMin: z.coerce.number().int().min(15).max(480),
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
});

export async function saveSchedule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = scheduleSchema.safeParse({
    wgId: formData.get("wgId"),
    firstAt: formData.get("firstAt"),
    timezone: formData.get("timezone"),
    durationMin: formData.get("durationMin"),
    frequency: formData.get("frequency"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid schedule." };
  }
  const { wgId, firstAt, timezone, durationMin, frequency } = parsed.data;
  const user = await requireManager(wgId);

  // Resolve the wall time in the schedule's timezone (DST-correct).
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return { error: "Unknown timezone." };
  }
  const [date, time] = firstAt.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const startsAt = wallToUtc({ y, mo, d, h, mi }, timezone);
  const rrule = buildRrule(frequency as Frequency, startsAt, timezone);

  await db.wgSchedule.upsert({
    where: { wgId },
    create: { wgId, startsAt, durationMin, timezone, rrule },
    // A time/recurrence change invalidates per-occurrence exceptions.
    update: {
      startsAt, durationMin, timezone, rrule,
      exceptions: { deleteMany: {} },
    },
  });
  await audit(user, "wg.schedule.save", wgId, { startsAt, timezone, durationMin, rrule });
  const sync = await syncScheduleToGoogle(wgId);
  await revalidateWg(wgId);
  return sync.ok
    ? { ok: true }
    : { error: `Saved, but Calendar sync failed: ${sync.error}` };
}

export async function retrySync(wgId: string): Promise<ActionState> {
  await requireManager(wgId);
  const sync = await syncScheduleToGoogle(wgId);
  await revalidateWg(wgId);
  return sync.ok ? { ok: true } : { error: sync.error };
}

export async function deleteSchedule(wgId: string): Promise<ActionState> {
  const user = await requireManager(wgId);
  const schedule = await db.wgSchedule.findUnique({ where: { wgId } });
  if (!schedule) return { ok: true };
  if (schedule.googleEventId) {
    try {
      await deleteScheduleEvent(schedule.googleEventId); // cancels for attendees
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Calendar cancellation failed." };
    }
  }
  if (schedule.meetSpaceName && schedule.meetAutoTranscribe) {
    // Best effort: the orphaned space must not keep transcribing.
    await setAutoTranscriptionByName(schedule.meetSpaceName, false).catch(() => {});
  }
  await db.wgSchedule.delete({ where: { wgId } });
  await audit(user, "wg.schedule.delete", wgId);
  await revalidateWg(wgId);
  return { ok: true };
}

/** A draft session nobody has written in yet follows a moved meeting. */
async function redatePristineSession(wgId: string, from: Date, to: Date) {
  const session = await db.wgSession.findUnique({
    where: { wgId_occurredAt: { wgId, occurredAt: from } },
    include: { attendees: true, transcript: true },
  });
  if (!session || session.status !== "draft" || session.notesMd.trim() || session.attendees.length || session.transcript) return;
  const taken = await db.wgSession.findUnique({ where: { wgId_occurredAt: { wgId, occurredAt: to } } });
  if (taken) return;
  await db.wgSession.update({ where: { id: session.id }, data: { occurredAt: to } });
}

/** Store a Calendar-side failure on the schedule and surface it (site state is already saved). */
async function occurrenceSyncFailed(scheduleId: string, wgId: string, what: string, e: unknown) {
  const error = e instanceof Error ? e.message : String(e);
  await db.wgSchedule.update({ where: { id: scheduleId }, data: { syncError: error.slice(0, 1000) } });
  await revalidateWg(wgId);
  return { error: `${what} on the site, but Calendar sync failed: ${error}` };
}

/** "Remove next week's session": exception in DB + cancelled Calendar instance. */
export async function cancelMeeting(
  wgId: string,
  startIso: string,
  note?: string,
): Promise<ActionState> {
  const user = await requireManager(wgId);
  const schedule = await db.wgSchedule.findUnique({ where: { wgId } });
  if (!schedule) return { error: "No schedule." };
  const originalStart = new Date(startIso);
  await db.wgScheduleException.upsert({
    where: { scheduleId_originalStart: { scheduleId: schedule.id, originalStart } },
    create: { scheduleId: schedule.id, originalStart, note: note || null },
    // Cancelling a moved meeting cancels it altogether.
    update: { note: note || null, movedTo: null },
  });
  await audit(user, "wg.meeting.cancel", wgId, { originalStart, note });
  if (schedule.googleEventId) {
    try {
      await cancelOccurrence(schedule.googleEventId, originalStart);
    } catch (e) {
      return occurrenceSyncFailed(schedule.id, wgId, "Cancelled", e);
    }
  }
  await revalidateWg(wgId);
  return { ok: true };
}

const MOVE_MAX_DAYS = 60;

/**
 * Move one meeting to another date/time (same duration) — holidays, clashes.
 * `newLocal` is a datetime-local value in the schedule's timezone. The
 * Calendar instance moves with it and attendees are notified by Google.
 */
export async function moveMeeting(
  wgId: string,
  startIso: string,
  newLocal: string,
  note?: string,
): Promise<ActionState> {
  const user = await requireManager(wgId);
  const schedule = await db.wgSchedule.findUnique({
    where: { wgId },
    include: { exceptions: true },
  });
  if (!schedule) return { error: "No schedule." };
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(newLocal);
  if (!m) return { error: "Pick the new date and time." };
  const [, y, mo, d, h, mi] = m.map(Number);
  const originalStart = new Date(startIso);
  const newStart = wallToUtc({ y, mo, d, h, mi }, schedule.timezone);
  if (newStart.getTime() === originalStart.getTime()) {
    return { error: "That is already the meeting's time." };
  }
  if (Math.abs(newStart.getTime() - originalStart.getTime()) > MOVE_MAX_DAYS * 86_400_000) {
    return { error: `A meeting can be moved by at most ${MOVE_MAX_DAYS} days.` };
  }
  // No two meetings at the same instant: another series slot (unless that slot
  // is itself cancelled or moved away), another moved meeting, or an existing
  // session record.
  const [slot] = nextOccurrences(
    schedule.startsAt, schedule.timezone, schedule.rrule, new Date(newStart.getTime() - 60_000), 1,
  );
  const slotFree =
    !slot ||
    slot.getTime() !== newStart.getTime() ||
    schedule.exceptions.some((e) => e.originalStart.getTime() === slot.getTime());
  const otherMoved = schedule.exceptions.some(
    (e) => e.movedTo?.getTime() === newStart.getTime() && e.originalStart.getTime() !== originalStart.getTime(),
  );
  const session = await db.wgSession.findUnique({
    where: { wgId_occurredAt: { wgId, occurredAt: newStart } },
  });
  if (!slotFree || otherMoved || session) {
    return { error: "Another meeting of this group is already scheduled at that time." };
  }

  await db.wgScheduleException.upsert({
    where: { scheduleId_originalStart: { scheduleId: schedule.id, originalStart } },
    create: { scheduleId: schedule.id, originalStart, movedTo: newStart, note: note || null },
    update: { movedTo: newStart, note: note || null },
  });
  const previous = schedule.exceptions.find((e) => e.originalStart.getTime() === originalStart.getTime());
  await redatePristineSession(wgId, previous?.movedTo ?? originalStart, newStart);
  await audit(user, "wg.meeting.move", wgId, { originalStart, newStart, note });
  if (schedule.googleEventId) {
    try {
      await moveOccurrence(
        schedule.googleEventId, originalStart, newStart, schedule.durationMin, schedule.timezone,
      );
    } catch (e) {
      return occurrenceSyncFailed(schedule.id, wgId, "Moved", e);
    }
  }
  await revalidateWg(wgId);
  return { ok: true };
}

/** Undo a cancellation or a move: the meeting is back on its series slot. */
export async function restoreMeeting(
  wgId: string,
  startIso: string,
): Promise<ActionState> {
  const user = await requireManager(wgId);
  const schedule = await db.wgSchedule.findUnique({ where: { wgId } });
  if (!schedule) return { error: "No schedule." };
  const originalStart = new Date(startIso);
  const previous = await db.wgScheduleException.findUnique({
    where: { scheduleId_originalStart: { scheduleId: schedule.id, originalStart } },
  });
  await db.wgScheduleException.deleteMany({
    where: { scheduleId: schedule.id, originalStart },
  });
  if (previous?.movedTo) await redatePristineSession(wgId, previous.movedTo, originalStart);
  await audit(user, "wg.meeting.restore", wgId, { originalStart, wasMovedTo: previous?.movedTo ?? null });
  if (schedule.googleEventId) {
    try {
      await restoreOccurrence(
        schedule.googleEventId, originalStart, schedule.durationMin, schedule.timezone,
      );
    } catch (e) {
      return occurrenceSyncFailed(schedule.id, wgId, "Restored", e);
    }
  }
  await revalidateWg(wgId);
  return { ok: true };
}

// ── Automatic minutes settings (ADR-0004) ────────────────────────────────────

const settingsSchema = z.object({
  wgId: z.string().min(1),
  autoMinutes: z.boolean(),
  language: z.enum(MINUTES_LANGUAGES.map((l) => l.code) as [string, ...string[]]),
});

/** Lead/admin: toggle Meet transcription + AI drafts, pick the minutes language. */
export async function updateWgSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = settingsSchema.safeParse({
    wgId: formData.get("wgId"),
    autoMinutes: formData.get("autoMinutes") === "on",
    language: formData.get("language") ?? "en",
  });
  if (!parsed.success) return { error: "Invalid settings." };
  const { wgId, autoMinutes, language } = parsed.data;
  const user = await requireManager(wgId);
  const before = await db.workingGroup.findUniqueOrThrow({ where: { id: wgId } });
  await db.workingGroup.update({ where: { id: wgId }, data: { autoMinutes, language } });
  await audit(user, "wg.settings.update", wgId, { autoMinutes, language });
  // The Calendar description mentions transcription, so a toggle re-syncs the
  // event (which also pushes the Meet setting); a language change only needs
  // the Meet side checked.
  const sync =
    before.autoMinutes !== autoMinutes
      ? await syncScheduleToGoogle(wgId)
      : await syncMeetConfig(wgId);
  await revalidateWg(wgId);
  return sync.ok
    ? { ok: true, message: "Settings saved." }
    : { error: `Saved, but the Google sync failed: ${sync.error}` };
}

// ── Sessions & minutes (ADR-0004: leads only; participants read) ─────────────

/** Lead/admin gate for a session, resolving its group and transcript. */
async function requireSessionManager(sessionId: string) {
  const session = await db.wgSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { wg: true, transcript: true },
  });
  const user = await requireManager(session.wgId);
  return { user, session };
}

/** Open (or reopen) the session record for an occurrence and go edit it. */
export async function startSession(wgId: string, occurredAtIso: string) {
  const user = await requireManager(wgId);
  const wg = await db.workingGroup.findUniqueOrThrow({ where: { id: wgId } });
  const occurredAt = new Date(occurredAtIso);
  const session = await db.wgSession.upsert({
    where: { wgId_occurredAt: { wgId, occurredAt } },
    create: { wgId, occurredAt, recordedById: user.id },
    update: {},
  });
  redirect(`/working-groups/${wg.slug}/sessions/${session.id}`);
}

const saveSessionSchema = z.object({
  sessionId: z.string().min(1),
  notesMd: z.string().max(200_000),
  attendeeUserIds: z.array(z.string()),
  guests: z.string().max(2000), // comma/newline-separated free-text names
  publishTranscript: z.boolean(),
});

function parseSessionForm(formData: FormData) {
  return saveSessionSchema.safeParse({
    sessionId: formData.get("sessionId"),
    notesMd: formData.get("notesMd") ?? "",
    attendeeUserIds: formData.getAll("attendeeUserIds").map(String),
    guests: formData.get("guests") ?? "",
    publishTranscript: formData.get("publishTranscript") === "on",
  });
}

export async function saveSession(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseSessionForm(formData);
  if (!parsed.success) return { error: "Invalid input." };
  const { user, session } = await requireSessionManager(parsed.data.sessionId);

  // Attendance snapshot: registered users by current display name, plus guests.
  const users = await db.user.findMany({
    where: { id: { in: parsed.data.attendeeUserIds } },
  });
  const guests = parsed.data.guests
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  await db.$transaction([
    db.wgSessionAttendee.deleteMany({ where: { sessionId: session.id } }),
    db.wgSessionAttendee.createMany({
      data: [
        ...users.map((u) => ({ sessionId: session.id, userId: u.id, name: personName(u) })),
        ...guests.map((name) => ({ sessionId: session.id, name })),
      ],
    }),
    db.wgSession.update({
      where: { id: session.id },
      data: { notesMd: parsed.data.notesMd, recordedById: user.id },
    }),
    ...(session.transcript
      ? [
          db.wgTranscript.update({
            where: { id: session.transcript.id },
            data: { publishTranscript: parsed.data.publishTranscript },
          }),
        ]
      : []),
  ]);
  return { ok: true };
}

/**
 * Approve & publish: commit the minutes (and, if opted in, the transcript) to
 * the public repo. For an AI draft this is the lead's approval (ADR-0004 §4b).
 */
export async function publishSession(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Persist the latest edits first, then commit.
  const saved = await saveSession({}, formData);
  if (saved.error) return saved;
  const { user, session } = await requireSessionManager(
    String(formData.get("sessionId")),
  );
  const fresh = await db.wgSession.findUniqueOrThrow({
    where: { id: session.id },
    include: { attendees: true, transcript: true, wg: true },
  });
  const transcript =
    fresh.transcript && fresh.transcript.status !== "discarded" ? fresh.transcript : null;
  const actor = await db.user.findUnique({ where: { id: user.id } });
  const approver = actor ? personName(actor) : user.email;
  // Private groups publish to the private repository (members-only record).
  const target = minutesTargetFor(fresh.wg.visibility);

  try {
    let transcriptFile: { path: string; commitSha: string } | null = null;
    if (transcript && transcript.publishTranscript && transcript.entryCount > 0) {
      const entries = (transcript.entries ?? []) as unknown as TranscriptEntry[];
      const participants = (
        (transcript.meetParticipants ?? []) as unknown as MeetAttendee[]
      ).map((p) => p.name);
      transcriptFile = await publishTranscript({
        wgSlug: fresh.wg.slug,
        wgName: fresh.wg.name,
        date: fresh.occurredAt,
        startedAt: transcript.startedAt,
        language: transcript.language,
        participants,
        entries,
      }, target);
    }
    const aiDraft = fresh.source === "ai_draft" && !!transcript?.summaryModel;
    const { path, commitSha } = await publishMinutes({
      wgSlug: fresh.wg.slug,
      wgName: fresh.wg.name,
      date: fresh.occurredAt,
      attendees: fresh.attendees.map((a) => a.name),
      recordedBy: approver,
      markdown: fresh.notesMd,
      draftedBy: aiDraft ? transcript!.summaryModel : null,
      approvedBy: aiDraft ? approver : null,
      transcriptPath: transcriptFile?.path ?? transcript?.transcriptPath ?? null,
    }, target);
    await db.$transaction([
      db.wgSession.update({
        where: { id: session.id },
        data: {
          status: "published",
          notesPath: path,
          notesCommitSha: commitSha,
          recordedById: user.id,
        },
      }),
      ...(transcript
        ? [
            db.wgTranscript.update({
              where: { id: transcript.id },
              data: {
                status: "approved",
                ...(transcriptFile
                  ? {
                      transcriptPath: transcriptFile.path,
                      transcriptCommitSha: transcriptFile.commitSha,
                    }
                  : {}),
              },
            }),
          ]
        : []),
    ]);
    await audit(user, "wg.session.publish", session.wgId, {
      sessionId: session.id, path, commitSha,
    });
    if (transcript) {
      await audit(user, "wg.transcript.approve", session.wgId, {
        sessionId: session.id,
        transcriptId: transcript.id,
        transcriptPublished: !!transcriptFile,
      });
    }
    await revalidateWg(session.wgId);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Publishing failed." };
  }
}

export async function deleteSession(sessionId: string): Promise<ActionState> {
  const { user, session } = await requireSessionManager(sessionId);
  if (session.status === "published") {
    return { error: "Published sessions can't be deleted." };
  }
  await db.wgSession.delete({ where: { id: sessionId } }); // cascades to the transcript
  await audit(user, "wg.session.delete", session.wgId, { sessionId });
  await revalidateWg(session.wgId);
  return { ok: true };
}

/** Re-run the Claude step on the stored transcript (runs in the background). */
export async function regenerateDraft(sessionId: string): Promise<ActionState> {
  const { user, session } = await requireSessionManager(sessionId);
  const t = session.transcript;
  if (!t || t.entryCount === 0) return { error: "There is no transcript to draft from." };
  if (!minutesAiConfigured()) return { error: "Minutes AI is not configured on this server." };
  if (session.status === "published") {
    return { error: "Published minutes aren't regenerated; edit and republish them instead." };
  }
  await requestRegeneration(t.id);
  processInBackground(t.id);
  await audit(user, "wg.transcript.regenerate", session.wgId, { sessionId, transcriptId: t.id });
  await revalidateWg(session.wgId);
  return { ok: true, message: "Regenerating the draft — reload this page in a minute." };
}

/** Keep the transcript internal and drop the AI draft from the review queue. */
export async function discardDraft(sessionId: string): Promise<ActionState> {
  const { user, session } = await requireSessionManager(sessionId);
  const t = session.transcript;
  if (!t) return { error: "This session has no transcript." };
  await db.wgTranscript.update({
    where: { id: t.id },
    data: { status: "discarded", nextAttemptAt: null },
  });
  await audit(user, "wg.transcript.discard", session.wgId, { sessionId, transcriptId: t.id });
  await revalidateWg(session.wgId);
  return { ok: true, message: "Draft discarded. The transcript stays internal to the group." };
}

/** Put a failed transcript back on its step (runs in the background). */
export async function retryTranscript(sessionId: string): Promise<ActionState> {
  const { user, session } = await requireSessionManager(sessionId);
  const t = session.transcript;
  if (!t) return { error: "This session has no transcript." };
  await requestRetry(t.id);
  processInBackground(t.id);
  await audit(user, "wg.transcript.retry", session.wgId, { sessionId, transcriptId: t.id });
  await revalidateWg(session.wgId);
  return { ok: true, message: "Retrying — reload this page in a minute." };
}
