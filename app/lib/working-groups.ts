import type { WgRegion, WgVisibility } from "@prisma/client";
import { db } from "@/app/lib/db";
import { nextOccurrences } from "@/app/lib/recurrence";
import { googleAccessToken, hostForLanguage } from "@/app/lib/google-auth";
import {
  attachConference,
  calendarConfigured,
  cancelOccurrence,
  createScheduleEvent,
  deleteScheduleEvent,
  moveOccurrence,
  updateScheduleEvent,
  type MeetConference,
} from "@/app/lib/google-calendar";
import {
  addCohost,
  createSpace,
  listMembers,
  meetConfigured,
  meetingCodeFromLink,
  removeMember,
  setAutoTranscription,
  setAutoTranscriptionByName,
} from "@/app/lib/google-meet";
import { expandOccurrences, occurrenceWindowAt, type Occurrence } from "@/app/lib/recurrence";

export type WgClass = "contributor" | "associate";

/** The set of membership classes a user holds via an *active* membership. */
export async function userActiveClasses(userId: string): Promise<Set<WgClass>> {
  const links = await db.userMember.findMany({
    where: { userId },
    include: { member: { include: { membership: true } } },
  });
  const set = new Set<WgClass>();
  for (const link of links) {
    const m = link.member.membership;
    if (m && m.status === "active") set.add(m.class as WgClass);
  }
  return set;
}

/** ADR-0002 WG access rule: any active membership, or an active Associate one. */
export function canAccessWg(
  requiredClass: "any" | "associate",
  classes: Set<WgClass>,
): boolean {
  return requiredClass === "associate"
    ? classes.has("associate")
    : classes.size > 0;
}

export function lockReason(requiredClass: "any" | "associate"): string {
  return requiredClass === "associate"
    ? "Requires an active Associate membership."
    : "Requires an active membership.";
}

/** How a person is shown everywhere (ADR-0003): chosen name first. */
export function personName(u: {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
}): string {
  return (
    u.displayName?.trim() ||
    u.name?.trim() ||
    u.email?.split("@")[0] ||
    "Unknown"
  );
}

/** URL/folder slug from a WG name: "Trust Registry WG" → "trust-registry-wg". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type WgPerson = {
  userId: string;
  name: string;
  image: string | null;
};

function toPerson(u: {
  id: string;
  displayName: string | null;
  name: string | null;
  email: string | null;
  image: string | null;
}): WgPerson {
  return { userId: u.id, name: personName(u), image: u.image };
}

const personSelect = {
  id: true, displayName: true, name: true, email: true, image: true,
} as const;

/** Is the user a lead of the WG? Gate for every lead-only action. */
export async function isWgLead(userId: string, wgId: string): Promise<boolean> {
  return !!(await db.wgLead.findUnique({
    where: { wgId_userId: { wgId, userId } },
  }));
}

/** A WG with everything its detail page needs. */
export async function getWgBySlug(slug: string) {
  return db.workingGroup.findUnique({
    where: { slug },
    include: {
      leads: { include: { user: { select: personSelect } }, orderBy: { createdAt: "asc" } },
      participants: {
        where: { leftAt: null },
        include: { user: { select: personSelect } },
        orderBy: { joinedAt: "asc" },
      },
      // Pending email invites (lead console only; converted ones have rows above)
      invites: { where: { acceptedAt: null }, orderBy: { createdAt: "asc" } },
      // Join requests of a private group: pending ones for the lead console,
      // all of them to show a visitor the state of their own request.
      joinRequests: {
        include: { user: { select: { ...personSelect } } },
        orderBy: { createdAt: "asc" },
      },
      schedule: { include: { exceptions: { orderBy: { originalStart: "asc" } } } },
      sessions: {
        orderBy: { occurredAt: "desc" },
        include: {
          attendees: true,
          recordedBy: { select: personSelect },
          // Pipeline state only — the entries JSON stays on the session page.
          transcript: {
            select: {
              status: true,
              summaryModel: true,
              lastError: true,
              entryCount: true,
              transcriptPath: true,
              transcriptCommitSha: true,
            },
          },
        },
      },
    },
  });
}

export type WgDetail = NonNullable<Awaited<ReturnType<typeof getWgBySlug>>>;

export function wgLeads(wg: WgDetail): WgPerson[] {
  return wg.leads.map((l) => toPerson(l.user));
}

export function wgParticipants(wg: WgDetail): WgPerson[] {
  return wg.participants.map((p) => toPerson(p.user));
}

/**
 * Calendar attendees = leads ∪ active participants (a lead may not have
 * formally joined; they still must be in the meeting).
 */
async function attendeeEmails(wgId: string): Promise<string[]> {
  const [leads, participants] = await Promise.all([
    db.wgLead.findMany({ where: { wgId }, include: { user: true } }),
    db.wgParticipant.findMany({
      where: { wgId, leftAt: null },
      include: { user: true },
    }),
  ]);
  const emails = new Set<string>();
  for (const l of leads) if (l.user.email) emails.add(l.user.email);
  for (const p of participants) if (p.user.email) emails.add(p.user.email);
  return [...emails];
}

/**
 * Push the WG's schedule (time, recurrence, attendee list) to Google Calendar —
 * the single DB→Google sync path, used by schedule edits and join/leave alike.
 * DB is canonical: failures are recorded on the schedule (`syncError`) and the
 * lead UI offers retry; the site keeps rendering from the DB regardless.
 *
 * ADR-0004 amendment: the Meet space is created by the site (so the leads can
 * be co-hosts) and attached to the event; the Meet-side settings follow.
 */
export async function syncScheduleToGoogle(
  wgId: string,
  now = new Date(),
): Promise<{ ok: boolean; error?: string }> {
  const wg = await db.workingGroup.findUnique({
    where: { id: wgId },
    include: { schedule: true },
  });
  if (!wg || !wg.schedule) return { ok: true }; // nothing to sync
  if (!calendarConfigured()) {
    await db.wgSchedule.update({
      where: { id: wg.schedule.id },
      data: { syncError: "Google Calendar is not configured." },
    });
    return { ok: false, error: "Google Calendar is not configured." };
  }

  // A failed move leaves the meeting with its current host, which still syncs.
  const rehome = await rehomeSchedule(wgId, now);

  // Own the space first so the event carries it from the start; a failure
  // here is recorded on the Meet side and the event still syncs.
  await ensureAppSpace(wgId, { attach: false });
  const schedule = await db.wgSchedule.findUniqueOrThrow({ where: { id: wg.schedule.id } });
  const conference: MeetConference | undefined =
    schedule.meetSpaceName && schedule.meetingCode && schedule.meetLink
      ? { meetingCode: schedule.meetingCode, uri: schedule.meetLink }
      : undefined;

  // Same base-URL source as every other absolute link (emails, invoices).
  const base = process.env.AUTH_URL ?? "https://veranafoundation.org";
  const transcriptionNote = wg.autoMinutes
    ? "\n\nMeetings are transcribed automatically; an AI assistant drafts the minutes, which a group lead reviews before publication. Transcripts stay internal to the group unless a lead publishes them."
    : "";
  const input = {
    summary: `Verana — ${wg.name}`,
    description: `${wg.description ?? ""}\n\nWorking group page: ${base}/working-groups/${wg.slug}${transcriptionNote}`.trim(),
    startsAt: schedule.startsAt,
    durationMin: schedule.durationMin,
    timezone: schedule.timezone,
    rrule: schedule.rrule,
    attendees: await attendeeEmails(wgId),
  };

  const host = schedule.googleHost;
  const created = !schedule.googleEventId;
  try {
    if (schedule.googleEventId) {
      const { meetLink } = await updateScheduleEvent(host, schedule.googleEventId, input, conference);
      const link = conference?.uri ?? meetLink ?? schedule.meetLink;
      await db.wgSchedule.update({
        where: { id: schedule.id },
        data: {
          meetLink: link,
          meetingCode: conference?.meetingCode ?? meetingCodeFromLink(link),
          syncedAt: new Date(),
          syncError: null,
        },
      });
    } else {
      const { eventId, meetLink } = await createScheduleEvent(host, input, conference);
      const link = conference?.uri ?? meetLink;
      await db.wgSchedule.update({
        where: { id: schedule.id },
        data: {
          googleEventId: eventId,
          meetLink: link,
          meetingCode: conference?.meetingCode ?? meetingCodeFromLink(link),
          syncedAt: new Date(),
          syncError: null,
        },
      });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.wgSchedule.update({
      where: { id: schedule.id },
      data: { syncError: error.slice(0, 1000) },
    });
    return { ok: false, error };
  }

  // A new series (first sync, or moved to another host) starts clean: carry
  // the upcoming cancellations and moves over to it.
  const replay = created ? await replayExceptions(schedule.id, now) : null;

  // Meet side: transcription window + co-hosts. Their own failures are
  // recorded separately (meetConfigError / meetMembersError) and never fail
  // the Calendar sync.
  await syncMeetConfig(wgId);
  await syncMeetMembers(wgId);
  const problem = rehome.error ?? replay;
  if (!problem) return { ok: true };
  await db.wgSchedule.update({ where: { id: schedule.id }, data: { syncError: problem.slice(0, 1000) } });
  return { ok: false, error: problem };
}

/** Whether the group's meeting is organized by the host its language calls for. */
export function hostMismatch(wg: { language: string; schedule: { googleHost: string | null } | null }): boolean {
  return !!wg.schedule && (wg.schedule.googleHost ?? null) !== hostForLanguage(wg.language);
}

/**
 * Move the group's meeting to the host account its language calls for
 * (lib/google-auth.ts hostForLanguage): Meet transcribes in the language the
 * host selected, and leads outside the Workspace cannot change it. The old
 * series is cancelled for its attendees and its space stops transcribing; the
 * caller then creates the space and the event as the new host, so attendees
 * receive a new invitation with a new Meet link. Deferred while a meeting's
 * transcription window is open, so a running call is never cut. Failures are
 * recorded on the schedule (`syncError`) and returned; nothing is cancelled
 * unless the new host answers first.
 */
export async function rehomeSchedule(
  wgId: string,
  now: Date,
): Promise<{ moved: boolean; error?: string }> {
  const wg = await db.workingGroup.findUnique({
    where: { id: wgId },
    include: { schedule: { include: { exceptions: true } } },
  });
  const schedule = wg?.schedule;
  if (!wg || !schedule || !hostMismatch(wg)) return { moved: false };
  const target = hostForLanguage(wg.language);
  if (!schedule.googleEventId && !schedule.meetSpaceName) {
    await db.wgSchedule.update({ where: { id: schedule.id }, data: { googleHost: target } });
    return { moved: false };
  }
  if (occurrenceWindowAt(schedule, now, schedule.exceptions) !== null) return { moved: false };

  const from = schedule.googleHost;
  try {
    // The new host must answer before the old series is cancelled: a mistyped
    // or unlicensed account would otherwise leave the group with no meeting.
    await googleAccessToken(target, [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/meetings.space.created",
    ]);
  } catch (e) {
    const error = `Cannot act as ${target ?? "the default host"}; the meeting stays where it is: ${e instanceof Error ? e.message : String(e)}`;
    await db.wgSchedule.update({ where: { id: schedule.id }, data: { syncError: error.slice(0, 1000) } });
    return { moved: false, error };
  }
  if (schedule.googleEventId) {
    try {
      await deleteScheduleEvent(from, schedule.googleEventId); // cancels for attendees
    } catch (e) {
      const error = `Moving the meeting to ${target ?? "the default host"} failed: ${e instanceof Error ? e.message : String(e)}`;
      await db.wgSchedule.update({ where: { id: schedule.id }, data: { syncError: error.slice(0, 1000) } });
      return { moved: false, error };
    }
  }
  if (schedule.meetSpaceName && schedule.meetAutoTranscribe) {
    // Best effort: the abandoned space must not keep transcribing.
    await setAutoTranscriptionByName(from, schedule.meetSpaceName, false).catch((e) =>
      console.warn(`[wg-meet] could not switch off transcription on ${schedule.meetSpaceName}:`, e),
    );
  }
  await db.wgSchedule.update({
    where: { id: schedule.id },
    data: {
      googleHost: target,
      googleEventId: null,
      meetLink: null,
      syncedAt: null,
      syncError: null,
      meetSpaceName: null,
      meetingCode: null,
      meetAutoTranscribe: null,
      meetConfiguredAt: null,
      meetConfigError: null,
      meetMembersSyncedAt: null,
      meetMembersError: null,
    },
  });
  console.info(`[wg-meet] ${wg.slug}: meeting moved from ${from ?? "default host"} to ${target ?? "default host"}`);
  return { moved: true };
}

/** Push the upcoming cancellations and moves onto a freshly created event. */
async function replayExceptions(scheduleId: string, now: Date): Promise<string | null> {
  const schedule = await db.wgSchedule.findUniqueOrThrow({
    where: { id: scheduleId },
    include: { exceptions: true },
  });
  if (!schedule.googleEventId) return null;
  const problems: string[] = [];
  for (const x of schedule.exceptions) {
    if (x.originalStart < now && (!x.movedTo || x.movedTo < now)) continue;
    try {
      if (x.movedTo) {
        await moveOccurrence(
          schedule.googleHost, schedule.googleEventId, x.originalStart, x.movedTo,
          schedule.durationMin, schedule.timezone,
        );
      } else {
        await cancelOccurrence(schedule.googleHost, schedule.googleEventId, x.originalStart);
      }
    } catch (e) {
      problems.push(`${x.originalStart.toISOString()}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!problems.length) return null;
  const error = `Meeting moved to the new host, but some cancellations or moves did not carry over: ${problems.join(" | ")}`;
  await db.wgSchedule.update({ where: { id: scheduleId }, data: { syncError: error.slice(0, 1000) } });
  return error;
}

/**
 * Give the group a Meet space the site owns (ADR-0004 amendment). Google only
 * lets an app manage co-hosts on spaces that app created, so Calendar-created
 * spaces are taken over once: a new space is created and, with `attach`,
 * swapped into the existing event (attendees receive the new link through the
 * normal Calendar update) while the old space stops transcribing.
 */
export async function ensureAppSpace(
  wgId: string,
  opts: { attach: boolean },
): Promise<{ ok: boolean; created?: boolean; error?: string }> {
  const schedule = await db.wgSchedule.findUnique({ where: { wgId } });
  if (!schedule || schedule.meetSpaceName || !meetConfigured()) return { ok: true };
  try {
    const space = await createSpace(schedule.googleHost);
    if (opts.attach && schedule.googleEventId) {
      await attachConference(schedule.googleHost, schedule.googleEventId, {
        meetingCode: space.meetingCode,
        uri: space.uri,
      });
    }
    const oldCode = schedule.meetingCode ?? meetingCodeFromLink(schedule.meetLink);
    await db.wgSchedule.update({
      where: { id: schedule.id },
      data: {
        meetSpaceName: space.name,
        meetingCode: space.meetingCode,
        meetLink: space.uri,
        meetAutoTranscribe: false,
        meetConfiguredAt: new Date(),
        meetConfigError: null,
        meetMembersSyncedAt: null,
      },
    });
    if (oldCode && oldCode !== space.meetingCode && schedule.meetAutoTranscribe) {
      // Best effort: the superseded Calendar-created space must not keep
      // transcribing whoever still opens the old link.
      try {
        await setAutoTranscription(schedule.googleHost, oldCode, false);
      } catch (e) {
        console.warn(`[wg-meet] could not switch off transcription on old space ${oldCode}:`, e);
      }
    }
    return { ok: true, created: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.wgSchedule.update({
      where: { id: schedule.id },
      data: { meetConfigError: `Meet space creation failed: ${error}`.slice(0, 1000) },
    });
    return { ok: false, error };
  }
}

/**
 * Push the transcription setting the space should have *now*: on only inside
 * the window around a non-cancelled scheduled occurrence (ADR-0004 amendment),
 * and only when the group has automatic minutes. Idempotent and cheap: no API
 * call when the stored state already matches, unless `force`. Failures land in
 * `meetConfigError` and are retried by the cron / the lead console.
 */
export async function syncMeetConfig(
  wgId: string,
  opts: { force?: boolean; now?: Date } = {},
): Promise<{ ok: boolean; error?: string }> {
  const now = opts.now ?? new Date();
  const wg = await db.workingGroup.findUnique({
    where: { id: wgId },
    include: { schedule: { include: { exceptions: true } } },
  });
  const schedule = wg?.schedule;
  if (!wg || !schedule || !meetConfigured()) return { ok: true };
  const meetingCode = schedule.meetingCode ?? meetingCodeFromLink(schedule.meetLink);
  if (!schedule.meetSpaceName && !meetingCode) return { ok: true }; // no Meet link yet
  const desired =
    wg.autoMinutes && occurrenceWindowAt(schedule, now, schedule.exceptions) !== null;
  if (
    !opts.force &&
    schedule.meetAutoTranscribe === desired &&
    !schedule.meetConfigError
  ) {
    return { ok: true };
  }
  try {
    const space = schedule.meetSpaceName
      ? await setAutoTranscriptionByName(schedule.googleHost, schedule.meetSpaceName, desired)
      : await setAutoTranscription(schedule.googleHost, meetingCode!, desired);
    await db.wgSchedule.update({
      where: { id: schedule.id },
      data: {
        meetingCode: space.meetingCode || meetingCode,
        meetAutoTranscribe: space.autoTranscription ?? desired,
        meetConfiguredAt: new Date(),
        meetConfigError: null,
      },
    });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.wgSchedule.update({
      where: { id: schedule.id },
      data: { meetConfigError: error.slice(0, 1000) },
    });
    return { ok: false, error };
  }
}

/**
 * Reconcile the space's co-hosts with the group's leads plus the Foundation
 * admins (ADR-0004 amendment): a co-host's arrival is what starts automatic
 * transcription, so every lead must be one whatever their email domain.
 * Per-address failures (an email with no Google account) are collected, not
 * fatal.
 */
export async function syncMeetMembers(
  wgId: string,
): Promise<{ ok: boolean; added?: number; removed?: number; error?: string }> {
  const schedule = await db.wgSchedule.findUnique({ where: { wgId } });
  if (!schedule?.meetSpaceName || !meetConfigured()) return { ok: true };
  const [leads, admins] = await Promise.all([
    db.wgLead.findMany({ where: { wgId }, include: { user: true } }),
    db.adminAllowlistEntry.findMany(),
  ]);
  const desired = new Set<string>();
  for (const l of leads) if (l.user.email) desired.add(l.user.email.toLowerCase());
  for (const a of admins) desired.add(a.email.toLowerCase());

  const problems: string[] = [];
  let added = 0;
  let removed = 0;
  try {
    const current = await listMembers(schedule.googleHost, schedule.meetSpaceName);
    const have = new Set<string>();
    for (const m of current) {
      if (m.role !== "COHOST") continue;
      if (desired.has(m.email)) {
        have.add(m.email);
      } else {
        try {
          await removeMember(schedule.googleHost, m.name);
          removed++;
        } catch (e) {
          problems.push(`${m.email}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    for (const email of desired) {
      if (have.has(email)) continue;
      try {
        await addCohost(schedule.googleHost, schedule.meetSpaceName, email);
        added++;
      } catch (e) {
        problems.push(`${email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    problems.push(e instanceof Error ? e.message : String(e));
  }
  const error = problems.length ? problems.join(" | ").slice(0, 1000) : null;
  await db.wgSchedule.update({
    where: { id: schedule.id },
    data: { meetMembersSyncedAt: new Date(), meetMembersError: error },
  });
  return error ? { ok: false, added, removed, error } : { ok: true, added, removed };
}

export { occurrenceFor, occurrenceWindowAt, sessionPhase, type Occurrence, type SessionPhase } from "@/app/lib/recurrence";

/**
 * Upcoming meetings from the DB schedule, exceptions applied (cancelled slots
 * flagged, moved ones listed at their new time). The meeting in progress is
 * included (so the "current session" stays reachable until it ends).
 */
export function upcomingOccurrences(
  schedule: NonNullable<WgDetail["schedule"]>,
  count = 6,
  now = new Date(),
): Occurrence[] {
  const from = new Date(now.getTime() - schedule.durationMin * 60_000);
  return expandOccurrences(schedule, schedule.exceptions, from, count);
}

/**
 * Working groups featured on the public home page (admin-flagged). Resilient:
 * the home is ISR-prerendered (incl. at build where there's no DB), so a DB
 * failure degrades to an empty board rather than breaking the build.
 */
export async function listHomeWorkingGroups() {
  try {
    return await db.workingGroup.findMany({
      where: { showOnHome: true, state: "enabled" },
      include: { leads: { include: { user: { select: personSelect } } } },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    });
  } catch {
    return [];
  }
}

export type WorkingGroupCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  requiredClass: "any" | "associate";
  region: WgRegion;
  language: string;
  visibility: WgVisibility;
  accessible: boolean;
  joined: boolean;
  requested: boolean; // the user has a pending join request (private groups)
  leads: WgPerson[];
  participantCount: number;
  nextMeeting: string | null; // ISO; next non-cancelled occurrence
};

/**
 * All working groups (always the full list), with per-user clickability:
 * `accessible` is true only for a signed-in user whose memberships satisfy the
 * group's requiredClass. Pass null for a signed-out visitor.
 */
export async function listWorkingGroupsWithAccess(
  userId: string | null,
): Promise<WorkingGroupCard[]> {
  const [groups, classes, pending] = await Promise.all([
    db.workingGroup.findMany({
      where: { state: "enabled" },
      include: {
        leads: { include: { user: { select: personSelect } } },
        participants: { where: { leftAt: null }, select: { userId: true } },
        schedule: { include: { exceptions: true } },
      },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    }),
    userId ? userActiveClasses(userId) : Promise.resolve(new Set<WgClass>()),
    userId
      ? db.wgJoinRequest.findMany({ where: { userId, status: "pending" }, select: { wgId: true } })
      : Promise.resolve([] as { wgId: string }[]),
  ]);
  const requested = new Set(pending.map((r) => r.wgId));
  return groups.map((wg) => {
    const next = wg.schedule
      ? upcomingOccurrences(wg.schedule).find((o) => !o.cancelled && !o.movedTo)
      : undefined;
    return {
      id: wg.id,
      slug: wg.slug,
      name: wg.name,
      description: wg.description,
      requiredClass: wg.requiredClass,
      region: wg.region,
      language: wg.language,
      visibility: wg.visibility,
      accessible: !!userId && canAccessWg(wg.requiredClass, classes),
      joined: !!userId && wg.participants.some((p) => p.userId === userId),
      requested: requested.has(wg.id),
      leads: wg.leads.map((l) => toPerson(l.user)),
      participantCount: wg.participants.length,
      nextMeeting: next?.start.toISOString() ?? null,
    };
  });
}
