import { db } from "@/app/lib/db";
import { nextOccurrences } from "@/app/lib/recurrence";
import {
  attachConference,
  calendarConfigured,
  createScheduleEvent,
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
import { occurrenceWindowAt } from "@/app/lib/recurrence";

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

  try {
    if (schedule.googleEventId) {
      const { meetLink } = await updateScheduleEvent(schedule.googleEventId, input, conference);
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
      const { eventId, meetLink } = await createScheduleEvent(input, conference);
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

  // Meet side: transcription window + co-hosts. Their own failures are
  // recorded separately (meetConfigError / meetMembersError) and never fail
  // the Calendar sync.
  await syncMeetConfig(wgId);
  await syncMeetMembers(wgId);
  return { ok: true };
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
    const space = await createSpace();
    if (opts.attach && schedule.googleEventId) {
      await attachConference(schedule.googleEventId, {
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
        await setAutoTranscription(oldCode, false);
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
  const cancelled = new Set(schedule.exceptions.map((e) => e.originalStart.getTime()));
  const desired =
    wg.autoMinutes && occurrenceWindowAt(schedule, now, cancelled) !== null;
  if (
    !opts.force &&
    schedule.meetAutoTranscribe === desired &&
    !schedule.meetConfigError
  ) {
    return { ok: true };
  }
  try {
    const space = schedule.meetSpaceName
      ? await setAutoTranscriptionByName(schedule.meetSpaceName, desired)
      : await setAutoTranscription(meetingCode!, desired);
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
    const current = await listMembers(schedule.meetSpaceName);
    const have = new Set<string>();
    for (const m of current) {
      if (m.role !== "COHOST") continue;
      if (desired.has(m.email)) {
        have.add(m.email);
      } else {
        try {
          await removeMember(m.name);
          removed++;
        } catch (e) {
          problems.push(`${m.email}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    for (const email of desired) {
      if (have.has(email)) continue;
      try {
        await addCohost(schedule.meetSpaceName, email);
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

export { occurrenceFor, occurrenceWindowAt, sessionPhase, type SessionPhase } from "@/app/lib/recurrence";

/**
 * Upcoming occurrences from the DB schedule, with cancelled ones flagged. The
 * occurrence in progress is included (so the "current session" stays
 * reachable until the meeting ends).
 */
export function upcomingOccurrences(
  schedule: NonNullable<WgDetail["schedule"]>,
  count = 6,
  now = new Date(),
): { start: Date; cancelled: boolean; note: string | null }[] {
  const cancelled = new Map(
    schedule.exceptions.map((e) => [e.originalStart.getTime(), e.note]),
  );
  const from = new Date(now.getTime() - schedule.durationMin * 60_000);
  return nextOccurrences(
    schedule.startsAt,
    schedule.timezone,
    schedule.rrule,
    from,
    count,
  ).map((start) => ({
    start,
    cancelled: cancelled.has(start.getTime()),
    note: cancelled.get(start.getTime()) ?? null,
  }));
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
  accessible: boolean;
  joined: boolean;
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
  const [groups, classes] = await Promise.all([
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
  ]);
  return groups.map((wg) => {
    const next = wg.schedule
      ? upcomingOccurrences(wg.schedule).find((o) => !o.cancelled)
      : undefined;
    return {
      id: wg.id,
      slug: wg.slug,
      name: wg.name,
      description: wg.description,
      requiredClass: wg.requiredClass,
      accessible: !!userId && canAccessWg(wg.requiredClass, classes),
      joined: !!userId && wg.participants.some((p) => p.userId === userId),
      leads: wg.leads.map((l) => toPerson(l.user)),
      participantCount: wg.participants.length,
      nextMeeting: next?.start.toISOString() ?? null,
    };
  });
}
