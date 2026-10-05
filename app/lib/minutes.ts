import { transcriptLines, type TranscriptEntry } from "@/app/lib/transcript-format";

/**
 * Publishing WG meeting minutes to the public GitHub minutes repository
 * (ADR-0003): `MINUTES_REPO` (e.g. "verana-labs/working-groups"), path
 * `<wg-slug>/minutes/YYYY-MM-DD.md`. The DB keeps the working copy and renders
 * the history pages; the commit is the immutable, citable public record.
 *
 * ADR-0004 adds the optional transcript next to the minutes
 * (`<wg-slug>/transcripts/YYYY-MM-DD.md`, per-meeting opt-in by a lead) and
 * front-matter keys recording that the minutes started as an AI draft.
 *
 * Idempotent: re-publishing the same path updates the file (the existing blob
 * sha is sent), so a retry after a partial failure converges.
 */

const API = "https://api.github.com";

function config() {
  const repo = process.env.MINUTES_REPO;
  const token = process.env.MINUTES_GITHUB_TOKEN;
  if (!repo || !token) return null;
  return { repo, token };
}

export function minutesConfigured(): boolean {
  return config() !== null;
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "veranafoundation.org",
  };
}

const quote = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
const day = (d: Date) => d.toISOString().slice(0, 10);

export type MinutesInput = {
  wgSlug: string;
  wgName: string;
  date: Date; // the session's occurrence date
  attendees: string[]; // display names, snapshotted
  recordedBy: string;
  markdown: string; // the notes body
  draftedBy?: string | null; // AI model id when the minutes started as an AI draft
  approvedBy?: string | null; // the lead who approved that draft
  transcriptPath?: string | null; // repo path of the published transcript, if any
};

export function minutesPath(wgSlug: string, date: Date): string {
  return `${wgSlug}/minutes/${day(date)}.md`;
}

export function transcriptPath(wgSlug: string, date: Date): string {
  return `${wgSlug}/transcripts/${day(date)}.md`;
}

/** The committed file: YAML front matter + the notes. */
export function renderMinutes(input: MinutesInput): string {
  const d = day(input.date);
  return [
    "---",
    `working_group: ${quote(input.wgName)}`,
    `date: ${d}`,
    `recorded_by: ${quote(input.recordedBy)}`,
    "attendees:",
    ...input.attendees.map((a) => `  - ${quote(a)}`),
    ...(input.draftedBy ? [`drafted_by: ${quote(input.draftedBy)}`] : []),
    ...(input.approvedBy ? [`approved_by: ${quote(input.approvedBy)}`] : []),
    ...(input.transcriptPath ? [`transcript: ${quote(input.transcriptPath)}`] : []),
    "---",
    "",
    `# ${input.wgName} — ${d}`,
    "",
    input.markdown.trim(),
    "",
  ].join("\n");
}

export type TranscriptFileInput = {
  wgSlug: string;
  wgName: string;
  date: Date;
  startedAt: Date;
  language: string | null;
  participants: string[]; // Meet display names
  entries: TranscriptEntry[];
};

/** The committed transcript: front matter + one line per utterance. */
export function renderTranscript(input: TranscriptFileInput): string {
  const d = day(input.date);
  return [
    "---",
    `working_group: ${quote(input.wgName)}`,
    `date: ${d}`,
    ...(input.language ? [`language: ${quote(input.language)}`] : []),
    "participants:",
    ...input.participants.map((p) => `  - ${quote(p)}`),
    "source: Google Meet automatic transcription",
    "---",
    "",
    `# ${input.wgName} — transcript, ${d}`,
    "",
    "Automatic transcription; recognition errors are possible. Times are elapsed since the meeting started.",
    "",
    ...transcriptLines(input.entries, input.startedAt).map((l) => `- ${l}`),
    "",
  ].join("\n");
}

/** Create or update one file in the minutes repo; returns the commit sha. */
export async function commitFile(
  path: string,
  content: string,
  message: string,
): Promise<{ path: string; commitSha: string }> {
  const cfg = config();
  if (!cfg) {
    throw new Error("Minutes repo is not configured (MINUTES_REPO / MINUTES_GITHUB_TOKEN).");
  }
  const url = `${API}/repos/${cfg.repo}/contents/${path}`;

  // Existing file? Send its blob sha so the PUT is an update, not a conflict.
  let existingSha: string | undefined;
  const probe = await fetch(url, { headers: headers(cfg.token), cache: "no-store" });
  if (probe.ok) existingSha = ((await probe.json()) as { sha: string }).sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: headers(cfg.token),
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub commit failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { commit: { sha: string } };
  return { path, commitSha: data.commit.sha };
}

/** Commit the minutes; returns the repo path and commit sha. Throws on failure. */
export async function publishMinutes(
  input: MinutesInput,
): Promise<{ path: string; commitSha: string }> {
  return commitFile(
    minutesPath(input.wgSlug, input.date),
    renderMinutes(input),
    `minutes(${input.wgSlug}): ${day(input.date)}`,
  );
}

/** Commit the transcript next to the minutes (lead opt-in, per meeting). */
export async function publishTranscript(
  input: TranscriptFileInput,
): Promise<{ path: string; commitSha: string }> {
  return commitFile(
    transcriptPath(input.wgSlug, input.date),
    renderTranscript(input),
    `transcript(${input.wgSlug}): ${day(input.date)}`,
  );
}

/** Web URL of a published file at its exact commit. */
export function minutesUrl(path: string, commitSha: string): string | null {
  const cfg = config();
  if (!cfg) return null;
  return `https://github.com/${cfg.repo}/blob/${commitSha}/${path}`;
}
