/**
 * Shapes and pure formatting helpers for persisted Meet transcripts
 * (ADR-0004). Shared by the pipeline, the AI prompt, the minutes repo files
 * and the UI, so every surface renders the same "[HH:MM:SS] Name: text" line.
 */

export type TranscriptEntry = {
  at: string; // ISO start of the utterance
  end: string | null;
  speaker: string; // Meet display name at the time of the meeting
  participant: string; // Meet participant resource name
  text: string;
  lang: string | null; // BCP 47 as reported by Meet, e.g. "en-US"
};

/** A Meet participant, kept as an attendance cross-check (never applied). */
export type MeetAttendee = {
  name: string; // display name
  kind: "signed_in" | "anonymous" | "phone";
  userId: string | null; // Google "users/{id}", never an email
  joinedAt: string | null;
  leftAt: string | null;
};

/** "HH:MM:SS" elapsed since the meeting started (clamped at zero). */
export function elapsedLabel(startedAt: Date, at: Date): string {
  const total = Math.max(0, Math.floor((at.getTime() - startedAt.getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** One line per utterance: "[00:12:34] Jane Doe: text". */
export function transcriptLines(entries: TranscriptEntry[], startedAt: Date): string[] {
  return entries.map(
    (e) => `[${elapsedLabel(startedAt, new Date(e.at))}] ${e.speaker}: ${e.text.trim()}`,
  );
}

/** Distinct speaker names, in order of first appearance. */
export function speakerNames(entries: TranscriptEntry[]): string[] {
  const seen = new Set<string>();
  for (const e of entries) seen.add(e.speaker);
  return [...seen];
}

/** Rough word count, for the UI and the "empty transcript" rule. */
export function wordCount(entries: TranscriptEntry[]): number {
  return entries.reduce((n, e) => n + e.text.trim().split(/\s+/).filter(Boolean).length, 0);
}
