import { googleAccessToken, googleConfigured } from "@/app/lib/google-auth";

/**
 * Google Meet REST API client (ADR-0004), as the meetings role account that
 * owns every WG meeting space. Two uses:
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
  config?: {
    artifactConfig?: {
      recordingConfig?: { autoRecordingGeneration?: string };
      transcriptionConfig?: { autoTranscriptionGeneration?: string };
    };
  };
};

export type MeetSpace = {
  name: string; // "spaces/{space}"
  meetingCode: string;
  autoTranscription: boolean | null;
  autoRecording: boolean | null;
};

export function parseSpace(s: GSpace, fallbackCode: string): MeetSpace {
  const onOff = (v: string | undefined) => (v ? v === "ON" : null);
  return {
    name: s.name,
    meetingCode: s.meetingCode ?? fallbackCode,
    autoTranscription: onOff(s.config?.artifactConfig?.transcriptionConfig?.autoTranscriptionGeneration),
    autoRecording: onOff(s.config?.artifactConfig?.recordingConfig?.autoRecordingGeneration),
  };
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
  const space = await api<GSpace>(
    SETTINGS_SCOPES,
    "PATCH",
    current.name,
    { updateMask: "config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration" },
    {
      config: {
        artifactConfig: {
          transcriptionConfig: { autoTranscriptionGeneration: on ? "ON" : "OFF" },
        },
      },
    },
  );
  return parseSpace(space, meetingCode);
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
