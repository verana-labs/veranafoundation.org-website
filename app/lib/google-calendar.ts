import { createSign } from "node:crypto";

/**
 * Google Calendar client for WG meetings (ADR-0003). A service account with
 * domain-wide delegation impersonates the meetings role account
 * (GOOGLE_CALENDAR_IMPERSONATE), which is the organizer of every WG event:
 * Google auto-creates the Meet link and delivers invitations/cancellations to
 * all attendees (Gmail natively; Microsoft/Apple via standard iCalendar email).
 *
 * Plain fetch + a hand-rolled JWT-bearer grant — no googleapis dependency.
 * Callers treat thrown errors as "sync failed" and store them (DB is canonical,
 * sync is retryable); reads never hit this module.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

function config() {
  const email = process.env.GOOGLE_SA_EMAIL;
  // The key arrives with literal \n in env files.
  const key = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const impersonate = process.env.GOOGLE_CALENDAR_IMPERSONATE;
  if (!email || !key || !impersonate) return null;
  return { email, key, impersonate };
}

/** Whether Calendar sync is configured (env present). UI degrades when not. */
export function calendarConfigured(): boolean {
  return config() !== null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  const cfg = config();
  if (!cfg) throw new Error("Google Calendar is not configured (GOOGLE_* env).");
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: cfg.email,
    sub: cfg.impersonate, // act as the meetings role account
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(cfg.key, "base64url");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function api<T>(
  method: string,
  path: string,
  query: Record<string, string>,
  body?: object,
): Promise<T> {
  const token = await accessToken();
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

/** Create the recurring WG event; Google generates the Meet link and invites. */
export async function createScheduleEvent(
  input: ScheduleEventInput,
): Promise<{ eventId: string; meetLink: string | null }> {
  const ev = await api<GEvent>(
    "POST",
    "/calendars/primary/events",
    { conferenceDataVersion: "1", sendUpdates: "all" },
    {
      ...eventResource(input),
      conferenceData: {
        createRequest: {
          requestId: `wg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  );
  return { eventId: ev.id, meetLink: meetLinkOf(ev) };
}

/** Update time/recurrence/attendees of the series; attendees get an update. */
export async function updateScheduleEvent(
  eventId: string,
  input: ScheduleEventInput,
): Promise<{ meetLink: string | null }> {
  const ev = await api<GEvent>(
    "PATCH",
    `/calendars/primary/events/${eventId}`,
    { conferenceDataVersion: "1", sendUpdates: "all" },
    eventResource(input),
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
