import type { Prisma } from "@prisma/client";
import { db } from "@/app/lib/db";
import { isAdmin } from "@/app/lib/authz";
import {
  canAccessWg,
  isWgLead,
  personName,
  slugify,
  syncMeetConfig,
  syncScheduleToGoogle,
  upcomingOccurrences,
  userActiveClasses,
} from "@/app/lib/working-groups";
import {
  cancelOccurrence,
  deleteScheduleEvent,
  moveOccurrence,
  restoreOccurrence,
} from "@/app/lib/google-calendar";
import { setAutoTranscriptionByName } from "@/app/lib/google-meet";
import {
  buildRrule,
  describeRrule,
  nextOccurrences,
  wallToUtc,
  type Frequency,
} from "@/app/lib/recurrence";
import {
  minutesTargetFor,
  minutesUrl,
  publishMinutes,
  publishTranscript,
} from "@/app/lib/minutes";
import { minutesAiConfigured } from "@/app/lib/minutes-ai";
import { refreshSessionSummary } from "@/app/lib/session-summary";
import { MINUTES_LANGUAGES } from "@/app/lib/languages";
import { WG_REGION_CODES } from "@/app/lib/regions";
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

/**
 * Working-group operations (ADR-0003/0004/0005), independent of how they are
 * invoked: the web server actions (session cookie) and the MCP tools (access
 * token) both call these with an `Actor`. Every function checks authorization
 * itself, audits what it changes, and returns a `Result`; it never touches the
 * Next.js request (no redirect, no revalidation — callers do that).
 */

export type Actor = { id: string; email: string; via?: "web" | "mcp" };
export type Result = { ok?: boolean; error?: string; message?: string };

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function isManager(actor: Actor, wgId: string): Promise<boolean> {
  return (await isWgLead(actor.id, wgId)) || (await isAdmin(actor.email));
}

/** Lead-or-admin gate for every management action on a WG. */
export async function assertManager(actor: Actor, wgId: string): Promise<void> {
  if (!(await isManager(actor, wgId))) throw new ForbiddenError();
}

export async function assertAdmin(actor: Actor): Promise<void> {
  if (!(await isAdmin(actor.email))) throw new ForbiddenError();
}

async function audit(actor: Actor, action: string, wgId: string, after?: object) {
  const payload = { ...(after ?? {}), ...(actor.via === "mcp" ? { via: "mcp" } : {}) };
  await db.adminAction.create({
    data: {
      actorUserId: actor.id,
      actorEmail: actor.email,
      action,
      targetType: "WorkingGroup",
      targetId: wgId,
      after: Object.keys(payload).length ? JSON.parse(JSON.stringify(payload)) : undefined,
    },
  });
}

/** Push the attendee list / schedule to Google; never blocks the user action. */
async function trySync(wgId: string) {
  try {
    await syncScheduleToGoogle(wgId);
  } catch {
    /* recorded as syncError by the sync itself */
  }
}

export async function wgIdBySlug(slug: string): Promise<string | null> {
  const wg = await db.workingGroup.findUnique({ where: { slug }, select: { id: true } });
  return wg?.id ?? null;
}

// ── Participation ────────────────────────────────────────────────────────────

export async function joinGroup(actor: Actor, wgId: string, message?: string): Promise<Result> {
  const wg = await db.workingGroup.findUniqueOrThrow({
    where: { id: wgId },
    include: { leads: { include: { user: true } } },
  });
  const classes = await userActiveClasses(actor.id);
  if (!canAccessWg(wg.requiredClass, classes)) {
    return { error: "Your memberships don't grant access to this group." };
  }
  if (wg.visibility === "private") {
    // Private group: a lead must approve. Leads and admins join directly.
    if (!(await isManager(actor, wgId))) {
      const existing = await db.wgJoinRequest.findUnique({
        where: { wgId_userId: { wgId, userId: actor.id } },
      });
      if (existing?.status === "pending") {
        return { ok: true, message: "Your request is pending — a lead will review it." };
      }
      const note = (message ?? "").trim().slice(0, 1000) || null;
      await db.wgJoinRequest.upsert({
        where: { wgId_userId: { wgId, userId: actor.id } },
        create: { wgId, userId: actor.id, message: note },
        update: { status: "pending", message: note, decidedByUserId: null, decidedAt: null },
      });
      await audit(actor, "wg.join.request", wgId, { userId: actor.id });
      const requester = await db.user.findUnique({ where: { id: actor.id } });
      for (const lead of wg.leads) {
        if (!lead.user.email) continue;
        notify(
          sendJoinRequestEmail({
            to: lead.user.email,
            wgName: wg.name,
            wgSlug: wg.slug,
            requesterName: requester ? personName(requester) : actor.email,
            requesterEmail: actor.email,
            message: note,
          }),
        );
      }
      return { ok: true, message: "Request sent — a lead will review it and you will be emailed." };
    }
  }
  await db.wgParticipant.upsert({
    where: { wgId_userId: { wgId, userId: actor.id } },
    create: { wgId, userId: actor.id },
    update: { leftAt: null, joinedAt: new Date() },
  });
  await trySync(wgId); // adds them as a Calendar attendee → Google sends the invite
  return { ok: true, message: "You're a participant now." };
}

export async function leaveGroup(actor: Actor, wgId: string): Promise<Result> {
  const participant = await db.wgParticipant.findUnique({
    where: { wgId_userId: { wgId, userId: actor.id } },
  });
  if (!participant || participant.leftAt) return { ok: true, message: "You're not a participant." };
  await db.wgParticipant.update({
    where: { wgId_userId: { wgId, userId: actor.id } },
    data: { leftAt: new Date() },
  });
  await trySync(wgId);
  return { ok: true };
}

/** The requester withdraws a pending request to join a private group. */
export async function withdrawJoinRequest(actor: Actor, wgId: string): Promise<Result> {
  await db.wgJoinRequest.deleteMany({ where: { wgId, userId: actor.id, status: "pending" } });
  await audit(actor, "wg.join.withdraw", wgId, { userId: actor.id });
  return { ok: true };
}

/** Lead approves a join request: the member joins like any participant. */
export async function approveJoinRequest(actor: Actor, wgId: string, requestId: string): Promise<Result> {
  await assertManager(actor, wgId);
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
      data: { status: "approved", decidedByUserId: actor.id, decidedAt: new Date() },
    }),
  ]);
  await audit(actor, "wg.join.approve", wgId, { requestId, userId: request.userId });
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
  return { ok: true, message: "Approved — they're a participant now." };
}

/** Lead declines a join request; the requester is told, without a reason. */
export async function declineJoinRequest(actor: Actor, wgId: string, requestId: string): Promise<Result> {
  await assertManager(actor, wgId);
  const request = await db.wgJoinRequest.findUnique({
    where: { id: requestId },
    include: { user: true, wg: true },
  });
  if (!request || request.wgId !== wgId) return { error: "Request not found." };
  if (request.status !== "pending") return { error: "This request was already decided." };
  await db.wgJoinRequest.update({
    where: { id: requestId },
    data: { status: "declined", decidedByUserId: actor.id, decidedAt: new Date() },
  });
  await audit(actor, "wg.join.decline", wgId, { requestId, userId: request.userId });
  if (request.user.email) {
    notify(
      sendJoinDeclinedEmail({ to: request.user.email, wgName: request.wg.name, wgSlug: request.wg.slug }),
    );
  }
  return { ok: true, message: "Declined." };
}

/** Lead removes a participant. */
export async function removeParticipant(actor: Actor, wgId: string, userId: string): Promise<Result> {
  await assertManager(actor, wgId);
  const participant = await db.wgParticipant.findUnique({ where: { wgId_userId: { wgId, userId } } });
  if (!participant) return { error: "Not a participant of this group." };
  await db.wgParticipant.update({
    where: { wgId_userId: { wgId, userId } },
    data: { leftAt: new Date() },
  });
  await audit(actor, "wg.participant.remove", wgId, { userId });
  await trySync(wgId);
  return { ok: true };
}

// ── Leads & email invites ────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inviteMessage =
  "Invitation sent — they've been asked to join the Foundation and will " +
  "enter the group as soon as their membership is active.";

/** Record a pending invite and email the person to join the Foundation. */
async function createInvite(
  actor: Actor,
  wg: { id: string; name: string; requiredClass: "any" | "associate" },
  email: string,
  role: "lead" | "participant",
): Promise<Result> {
  const existing = await db.wgInvite.findUnique({ where: { wgId_email: { wgId: wg.id, email } } });
  const resending = existing && !existing.acceptedAt && existing.role === role;
  await db.wgInvite.upsert({
    where: { wgId_email: { wgId: wg.id, email } },
    create: { wgId: wg.id, email, role, invitedByUserId: actor.id },
    update: { role, invitedByUserId: actor.id, acceptedAt: null },
  });
  await audit(actor, resending ? "wg.invite.resend" : "wg.invite.add", wg.id, { email, role });
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
  return { ok: true, message: resending ? "Already invited — invitation re-sent." : inviteMessage };
}

export async function addLead(actor: Actor, wgId: string, rawEmail: string): Promise<Result> {
  await assertManager(actor, wgId);
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "A valid email is required." };
  const wg = await db.workingGroup.findUniqueOrThrow({ where: { id: wgId } });
  const target = await db.user.findUnique({ where: { email } });
  if (!target) {
    // No account yet: invite instead — the person is emailed to join the
    // Foundation and becomes a lead once their membership is active.
    return createInvite(actor, wg, email, "lead");
  }
  await db.wgLead.upsert({
    where: { wgId_userId: { wgId, userId: target.id } },
    create: { wgId, userId: target.id, addedByUserId: actor.id },
    update: {},
  });
  await audit(actor, "wg.lead.add", wgId, { email });
  await trySync(wgId); // leads are Calendar attendees and Meet co-hosts
  return { ok: true, message: `${personName(target)} is a lead now.` };
}

/** Lead/admin invites an email as a participant. Qualifying accounts are added
 * directly; everyone else gets a pending invite + a join-the-Foundation email. */
export async function inviteParticipant(actor: Actor, wgId: string, rawEmail: string): Promise<Result> {
  await assertManager(actor, wgId);
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "A valid email is required." };
  const wg = await db.workingGroup.findUniqueOrThrow({ where: { id: wgId } });
  const target = await db.user.findUnique({ where: { email } });
  const qualifies = !!target && canAccessWg(wg.requiredClass, await userActiveClasses(target.id));
  if (!target || !qualifies) return createInvite(actor, wg, email, "participant");

  const prior = await db.wgParticipant.findUnique({ where: { wgId_userId: { wgId, userId: target.id } } });
  if (prior && !prior.leftAt) return { ok: true, message: "They're already a participant." };
  await db.wgParticipant.upsert({
    where: { wgId_userId: { wgId, userId: target.id } },
    create: { wgId, userId: target.id },
    update: { leftAt: null, joinedAt: new Date() },
  });
  await audit(actor, "wg.participant.add", wgId, { email });
  notify(sendWgJoinedEmail({ to: email, wgName: wg.name, wgSlug: wg.slug, role: "participant" }));
  await trySync(wgId);
  return { ok: true, message: "Added — they're a participant now." };
}

/** Withdraw a pending invite (the audit log keeps the trace). */
export async function revokeInvite(actor: Actor, wgId: string, inviteId: string): Promise<Result> {
  await assertManager(actor, wgId);
  const invite = await db.wgInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.wgId !== wgId) return { error: "Invite not found." };
  if (invite.acceptedAt) return { error: "This invite was already accepted." };
  await db.wgInvite.delete({ where: { id: inviteId } });
  await audit(actor, "wg.invite.revoke", wgId, { email: invite.email, role: invite.role });
  return { ok: true };
}

/** Re-send the join-the-Foundation email for a pending invite. */
export async function resendInvite(actor: Actor, wgId: string, inviteId: string): Promise<Result> {
  await assertManager(actor, wgId);
  const invite = await db.wgInvite.findUnique({ where: { id: inviteId }, include: { wg: true } });
  if (!invite || invite.wgId !== wgId) return { error: "Invite not found." };
  if (invite.acceptedAt) return { error: "This invite was already accepted." };
  const inviter = await db.user.findUnique({ where: { id: actor.id } });
  notify(
    sendWgInviteEmail({
      to: invite.email,
      wgName: invite.wg.name,
      role: invite.role,
      requiredClass: invite.wg.requiredClass,
      invitedByName: inviter ? personName(inviter) : "The Verana Foundation",
    }),
  );
  await audit(actor, "wg.invite.resend", wgId, { email: invite.email });
  return { ok: true, message: "Invitation re-sent." };
}

export async function removeLead(actor: Actor, wgId: string, userId: string): Promise<Result> {
  await assertManager(actor, wgId);
  // ADR-0003 invariant: a WG with leads never drops to zero.
  const count = await db.wgLead.count({ where: { wgId } });
  if (count <= 1) return { error: "A working group must keep at least one lead." };
  const lead = await db.wgLead.findUnique({ where: { wgId_userId: { wgId, userId } } });
  if (!lead) return { error: "Not a lead of this group." };
  await db.wgLead.delete({ where: { wgId_userId: { wgId, userId } } });
  await audit(actor, "wg.lead.remove", wgId, { userId });
  await trySync(wgId);
  return { ok: true };
}

// ── Schedule ─────────────────────────────────────────────────────────────────

export type ScheduleInput = {
  firstAt: string; // "YYYY-MM-DDTHH:mm" wall time in `timezone`
  timezone: string;
  durationMin: number;
  frequency: Frequency;
};

export const FREQUENCIES: Frequency[] = ["weekly", "biweekly", "monthly"];

/** Parse "YYYY-MM-DDTHH:mm" in a timezone into a UTC instant; null if malformed. */
export function wallInputToUtc(local: string, timezone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return null;
  }
  return wallToUtc({ y, mo, d, h, mi }, timezone);
}

export async function saveSchedule(actor: Actor, wgId: string, input: ScheduleInput): Promise<Result> {
  await assertManager(actor, wgId);
  if (!Number.isInteger(input.durationMin) || input.durationMin < 15 || input.durationMin > 480) {
    return { error: "Duration must be between 15 and 480 minutes." };
  }
  if (!FREQUENCIES.includes(input.frequency)) return { error: "Unknown frequency." };
  const startsAt = wallInputToUtc(input.firstAt, input.timezone);
  if (!startsAt) return { error: "Invalid first meeting time or unknown timezone." };
  const rrule = buildRrule(input.frequency, startsAt, input.timezone);
  const { timezone, durationMin } = input;
  await db.wgSchedule.upsert({
    where: { wgId },
    create: { wgId, startsAt, durationMin, timezone, rrule },
    // A time/recurrence change invalidates per-occurrence exceptions.
    update: { startsAt, durationMin, timezone, rrule, exceptions: { deleteMany: {} } },
  });
  await audit(actor, "wg.schedule.save", wgId, { startsAt, timezone, durationMin, rrule });
  const sync = await syncScheduleToGoogle(wgId);
  return sync.ok ? { ok: true, message: "Schedule saved and synced." } : { error: `Saved, but Calendar sync failed: ${sync.error}` };
}

export async function retrySync(actor: Actor, wgId: string): Promise<Result> {
  await assertManager(actor, wgId);
  const sync = await syncScheduleToGoogle(wgId);
  return sync.ok ? { ok: true } : { error: sync.error };
}

export async function deleteSchedule(actor: Actor, wgId: string): Promise<Result> {
  await assertManager(actor, wgId);
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
  await audit(actor, "wg.schedule.delete", wgId);
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
async function occurrenceSyncFailed(scheduleId: string, what: string, e: unknown): Promise<Result> {
  const error = e instanceof Error ? e.message : String(e);
  await db.wgSchedule.update({ where: { id: scheduleId }, data: { syncError: error.slice(0, 1000) } });
  return { error: `${what} on the site, but Calendar sync failed: ${error}` };
}

/** "Remove next week's session": exception in DB + cancelled Calendar instance. */
export async function cancelMeeting(actor: Actor, wgId: string, originalStart: Date, note?: string): Promise<Result> {
  await assertManager(actor, wgId);
  const schedule = await db.wgSchedule.findUnique({ where: { wgId } });
  if (!schedule) return { error: "No schedule." };
  await db.wgScheduleException.upsert({
    where: { scheduleId_originalStart: { scheduleId: schedule.id, originalStart } },
    create: { scheduleId: schedule.id, originalStart, note: note || null },
    // Cancelling a moved meeting cancels it altogether.
    update: { note: note || null, movedTo: null },
  });
  await audit(actor, "wg.meeting.cancel", wgId, { originalStart, note });
  if (schedule.googleEventId) {
    try {
      await cancelOccurrence(schedule.googleEventId, originalStart);
    } catch (e) {
      return occurrenceSyncFailed(schedule.id, "Cancelled", e);
    }
  }
  return { ok: true };
}

export const MOVE_MAX_DAYS = 60;

/**
 * Move one meeting to another date/time (same duration) — holidays, clashes.
 * `newLocal` is "YYYY-MM-DDTHH:mm" in the schedule's timezone. The Calendar
 * instance moves with it and attendees are notified by Google.
 */
export async function moveMeeting(
  actor: Actor,
  wgId: string,
  originalStart: Date,
  newLocal: string,
  note?: string,
): Promise<Result> {
  await assertManager(actor, wgId);
  const schedule = await db.wgSchedule.findUnique({ where: { wgId }, include: { exceptions: true } });
  if (!schedule) return { error: "No schedule." };
  const newStart = wallInputToUtc(newLocal, schedule.timezone);
  if (!newStart) return { error: "Pick the new date and time (YYYY-MM-DDTHH:mm)." };
  if (newStart.getTime() === originalStart.getTime()) return { error: "That is already the meeting's time." };
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
  const session = await db.wgSession.findUnique({ where: { wgId_occurredAt: { wgId, occurredAt: newStart } } });
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
  await audit(actor, "wg.meeting.move", wgId, { originalStart, newStart, note });
  if (schedule.googleEventId) {
    try {
      await moveOccurrence(schedule.googleEventId, originalStart, newStart, schedule.durationMin, schedule.timezone);
    } catch (e) {
      return occurrenceSyncFailed(schedule.id, "Moved", e);
    }
  }
  return { ok: true, message: `Moved to ${newStart.toISOString()}.` };
}

/** Undo a cancellation or a move: the meeting is back on its series slot. */
export async function restoreMeeting(actor: Actor, wgId: string, originalStart: Date): Promise<Result> {
  await assertManager(actor, wgId);
  const schedule = await db.wgSchedule.findUnique({ where: { wgId } });
  if (!schedule) return { error: "No schedule." };
  const previous = await db.wgScheduleException.findUnique({
    where: { scheduleId_originalStart: { scheduleId: schedule.id, originalStart } },
  });
  await db.wgScheduleException.deleteMany({ where: { scheduleId: schedule.id, originalStart } });
  if (previous?.movedTo) await redatePristineSession(wgId, previous.movedTo, originalStart);
  await audit(actor, "wg.meeting.restore", wgId, { originalStart, wasMovedTo: previous?.movedTo ?? null });
  if (schedule.googleEventId) {
    try {
      await restoreOccurrence(schedule.googleEventId, originalStart, schedule.durationMin, schedule.timezone);
    } catch (e) {
      return occurrenceSyncFailed(schedule.id, "Restored", e);
    }
  }
  return { ok: true };
}

// ── Group settings (ADR-0004) ────────────────────────────────────────────────

export const LANGUAGE_CODES = MINUTES_LANGUAGES.map((l) => l.code);

/** Lead/admin: toggle Meet transcription + AI drafts, pick the working language. */
export async function updateSettings(
  actor: Actor,
  wgId: string,
  input: { autoMinutes?: boolean; language?: string },
): Promise<Result> {
  await assertManager(actor, wgId);
  const before = await db.workingGroup.findUniqueOrThrow({ where: { id: wgId } });
  const autoMinutes = input.autoMinutes ?? before.autoMinutes;
  const language = input.language ?? before.language;
  if (!LANGUAGE_CODES.includes(language)) return { error: `Unknown language; use one of ${LANGUAGE_CODES.join(", ")}.` };
  await db.workingGroup.update({ where: { id: wgId }, data: { autoMinutes, language } });
  await audit(actor, "wg.settings.update", wgId, { autoMinutes, language });
  // The Calendar description mentions transcription, so a toggle re-syncs the
  // event (which also pushes the Meet setting); a language change only needs
  // the Meet side checked.
  const sync = before.autoMinutes !== autoMinutes ? await syncScheduleToGoogle(wgId) : await syncMeetConfig(wgId);
  return sync.ok ? { ok: true, message: "Settings saved." } : { error: `Saved, but the Google sync failed: ${sync.error}` };
}

// ── Admin: groups ────────────────────────────────────────────────────────────

/** A slug from the name, suffixed on collision. Slugs are stable after create
 * (they name URLs and the minutes-repo folder), so renames don't touch them. */
export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "wg";
  for (let i = 0; ; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await db.workingGroup.findUnique({ where: { slug } }))) return slug;
  }
}

export type GroupInput = {
  name: string;
  description?: string | null;
  link: string;
  requiredClass?: "any" | "associate";
  visibility?: "public" | "private";
  region?: (typeof WG_REGION_CODES)[number];
  language?: string;
  autoMinutes?: boolean;
  showOnHome?: boolean;
  state?: "enabled" | "disabled";
  priority?: number;
};

export async function createGroup(actor: Actor, input: GroupInput): Promise<Result & { slug?: string }> {
  await assertAdmin(actor);
  if (!input.name.trim()) return { error: "A name is required." };
  if (!/^https?:\/\//.test(input.link)) return { error: "The external link must be a URL." };
  if (input.language && !LANGUAGE_CODES.includes(input.language)) return { error: "Unknown language." };
  const wg = await db.workingGroup.create({
    data: {
      name: input.name.trim(),
      slug: await uniqueSlug(input.name),
      description: input.description?.trim() || null,
      link: input.link,
      requiredClass: input.requiredClass ?? "any",
      visibility: input.visibility ?? "public",
      region: input.region ?? "global",
      language: input.language ?? "en",
      autoMinutes: input.autoMinutes ?? true,
      showOnHome: input.showOnHome ?? false,
      state: input.state ?? "enabled",
      priority: input.priority ?? 0,
    },
  });
  await audit(actor, "wg.create", wg.id, { ...input, slug: wg.slug });
  return { ok: true, slug: wg.slug, message: `Created /working-groups/${wg.slug}.` };
}

/** Edit a group's content and settings (not its required membership class). */
export async function updateGroup(
  actor: Actor,
  wgId: string,
  input: Partial<Omit<GroupInput, "requiredClass">>,
): Promise<Result> {
  await assertAdmin(actor);
  const current = await db.workingGroup.findUniqueOrThrow({ where: { id: wgId } });
  if (input.link !== undefined && !/^https?:\/\//.test(input.link)) return { error: "The external link must be a URL." };
  if (input.language !== undefined && !LANGUAGE_CODES.includes(input.language)) return { error: "Unknown language." };
  const state = input.state ?? current.state;
  // Stamp disabledAt on the enabled→disabled transition; keep it while it stays
  // disabled; clear it when re-enabled.
  const disabledAt =
    state === "disabled" ? (current.state === "disabled" ? current.disabledAt : new Date()) : null;
  const data: Prisma.WorkingGroupUpdateInput = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    ...(input.link !== undefined ? { link: input.link } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(input.region !== undefined ? { region: input.region } : {}),
    ...(input.language !== undefined ? { language: input.language } : {}),
    ...(input.showOnHome !== undefined ? { showOnHome: input.showOnHome } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    state,
    disabledAt,
  };
  await db.workingGroup.update({ where: { id: wgId }, data });
  await audit(actor, "wg.update", wgId, input);
  // The Calendar description mentions transcription, so a toggle re-syncs the
  // event (and the Meet space); otherwise only the Meet side is checked.
  if (input.autoMinutes !== undefined && current.autoMinutes !== input.autoMinutes) {
    await db.workingGroup.update({ where: { id: wgId }, data: { autoMinutes: input.autoMinutes } });
    await syncScheduleToGoogle(wgId);
  } else if (input.language !== undefined) {
    await syncMeetConfig(wgId);
  }
  return { ok: true };
}

// ── Sessions & minutes (ADR-0004: leads write; participants read) ────────────

/** Lead/admin gate for a session, resolving its group and transcript. */
async function sessionForManager(actor: Actor, sessionId: string) {
  const session = await db.wgSession.findUnique({
    where: { id: sessionId },
    include: { wg: true, transcript: true },
  });
  if (!session) return null;
  await assertManager(actor, session.wgId);
  return session;
}

/** Open (or reopen) the session record for an occurrence. */
export async function openSession(
  actor: Actor,
  wgId: string,
  occurredAt: Date,
): Promise<Result & { sessionId?: string; slug?: string }> {
  await assertManager(actor, wgId);
  const wg = await db.workingGroup.findUniqueOrThrow({ where: { id: wgId } });
  const session = await db.wgSession.upsert({
    where: { wgId_occurredAt: { wgId, occurredAt } },
    create: { wgId, occurredAt, recordedById: actor.id },
    update: {},
  });
  return { ok: true, sessionId: session.id, slug: wg.slug };
}

export type SessionInput = {
  notesMd?: string;
  attendeeUserIds?: string[];
  guests?: string[]; // free-text names
  publishTranscript?: boolean;
};

/** Save attendance and/or minutes; undefined fields are left as they are. */
export async function saveSession(actor: Actor, sessionId: string, input: SessionInput): Promise<Result> {
  const session = await sessionForManager(actor, sessionId);
  if (!session) return { error: "Session not found." };
  if (input.notesMd !== undefined && input.notesMd.length > 200_000) return { error: "Minutes are too long." };
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (input.attendeeUserIds !== undefined || input.guests !== undefined) {
    const current = await db.wgSessionAttendee.findMany({ where: { sessionId } });
    const userIds = input.attendeeUserIds ?? current.filter((a) => a.userId).map((a) => a.userId!);
    const guests = (input.guests ?? current.filter((a) => !a.userId).map((a) => a.name))
      .map((s) => s.trim())
      .filter(Boolean);
    // Attendance snapshot: registered users by current display name, plus guests.
    const users = await db.user.findMany({ where: { id: { in: userIds } } });
    ops.push(
      db.wgSessionAttendee.deleteMany({ where: { sessionId } }),
      db.wgSessionAttendee.createMany({
        data: [
          ...users.map((u) => ({ sessionId, userId: u.id, name: personName(u) })),
          ...guests.map((name) => ({ sessionId, name })),
        ],
      }),
    );
  }
  ops.push(
    db.wgSession.update({
      where: { id: sessionId },
      data: { ...(input.notesMd !== undefined ? { notesMd: input.notesMd } : {}), recordedById: actor.id },
    }),
  );
  if (session.transcript && input.publishTranscript !== undefined) {
    ops.push(
      db.wgTranscript.update({
        where: { id: session.transcript.id },
        data: { publishTranscript: input.publishTranscript },
      }),
    );
  }
  await db.$transaction(ops);
  return { ok: true, message: "Saved." };
}

/**
 * Approve & publish: commit the minutes (and, if opted in, the transcript) to
 * the group's repo. For an AI draft this is the lead's approval (ADR-0004 §4b).
 */
export async function publishSession(
  actor: Actor,
  sessionId: string,
  input: SessionInput,
): Promise<Result & { url?: string | null }> {
  // Persist the latest edits first, then commit.
  const saved = await saveSession(actor, sessionId, input);
  if (saved.error) return saved;
  const fresh = await db.wgSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { attendees: true, transcript: true, wg: true },
  });
  const transcript = fresh.transcript && fresh.transcript.status !== "discarded" ? fresh.transcript : null;
  const approverUser = await db.user.findUnique({ where: { id: actor.id } });
  const approver = approverUser ? personName(approverUser) : actor.email;
  // Private groups publish to the private repository (members-only record).
  const target = minutesTargetFor(fresh.wg.visibility);

  try {
    let transcriptFile: { path: string; commitSha: string } | null = null;
    if (transcript && transcript.publishTranscript && transcript.entryCount > 0) {
      const entries = (transcript.entries ?? []) as unknown as TranscriptEntry[];
      const participants = ((transcript.meetParticipants ?? []) as unknown as MeetAttendee[]).map((p) => p.name);
      transcriptFile = await publishTranscript(
        {
          wgSlug: fresh.wg.slug,
          wgName: fresh.wg.name,
          date: fresh.occurredAt,
          startedAt: transcript.startedAt,
          language: transcript.language,
          participants,
          entries,
        },
        target,
      );
    }
    const aiDraft = fresh.source === "ai_draft" && !!transcript?.summaryModel;
    const { path, commitSha } = await publishMinutes(
      {
        wgSlug: fresh.wg.slug,
        wgName: fresh.wg.name,
        date: fresh.occurredAt,
        attendees: fresh.attendees.map((a) => a.name),
        recordedBy: approver,
        markdown: fresh.notesMd,
        draftedBy: aiDraft ? transcript!.summaryModel : null,
        approvedBy: aiDraft ? approver : null,
        transcriptPath: transcriptFile?.path ?? transcript?.transcriptPath ?? null,
      },
      target,
    );
    await db.$transaction([
      db.wgSession.update({
        where: { id: sessionId },
        data: { status: "published", notesPath: path, notesCommitSha: commitSha, recordedById: actor.id },
      }),
      ...(transcript
        ? [
            db.wgTranscript.update({
              where: { id: transcript.id },
              data: {
                status: "approved",
                ...(transcriptFile
                  ? { transcriptPath: transcriptFile.path, transcriptCommitSha: transcriptFile.commitSha }
                  : {}),
              },
            }),
          ]
        : []),
    ]);
    await audit(actor, "wg.session.publish", fresh.wgId, { sessionId, path, commitSha });
    if (transcript) {
      await audit(actor, "wg.transcript.approve", fresh.wgId, {
        sessionId,
        transcriptId: transcript.id,
        transcriptPublished: !!transcriptFile,
      });
    }
    // The card one-liner follows the published text; best effort, the cron
    // backfills it when the AI is unavailable right now.
    await refreshSessionSummary(sessionId).catch((e) =>
      console.warn(`[wg-service] summary of session ${sessionId} failed:`, e),
    );
    return { ok: true, message: "Published.", url: minutesUrl(path, commitSha, target) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Publishing failed." };
  }
}

export async function deleteSession(actor: Actor, sessionId: string): Promise<Result> {
  const session = await sessionForManager(actor, sessionId);
  if (!session) return { error: "Session not found." };
  if (session.status === "published") return { error: "Published sessions can't be deleted." };
  await db.wgSession.delete({ where: { id: sessionId } }); // cascades to the transcript
  await audit(actor, "wg.session.delete", session.wgId, { sessionId });
  return { ok: true };
}

/** Re-run the Claude step on the stored transcript (runs in the background). */
export async function regenerateDraft(actor: Actor, sessionId: string): Promise<Result> {
  const session = await sessionForManager(actor, sessionId);
  if (!session) return { error: "Session not found." };
  const t = session.transcript;
  if (!t || t.entryCount === 0) return { error: "There is no transcript to draft from." };
  if (!minutesAiConfigured()) return { error: "Minutes AI is not configured on this server." };
  if (session.status === "published") {
    return { error: "Published minutes aren't regenerated; edit and republish them instead." };
  }
  await requestRegeneration(t.id);
  processInBackground(t.id);
  await audit(actor, "wg.transcript.regenerate", session.wgId, { sessionId, transcriptId: t.id });
  return { ok: true, message: "Regenerating the draft — check again in a minute." };
}

/** Keep the transcript internal and drop the AI draft from the review queue. */
export async function discardDraft(actor: Actor, sessionId: string): Promise<Result> {
  const session = await sessionForManager(actor, sessionId);
  if (!session) return { error: "Session not found." };
  const t = session.transcript;
  if (!t) return { error: "This session has no transcript." };
  await db.wgTranscript.update({ where: { id: t.id }, data: { status: "discarded", nextAttemptAt: null } });
  await audit(actor, "wg.transcript.discard", session.wgId, { sessionId, transcriptId: t.id });
  return { ok: true, message: "Draft discarded. The transcript stays internal to the group." };
}

/** Put a failed transcript back on its step (runs in the background). */
export async function retryTranscript(actor: Actor, sessionId: string): Promise<Result> {
  const session = await sessionForManager(actor, sessionId);
  if (!session) return { error: "Session not found." };
  const t = session.transcript;
  if (!t) return { error: "This session has no transcript." };
  await requestRetry(t.id);
  processInBackground(t.id);
  await audit(actor, "wg.transcript.retry", session.wgId, { sessionId, transcriptId: t.id });
  return { ok: true, message: "Retrying — check again in a minute." };
}

// ── Read views (role-aware; shared by the MCP tools) ─────────────────────────

/** How a viewer relates to a group; drives what the read views include. */
export async function viewerRole(actor: Actor | null, wgId: string) {
  if (!actor) return { lead: false, participant: false, admin: false, member: false };
  const [lead, admin, participant] = await Promise.all([
    isWgLead(actor.id, wgId),
    isAdmin(actor.email),
    db.wgParticipant.findUnique({ where: { wgId_userId: { wgId, userId: actor.id } } }),
  ]);
  const isParticipant = !!participant && !participant.leftAt;
  return { lead, participant: isParticipant, admin, member: lead || admin || isParticipant };
}

/** Everything the MCP `get_working_group` tool returns, trimmed by role. */
export async function groupView(actor: Actor | null, slug: string) {
  const wg = await db.workingGroup.findUnique({
    where: { slug },
    include: {
      leads: { include: { user: true }, orderBy: { createdAt: "asc" } },
      participants: { where: { leftAt: null }, include: { user: true } },
      schedule: { include: { exceptions: true } },
      joinRequests: { where: { status: "pending" }, include: { user: true } },
      sessions: { orderBy: { occurredAt: "desc" }, include: { attendees: true, transcript: { select: { status: true } } } },
    },
  });
  if (!wg || wg.state !== "enabled") return null;
  const role = await viewerRole(actor, wg.id);
  const hidden = wg.visibility === "private" && !role.member;
  const occurrences = wg.schedule ? upcomingOccurrences(wg.schedule, 8) : [];
  const myRequest = actor ? await db.wgJoinRequest.findUnique({ where: { wgId_userId: { wgId: wg.id, userId: actor.id } } }) : null;
  return {
    id: wg.id,
    slug: wg.slug,
    name: wg.name,
    description: wg.description,
    requiredClass: wg.requiredClass,
    visibility: wg.visibility,
    region: wg.region,
    language: wg.language,
    autoMinutes: wg.autoMinutes,
    externalLink: wg.link,
    url: `${process.env.AUTH_URL ?? "https://veranafoundation.org"}/working-groups/${wg.slug}`,
    yourRole: role,
    yourJoinRequest: myRequest?.status ?? null,
    leads: wg.leads.map((l) => ({ userId: l.userId, name: personName(l.user), ...(role.member ? { email: l.user.email } : {}) })),
    participants: hidden ? undefined : wg.participants.map((p) => ({ userId: p.userId, name: personName(p.user), ...(role.lead || role.admin ? { email: p.user.email } : {}) })),
    participantCount: hidden ? undefined : wg.participants.length,
    schedule: wg.schedule
      ? {
          summary: describeRrule(wg.schedule.rrule, wg.schedule.startsAt, wg.schedule.timezone),
          timezone: wg.schedule.timezone,
          durationMin: wg.schedule.durationMin,
          rrule: wg.schedule.rrule,
          meetLink: role.member ? wg.schedule.meetLink : undefined,
          upcoming: occurrences.map((o) => ({
            start: o.start.toISOString(),
            originalStart: o.originalStart.toISOString(),
            cancelled: o.cancelled,
            movedTo: o.movedTo?.toISOString() ?? null,
            movedFrom: o.movedFrom?.toISOString() ?? null,
            note: o.note,
          })),
        }
      : null,
    pendingJoinRequests: role.lead || role.admin
      ? wg.joinRequests.map((r) => ({ id: r.id, userId: r.userId, name: personName(r.user), email: r.user.email, message: r.message, createdAt: r.createdAt.toISOString() }))
      : undefined,
    sessions: hidden
      ? undefined
      : wg.sessions
          .filter((s) => s.status === "published" || role.member)
          .map((s) => ({
            id: s.id,
            occurredAt: s.occurredAt.toISOString(),
            status: s.status,
            source: s.source,
            summary: s.summary,
            attendees: s.attendees.length,
            transcript: s.transcript?.status ?? null,
          })),
  };
}

/** A session with its minutes; the transcript and AI notes for members/leads. */
export async function sessionView(actor: Actor | null, sessionId: string) {
  const session = await db.wgSession.findUnique({
    where: { id: sessionId },
    include: { wg: true, attendees: true, transcript: true, recordedBy: true },
  });
  if (!session) return null;
  const role = await viewerRole(actor, session.wgId);
  const hidden = session.wg.visibility === "private" && !role.member;
  if (hidden || (session.status !== "published" && !role.member)) return null;
  const t = session.transcript;
  const target = minutesTargetFor(session.wg.visibility);
  return {
    id: session.id,
    group: { slug: session.wg.slug, name: session.wg.name },
    occurredAt: session.occurredAt.toISOString(),
    status: session.status,
    source: session.source,
    recordedBy: session.recordedBy ? personName(session.recordedBy) : null,
    attendees: session.attendees.map((a) => a.name),
    summary: session.summary,
    minutesMarkdown: session.notesMd,
    publishedUrl:
      session.notesPath && session.notesCommitSha && (session.wg.visibility === "public" || role.lead || role.admin)
        ? minutesUrl(session.notesPath, session.notesCommitSha, target)
        : null,
    transcript:
      t && role.member
        ? {
            status: t.status,
            language: t.language,
            entryCount: t.entryCount,
            startedAt: t.startedAt.toISOString(),
            summaryModel: t.summaryModel,
            openQuestions: role.lead || role.admin ? ((t.openQuestions as string[] | null) ?? []) : undefined,
            lastError: role.lead || role.admin ? t.lastError : undefined,
            publishTranscript: t.publishTranscript,
            meetParticipants: ((t.meetParticipants ?? []) as unknown as MeetAttendee[]).map((p) => p.name),
            entries: ((t.entries ?? []) as unknown as TranscriptEntry[]).map((e) => ({ at: e.at, speaker: e.speaker, text: e.text })),
          }
        : undefined,
  };
}
