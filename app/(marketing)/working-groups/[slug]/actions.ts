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
  syncScheduleToGoogle,
  userActiveClasses,
} from "@/app/lib/working-groups";
import {
  cancelOccurrence,
  deleteScheduleEvent,
  restoreOccurrence,
} from "@/app/lib/google-calendar";
import { buildRrule, wallToUtc, type Frequency } from "@/app/lib/recurrence";
import { minutesUrl, publishMinutes } from "@/app/lib/minutes";

export type ActionState = { error?: string; ok?: boolean };

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
  revalidatePath("/account/working-groups");
  revalidatePath("/contribute");
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

export async function joinWg(wgId: string): Promise<ActionState> {
  const user = await requireUser();
  const wg = await db.workingGroup.findUniqueOrThrow({ where: { id: wgId } });
  const classes = await userActiveClasses(user.id);
  if (!canAccessWg(wg.requiredClass, classes)) {
    return { error: "Your memberships don't grant access to this group." };
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

// ── Leads ────────────────────────────────────────────────────────────────────

export async function addLead(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const wgId = String(formData.get("wgId"));
  const user = await requireManager(wgId);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Email is required." };
  const target = await db.user.findUnique({ where: { email } });
  if (!target) {
    return { error: "No account with that email — they must sign in once first." };
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
  await db.wgSchedule.delete({ where: { wgId } });
  await audit(user, "wg.schedule.delete", wgId);
  await revalidateWg(wgId);
  return { ok: true };
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
    update: { note: note || null },
  });
  await audit(user, "wg.meeting.cancel", wgId, { originalStart, note });
  if (schedule.googleEventId) {
    try {
      await cancelOccurrence(schedule.googleEventId, originalStart);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await db.wgSchedule.update({
        where: { id: schedule.id },
        data: { syncError: error.slice(0, 1000) },
      });
      await revalidateWg(wgId);
      return { error: `Cancelled on the site, but Calendar sync failed: ${error}` };
    }
  }
  await revalidateWg(wgId);
  return { ok: true };
}

export async function restoreMeeting(
  wgId: string,
  startIso: string,
): Promise<ActionState> {
  const user = await requireManager(wgId);
  const schedule = await db.wgSchedule.findUnique({ where: { wgId } });
  if (!schedule) return { error: "No schedule." };
  const originalStart = new Date(startIso);
  await db.wgScheduleException.deleteMany({
    where: { scheduleId: schedule.id, originalStart },
  });
  await audit(user, "wg.meeting.restore", wgId, { originalStart });
  if (schedule.googleEventId) {
    try {
      await restoreOccurrence(schedule.googleEventId, originalStart);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { error: `Restored on the site, but Calendar sync failed: ${error}` };
    }
  }
  await revalidateWg(wgId);
  return { ok: true };
}

// ── Sessions & minutes ───────────────────────────────────────────────────────

async function requireSessionEditor(sessionId: string) {
  const user = await requireUser();
  const session = await db.wgSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { wg: true },
  });
  const allowed =
    session.recordedById === user.id ||
    (await isWgLead(user.id, session.wgId)) ||
    (await isAdmin(user.email));
  if (!allowed) throw new Error("Forbidden");
  return { user, session };
}

/** Open (or reopen) the session record for an occurrence and go edit it. */
export async function startSession(wgId: string, occurredAtIso: string) {
  const user = await requireUser();
  const wg = await db.workingGroup.findUniqueOrThrow({ where: { id: wgId } });
  const participant = await db.wgParticipant.findUnique({
    where: { wgId_userId: { wgId, userId: user.id } },
  });
  const lead = await isWgLead(user.id, wgId);
  if (!lead && (!participant || participant.leftAt)) throw new Error("Forbidden");

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
});

export async function saveSession(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = saveSessionSchema.safeParse({
    sessionId: formData.get("sessionId"),
    notesMd: formData.get("notesMd") ?? "",
    attendeeUserIds: formData.getAll("attendeeUserIds").map(String),
    guests: formData.get("guests") ?? "",
  });
  if (!parsed.success) return { error: "Invalid input." };
  const { user, session } = await requireSessionEditor(parsed.data.sessionId);

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
  ]);
  return { ok: true };
}

export async function publishSession(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Persist the latest edits first, then commit.
  const saved = await saveSession({}, formData);
  if (saved.error) return saved;
  const { user, session } = await requireSessionEditor(
    String(formData.get("sessionId")),
  );
  const fresh = await db.wgSession.findUniqueOrThrow({
    where: { id: session.id },
    include: { attendees: true, recordedBy: true },
  });

  try {
    const { path, commitSha } = await publishMinutes({
      wgSlug: session.wg.slug,
      wgName: session.wg.name,
      date: fresh.occurredAt,
      attendees: fresh.attendees.map((a) => a.name),
      recordedBy: personName(fresh.recordedBy),
      markdown: fresh.notesMd,
    });
    await db.wgSession.update({
      where: { id: session.id },
      data: { status: "published", notesPath: path, notesCommitSha: commitSha },
    });
    await audit(user, "wg.session.publish", session.wgId, {
      sessionId: session.id, path, commitSha,
    });
    await revalidateWg(session.wgId);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Publishing failed." };
  }
}

export async function deleteSession(sessionId: string): Promise<ActionState> {
  const { user, session } = await requireSessionEditor(sessionId);
  if (session.status === "published") {
    return { error: "Published sessions can't be deleted." };
  }
  await db.wgSession.delete({ where: { id: sessionId } });
  await audit(user, "wg.session.delete", session.wgId, { sessionId });
  await revalidateWg(session.wgId);
  return { ok: true };
}

/** Public URL of the committed minutes file, for the history page. */
export async function publishedMinutesUrl(
  path: string,
  sha: string,
): Promise<string | null> {
  return minutesUrl(path, sha);
}
