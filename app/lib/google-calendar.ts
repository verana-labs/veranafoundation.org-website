import { googleAccessToken, googleConfigured } from "@/app/lib/google-auth";

/**
 * Google Calendar client for WG meetings (ADR-0003). The delegated service
 * account (lib/google-auth.ts) impersonates the meetings role account, which is
 * the organizer of every WG event: Google auto-creates the Meet link and
 * delivers invitations/cancellations to all attendees (Gmail natively;
 * Microsoft/Apple via standard iCalendar email).
 *
 * Plain fetch — no googleapis dependency. Callers treat thrown errors as
 * "sync failed" and store them (DB is canonical, sync is retryable); reads
 * never hit this module.
 */

const API = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"] as const;

/** Whether Calendar sync is configured (env present). UI degrades when not. */
export function calendarConfigured(): boolean {
  return googleConfigured();
}

async function api<T>(
  method: string,
  path: string,
  query: Record<string, string>,
  body?: object,
): Promise<T> {
  const token = await googleAccessToken(SCOPES);
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Calendar API ${method} ${path} failed (${res.status}): ${await res.text()}`);
  }
  // DELETE returns 204 with empty body.
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

type GEvent = {
  id: string;
  status: string;
  hangoutLink?: string;
  originalStartTime?: { dateTime?: string; date?: string };
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
};

function meetLinkOf(ev: GEvent): string | null {
  if (ev.hangoutLink) return ev.hangoutLink;
  const video = ev.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video",
  );
  return video?.uri ?? null;
}

export type ScheduleEventInput = {
  summary: string;
  description?: string;
  startsAt: Date; // first occurrence, UTC
  durationMin: number;
  timezone: string; // IANA — governs recurrence expansion (incl. DST)
  rrule: string; // RFC 5545 RRULE value, e.g. "FREQ=WEEKLY;BYDAY=WE"
  attendees: string[]; // participant emails
};

function eventResource(input: ScheduleEventInput) {
  const end = new Date(input.startsAt.getTime() + input.durationMin * 60_000);
  return {
    summary: input.summary,
    description: input.description ?? "",
    start: { dateTime: input.startsAt.toISOString(), timeZone: input.timezone },
    end: { dateTime: end.toISOString(), timeZone: input.timezone },
    recurrence: [`RRULE:${input.rrule}`],
    attendees: input.attendees.map((email) => ({ email })),
    guestsCanInviteOthers: false,
    guestsCanModify: false,
  };
}

/** A Meet space the site created itself (lib/google-meet.ts createSpace). */
export type MeetConference = { meetingCode: string; uri: string };

function conferenceData(c: MeetConference) {
  return {
    conferenceSolution: { key: { type: "hangoutsMeet" } },
    conferenceId: c.meetingCode,
    entryPoints: [
      { entryPointType: "video", uri: c.uri, label: c.uri.replace(/^https?:\/\//, "") },
    ],
  };
}

/**
 * Create the recurring WG event and send the invitations. With `conference`
 * the event carries the site-created Meet space (so its leads can be
 * co-hosts); without it Google generates a Meet link of its own.
 */
export async function createScheduleEvent(
  input: ScheduleEventInput,
  conference?: MeetConference,
): Promise<{ eventId: string; meetLink: string | null }> {
  const ev = await api<GEvent>(
    "POST",
    "/calendars/primary/events",
    { conferenceDataVersion: "1", sendUpdates: "all" },
    {
      ...eventResource(input),
      conferenceData: conference
        ? conferenceData(conference)
        : {
            createRequest: {
              requestId: `wg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
    },
  );
  return { eventId: ev.id, meetLink: meetLinkOf(ev) };
}

/** Replace the event's Meet link with a site-created space; attendees are notified. */
export async function attachConference(
  eventId: string,
  conference: MeetConference,
): Promise<{ meetLink: string | null }> {
  const ev = await api<GEvent>(
    "PATCH",
    `/calendars/primary/events/${eventId}`,
    { conferenceDataVersion: "1", sendUpdates: "all" },
    { conferenceData: conferenceData(conference) },
  );
  return { meetLink: meetLinkOf(ev) };
}

/**
 * Update time/recurrence/attendees of the series; attendees get an update.
 * With `conference` the event is (re)pointed at the site-created space, so a
 * sync always converges on the link the site owns.
 */
export async function updateScheduleEvent(
  eventId: string,
  input: ScheduleEventInput,
  conference?: MeetConference,
): Promise<{ meetLink: string | null }> {
  const ev = await api<GEvent>(
    "PATCH",
    `/calendars/primary/events/${eventId}`,
    { conferenceDataVersion: "1", sendUpdates: "all" },
    { ...eventResource(input), ...(conference ? { conferenceData: conferenceData(conference) } : {}) },
  );
  return { meetLink: meetLinkOf(ev) };
}

/** Replace the attendee list (on WG join/leave). Google notifies the delta. */
export async function setEventAttendees(
  eventId: string,
  emails: string[],
): Promise<void> {
  await api("PATCH", `/calendars/primary/events/${eventId}`, {
    sendUpdates: "all",
  }, { attendees: emails.map((email) => ({ email })) });
}

/** Cancel the whole series (schedule removed / WG deleted). */
export async function deleteScheduleEvent(eventId: string): Promise<void> {
  await api("DELETE", `/calendars/primary/events/${eventId}`, {
    sendUpdates: "all",
  });
}

async function findInstance(eventId: string, originalStart: Date): Promise<GEvent> {
  const { items } = await api<{ items: GEvent[] }>(
    "GET",
    `/calendars/primary/events/${eventId}/instances`,
    {
      originalStart: originalStart.toISOString(),
      showDeleted: "true",
      maxResults: "1",
    },
  );
  const instance = items?.[0];
  if (!instance) {
    throw new Error(`No occurrence at ${originalStart.toISOString()} on event ${eventId}.`);
  }
  return instance;
}

/** Cancel one occurrence ("skip next week") — removed from attendees' calendars. */
export async function cancelOccurrence(
  eventId: string,
  originalStart: Date,
): Promise<void> {
  const instance = await findInstance(eventId, originalStart);
  await api("PATCH", `/calendars/primary/events/${instance.id}`, {
    sendUpdates: "all",
  }, { status: "cancelled" });
}

/** Undo a single-occurrence cancellation. */
export async function restoreOccurrence(
  eventId: string,
  originalStart: Date,
): Promise<void> {
  const instance = await findInstance(eventId, originalStart);
  await api("PATCH", `/calendars/primary/events/${instance.id}`, {
    sendUpdates: "all",
  }, { status: "confirmed" });
}
