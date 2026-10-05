import { db } from "@/app/lib/db";
import { nextOccurrences } from "@/app/lib/recurrence";
import {
  calendarConfigured,
  createScheduleEvent,
  updateScheduleEvent,
} from "@/app/lib/google-calendar";
import { meetingCodeFromLink, setAutoTranscription } from "@/app/lib/google-meet";

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
 */
export async function syncScheduleToGoogle(
  wgId: string,
): Promise<{ ok: boolean; error?: string }> {
  const wg = await db.workingGroup.findUnique({
    where: { id: wgId },
    include: { schedule: true },
  });
  const schedule = wg?.schedule;
  if (!wg || !schedule) return { ok: true }; // nothing to sync
  if (!calendarConfigured()) {
    await db.wgSchedule.update({
      where: { id: schedule.id },
      data: { syncError: "Google Calendar is not configured." },
    });
    return { ok: false, error: "Google Calendar is not configured." };
  }

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
    let link: string | null;
    if (schedule.googleEventId) {
      const { meetLink } = await updateScheduleEvent(schedule.googleEventId, input);
      link = meetLink ?? schedule.meetLink;
      await db.wgSchedule.update({
        where: { id: schedule.id },
        data: {
          meetLink: link,
          meetingCode: meetingCodeFromLink(link),
          syncedAt: new Date(),
          syncError: null,
        },
      });
    } else {
      const { eventId, meetLink } = await createScheduleEvent(input);
      link = meetLink;
      await db.wgSchedule.update({
        where: { id: schedule.id },
        data: {
          googleEventId: eventId,
          meetLink,
          meetingCode: meetingCodeFromLink(meetLink),
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

  // ADR-0004: the Meet space follows the group's autoMinutes setting. Its own
  // failure is recorded separately (meetConfigError) and never fails the sync.
  await syncMeetConfig(wgId);
  return { ok: true };
}

/**
 * Push the group's auto-transcription setting to its Meet space (ADR-0004 §1).
 * Idempotent and cheap: skipped when the stored state already matches, unless
 * `force`. Failures land in `meetConfigError`; the lead console retries them
 * together with the Calendar sync.
 */
export async function syncMeetConfig(
  wgId: string,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const wg = await db.workingGroup.findUnique({
    where: { id: wgId },
    include: { schedule: true },
  });
  const schedule = wg?.schedule;
  if (!wg || !schedule) return { ok: true };
  const meetingCode = schedule.meetingCode ?? meetingCodeFromLink(schedule.meetLink);
  if (!meetingCode) return { ok: true }; // no Meet link yet (sync pending)
  const desired = wg.autoMinutes;
  if (
    !opts.force &&
    schedule.meetAutoTranscribe === desired &&
    !schedule.meetConfigError
  ) {
    return { ok: true };
  }
  try {
    const space = await setAutoTranscription(meetingCode, desired);
    await db.wgSchedule.update({
      where: { id: schedule.id },
      data: {
        meetingCode,
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
      data: { meetingCode, meetConfigError: error.slice(0, 1000) },
    });
    return { ok: false, error };
  }
}

export { occurrenceFor, sessionPhase, type SessionPhase } from "@/app/lib/recurrence";

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
