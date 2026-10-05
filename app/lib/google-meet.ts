import { googleAccessToken, googleConfigured } from "@/app/lib/google-auth";

/**
 * Google Meet REST API client (ADR-0004), as the meetings role account that
 * owns every WG meeting space. Three uses:
 *   - create the group's space and make its leads co-hosts (scope
 *     meetings.space.created — members can only be managed on spaces the app
 *     created, which is why the site owns them instead of Calendar);
 *   - switch a space to automatic transcription (scope meetings.space.settings);
 *   - read what a conference produced: records, participants, transcript
 *     entries (scope meetings.space.readonly).
 * No recording is ever configured or read, and no Drive scope is needed: the
 * transcript is read as text through the Meet API itself.
 *
 * Plain fetch — no googleapis dependency. Errors are thrown; the pipeline
 * (lib/transcripts.ts) stores and retries them.
 */

const API = "https://meet.googleapis.com/v2";
const SETTINGS_SCOPES = ["https://www.googleapis.com/auth/meetings.space.settings"] as const;
const READ_SCOPES = ["https://www.googleapis.com/auth/meetings.space.readonly"] as const;
// Spaces the site creates itself (and only those) can carry co-host members.
const CREATED_SCOPES = ["https://www.googleapis.com/auth/meetings.space.created"] as const;

export function meetConfigured(): boolean {
  return googleConfigured();
}

/** "https://meet.google.com/abc-defg-hij?authuser=0" → "abc-defg-hij". */
export function meetingCodeFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?![a-z])/i.exec(link);
  return m ? m[1].toLowerCase() : null;
}

async function api<T>(
  scopes: readonly string[],
  method: string,
  path: string,
  query: Record<string, string> = {},
  body?: object,
): Promise<T> {
  const token = await googleAccessToken(scopes);
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${API}/${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Meet API ${method} ${path} failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** Every page of a list endpoint, concatenated. */
async function listAll<T>(
  path: string,
  key: string,
  query: Record<string, string>,
): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 200; page++) {
    const data = await api<Record<string, unknown>>(READ_SCOPES, "GET", path, {
      ...query,
      ...(pageToken ? { pageToken } : {}),
    });
    out.push(...((data[key] as T[] | undefined) ?? []));
    pageToken = data.nextPageToken as string | undefined;
    if (!pageToken) break;
  }
  return out;
}

// ── Spaces (configuration) ──────────────────────────────────────────────────

type GSpace = {
  name: string;
  meetingCode?: string;
  meetingUri?: string;
  config?: {
    moderation?: string;
    artifactConfig?: {
      recordingConfig?: { autoRecordingGeneration?: string };
      transcriptionConfig?: { autoTranscriptionGeneration?: string };
    };
  };
};

export type MeetSpace = {
  name: string; // "spaces/{space}"
  meetingCode: string;
  uri: string; // "https://meet.google.com/{meetingCode}"
  moderation: boolean | null; // host management
  autoTranscription: boolean | null;
  autoRecording: boolean | null;
};

export function parseSpace(s: GSpace, fallbackCode: string): MeetSpace {
  const onOff = (v: string | undefined) => (v ? v === "ON" : null);
  const meetingCode = s.meetingCode ?? fallbackCode;
  return {
    name: s.name,
    meetingCode,
    uri: s.meetingUri ?? `https://meet.google.com/${meetingCode}`,
    moderation: onOff(s.config?.moderation),
    autoTranscription: onOff(s.config?.artifactConfig?.transcriptionConfig?.autoTranscriptionGeneration),
    autoRecording: onOff(s.config?.artifactConfig?.recordingConfig?.autoRecordingGeneration),
  };
}

/**
 * Create a group's meeting space, owned by the role account and by this app:
 * trusted access (members of the Workspace, invited people and dial-ins join
 * without knocking), host management on with no restrictions (so co-host roles
 * exist — co-hosts are what start automatic transcription when no Workspace
 * user attends), transcription initially off (the cron opens it around each
 * scheduled occurrence), recording and notes untouched (off).
 */
export async function createSpace(): Promise<MeetSpace> {
  const space = await api<GSpace>(CREATED_SCOPES, "POST", "spaces", {}, {
    config: {
      accessType: "TRUSTED",
      entryPointAccess: "ALL",
      moderation: "ON",
      artifactConfig: { transcriptionConfig: { autoTranscriptionGeneration: "OFF" } },
    },
  });
  return parseSpace(space, space.meetingCode ?? "");
}

export async function getSpace(meetingCode: string): Promise<MeetSpace> {
  return parseSpace(await api<GSpace>(READ_SCOPES, "GET", `spaces/${meetingCode}`), meetingCode);
}

/**
 * Turn automatic transcription on/off for a space (works for Calendar-created
 * meetings). Only the transcription field is touched: recording and Gemini
 * notes stay as they are (off).
 *
 * `spaces.get` accepts a meeting code, but `spaces.patch` only accepts the
 * server-generated resource name (`spaces/{space}`) and answers 403 "or it
 * might not exist" otherwise — so the space is resolved first.
 */
export async function setAutoTranscription(
  meetingCode: string,
  on: boolean,
): Promise<MeetSpace> {
  const current = await getSpace(meetingCode);
  return setAutoTranscriptionByName(current.name, on);
}

/** Same, when the resource name is already known (site-created spaces). */
export async function setAutoTranscriptionByName(
  spaceName: string,
  on: boolean,
): Promise<MeetSpace> {
  const space = await api<GSpace>(
    SETTINGS_SCOPES,
    "PATCH",
    spaceName,
    { updateMask: "config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration" },
    {
      config: {
        artifactConfig: {
          transcriptionConfig: { autoTranscriptionGeneration: on ? "ON" : "OFF" },
        },
      },
    },
  );
  return parseSpace(space, space.meetingCode ?? spaceName);
}

// ── Members (co-hosts) — site-created spaces only ────────────────────────────

export type MeetMember = {
  name: string; // "spaces/{space}/members/{member}"
  email: string;
  role: "COHOST" | "ROLE_UNSPECIFIED";
};

type GMember = { name: string; email?: string; role?: string };

export function parseMember(m: GMember): MeetMember {
  return {
    name: m.name,
    email: (m.email ?? "").toLowerCase(),
    role: m.role === "COHOST" ? "COHOST" : "ROLE_UNSPECIFIED",
  };
}

export async function listMembers(spaceName: string): Promise<MeetMember[]> {
  const out: MeetMember[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const data = await api<{ members?: GMember[]; nextPageToken?: string }>(
      CREATED_SCOPES,
      "GET",
      `${spaceName}/members`,
      { pageSize: "100", ...(pageToken ? { pageToken } : {}) },
    );
    out.push(...(data.members ?? []).map(parseMember));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

/** Make a Google account (any domain) a co-host of the space. */
export async function addCohost(spaceName: string, email: string): Promise<MeetMember> {
  const m = await api<GMember>(CREATED_SCOPES, "POST", `${spaceName}/members`, {}, {
    email,
    role: "COHOST",
  });
  return parseMember(m);
}

export async function removeMember(memberName: string): Promise<void> {
  const token = await googleAccessToken(CREATED_SCOPES);
  const res = await fetch(`${API}/${memberName}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Meet API DELETE ${memberName} failed (${res.status}): ${await res.text()}`);
  }
}

// ── Conference records & artifacts (read) ──────────────────────────────────

type GConferenceRecord = {
  name: string;
  startTime: string;
  endTime?: string;
  expireTime?: string;
  space: string;
};

export type ConferenceRecord = {
  name: string; // "conferenceRecords/{id}"
  startedAt: Date;
  endedAt: Date | null;
  space: string;
};

export function parseConferenceRecord(r: GConferenceRecord): ConferenceRecord {
  return {
    name: r.name,
    startedAt: new Date(r.startTime),
    endedAt: r.endTime ? new Date(r.endTime) : null,
    space: r.space,
  };
}

/** Conferences held on a meeting code that ended at or after `endedSince`. */
export async function listEndedConferences(
  meetingCode: string,
  endedSince: Date,
): Promise<ConferenceRecord[]> {
  const records = await listAll<GConferenceRecord>("conferenceRecords", "conferenceRecords", {
    filter: `space.meeting_code = "${meetingCode}" AND end_time >= "${endedSince.toISOString()}"`,
    pageSize: "100",
  });
  return records.map(parseConferenceRecord).filter((r) => r.endedAt !== null);
}

export type MeetTranscriptState = "STATE_UNSPECIFIED" | "STARTED" | "ENDED" | "FILE_GENERATED";

export type MeetTranscript = {
  name: string; // "conferenceRecords/{id}/transcripts/{id}"
  state: MeetTranscriptState;
  docUrl: string | null; // the Google Docs copy, for reference only
};

export async function listTranscripts(conferenceRecord: string): Promise<MeetTranscript[]> {
  const items = await listAll<{
    name: string;
    state?: MeetTranscriptState;
    docsDestination?: { exportUri?: string };
  }>(`${conferenceRecord}/transcripts`, "transcripts", { pageSize: "100" });
  return items.map((t) => ({
    name: t.name,
    state: t.state ?? "STATE_UNSPECIFIED",
    docUrl: t.docsDestination?.exportUri ?? null,
  }));
}

export type RawTranscriptEntry = {
  participant: string; // "conferenceRecords/{id}/participants/{id}"
  text: string;
  languageCode?: string;
  startTime: string;
  endTime?: string;
};

/** All entries of a generated transcript, in start-time order. */
export async function listTranscriptEntries(transcriptName: string): Promise<RawTranscriptEntry[]> {
  return listAll<RawTranscriptEntry>(`${transcriptName}/entries`, "transcriptEntries", {
    pageSize: "100",
  });
}

type GParticipant = {
  name: string;
  signedinUser?: { user?: string; displayName?: string };
  anonymousUser?: { displayName?: string };
  phoneUser?: { displayName?: string };
  earliestStartTime?: string;
  latestEndTime?: string;
};

export type MeetParticipant = {
  name: string; // participant resource name
  displayName: string;
  kind: "signed_in" | "anonymous" | "phone";
  userId: string | null; // "users/{id}" — a Google id, never an email
  joinedAt: string | null;
  leftAt: string | null;
};

export function parseParticipant(p: GParticipant): MeetParticipant {
  const kind = p.signedinUser ? "signed_in" : p.phoneUser ? "phone" : "anonymous";
  const displayName =
    p.signedinUser?.displayName ??
    p.anonymousUser?.displayName ??
    p.phoneUser?.displayName ??
    "Unknown participant";
  return {
    name: p.name,
    displayName,
    kind,
    userId: p.signedinUser?.user ?? null,
    joinedAt: p.earliestStartTime ?? null,
    leftAt: p.latestEndTime ?? null,
  };
}

export async function listParticipants(conferenceRecord: string): Promise<MeetParticipant[]> {
  const items = await listAll<GParticipant>(`${conferenceRecord}/participants`, "participants", {
    pageSize: "250",
  });
  return items.map(parseParticipant);
}
