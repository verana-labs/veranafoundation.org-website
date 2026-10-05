import type { Prisma, WgTranscriptStatus } from "@prisma/client";
import { db } from "@/app/lib/db";
import {
  listEndedConferences,
  listParticipants,
  listTranscriptEntries,
  listTranscripts,
  meetConfigured,
  type MeetParticipant,
  type RawTranscriptEntry,
} from "@/app/lib/google-meet";
import { draftMinutes, minutesAiConfigured } from "@/app/lib/minutes-ai";
import { sendMinutesReviewEmail } from "@/app/lib/wg-minutes-emails";
import { alertOps } from "@/app/lib/relaticle";
import { formatInTimezone } from "@/app/lib/recurrence";
import { occurrenceFor, personName, syncMeetConfig } from "@/app/lib/working-groups";
import {
  wordCount,
  type MeetAttendee,
  type TranscriptEntry,
} from "@/app/lib/transcript-format";

/**
 * The transcript pipeline (ADR-0004 §2): a step machine driven by
 * /api/cron/wg-transcripts (every 5 minutes). Each step commits its own
 * result, so a crash never loses work and a re-run converges:
 *
 *   discover ─► awaiting_transcript ─► transcribed ─► summarized ─► awaiting_approval
 *                     (Google)            (Meet API)     (Claude)        (email leads)
 *
 * A lead then approves (publishSession) or discards from the session page.
 * Failures store `lastError` and retry with backoff; after MAX_ATTEMPTS the
 * row is `failed` and ops are alerted. "Waiting for Google" is not a failure.
 */

export const DISCOVER_LOOKBACK_HOURS = 48;
/** Give up waiting for a transcript file this long after the meeting ended. */
export const TRANSCRIPT_WAIT_HOURS = 24;
/** A conference with no transcript resource at all after this is discarded. */
export const NO_TRANSCRIPT_GRACE_HOURS = 2;
export const MAX_ATTEMPTS = 5;
export const LOCK_STALE_MIN = 15;
export const REMINDER_AFTER_DAYS = 3;
export const RETENTION_DAYS = 90;
/** Below this many words the transcript is treated as empty (env-tunable for tests). */
export const MIN_WORDS = Number(process.env.MINUTES_MIN_WORDS) || 20;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Minutes to wait before retrying after the nth consecutive failure. */
export function backoffMinutes(attempt: number): number {
  return Math.min(5 * 2 ** Math.max(0, attempt - 1), 360);
}

/** Merge the entries of one or more conference records, speakers resolved. */
export function mergeEntries(
  parts: { entries: RawTranscriptEntry[]; participants: MeetParticipant[] }[],
): TranscriptEntry[] {
  const out: TranscriptEntry[] = [];
  for (const part of parts) {
    const names = new Map(part.participants.map((p) => [p.name, p.displayName]));
    for (const e of part.entries) {
      const text = e.text?.trim();
      if (!text) continue;
      out.push({
        at: e.startTime,
        end: e.endTime ?? null,
        speaker: names.get(e.participant) ?? "Unknown participant",
        participant: e.participant,
        text,
        lang: e.languageCode ?? null,
      });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** Participants of all records, de-duplicated (same person rejoining). */
export function toAttendees(participants: MeetParticipant[]): MeetAttendee[] {
  const byKey = new Map<string, MeetAttendee>();
  for (const p of participants) {
    const key = p.userId ?? `${p.kind}:${p.displayName.toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        name: p.displayName,
        kind: p.kind,
        userId: p.userId,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
      });
    } else {
      if (p.joinedAt && (!prev.joinedAt || p.joinedAt < prev.joinedAt)) prev.joinedAt = p.joinedAt;
      if (p.leftAt && (!prev.leftAt || p.leftAt > prev.leftAt)) prev.leftAt = p.leftAt;
    }
  }
  return [...byKey.values()].sort((a, b) => (a.joinedAt ?? "").localeCompare(b.joinedAt ?? ""));
}

const TERMINAL: WgTranscriptStatus[] = ["approved", "discarded", "failed"];
const ACTIVE: WgTranscriptStatus[] = ["awaiting_transcript", "transcribed", "summarized"];

/** Whether the pipeline still owes this row a step. */
export function isActiveStatus(status: WgTranscriptStatus): boolean {
  return ACTIVE.includes(status);
}

// ── Discover ─────────────────────────────────────────────────────────────────

export type DiscoverResult = { scanned: number; discovered: number; errors: string[] };

/**
 * Find ended conferences on every auto-minutes group's meeting code and attach
 * each new one to the session of its occurrence (created if needed).
 */
export async function discoverTranscripts(now = new Date()): Promise<DiscoverResult> {
  const result: DiscoverResult = { scanned: 0, discovered: 0, errors: [] };
  const groups = await db.workingGroup.findMany({
    where: { autoMinutes: true, state: "enabled", schedule: { meetingCode: { not: null } } },
    include: { schedule: true },
  });
  const since = new Date(now.getTime() - DISCOVER_LOOKBACK_HOURS * HOUR);

  for (const wg of groups) {
    const schedule = wg.schedule!;
    const code = schedule.meetingCode!;
    result.scanned++;
    let records;
    try {
      records = await listEndedConferences(code, since);
    } catch (e) {
      result.errors.push(`${wg.slug}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const record of records) {
      const known = await db.wgTranscript.findFirst({
        where: { conferenceRecords: { has: record.name } },
        select: { id: true },
      });
      if (known) continue;

      const occurredAt = occurrenceFor(schedule, record.startedAt);
      const session = await db.wgSession.upsert({
        where: { wgId_occurredAt: { wgId: wg.id, occurredAt } },
        create: { wgId: wg.id, occurredAt, source: "ai_draft" },
        update: {},
        include: { transcript: true },
      });
      const existing = session.transcript;
      if (!existing) {
        await db.wgTranscript.create({
          data: {
            wgId: wg.id,
            sessionId: session.id,
            meetingCode: code,
            conferenceRecords: [record.name],
            startedAt: record.startedAt,
            endedAt: record.endedAt,
          },
        });
      } else if (TERMINAL.includes(existing.status)) {
        // The occurrence is settled; remember the record so it isn't rediscovered.
        console.warn(`[wg-transcripts] ${record.name} ignored: session ${session.id} is ${existing.status}`);
        await db.wgTranscript.update({
          where: { id: existing.id },
          data: { conferenceRecords: { push: record.name } },
        });
        continue;
      } else {
        // A resumed call: merge the new record and re-fetch everything.
        await db.wgTranscript.update({
          where: { id: existing.id },
          data: {
            conferenceRecords: { push: record.name },
            startedAt: record.startedAt < existing.startedAt ? record.startedAt : existing.startedAt,
            endedAt:
              record.endedAt && (!existing.endedAt || record.endedAt > existing.endedAt)
                ? record.endedAt
                : existing.endedAt,
            status: "awaiting_transcript",
            attempts: 0,
            nextAttemptAt: null,
            lastError: null,
          },
        });
      }
      result.discovered++;
    }
  }
  return result;
}

// ── Steps ────────────────────────────────────────────────────────────────────

const rowInclude = {
  wg: { include: { schedule: true, leads: { include: { user: true } } } },
  session: { include: { attendees: true } },
} satisfies Prisma.WgTranscriptInclude;

type Row = Prisma.WgTranscriptGetPayload<{ include: typeof rowInclude }>;

async function loadRow(id: string): Promise<Row> {
  return db.wgTranscript.findUniqueOrThrow({ where: { id }, include: rowInclude });
}

/** A session nobody touched: created by the pipeline, no notes, no attendance. */
function pristine(session: Row["session"]): boolean {
  return (
    session.source === "ai_draft" &&
    session.status === "draft" &&
    session.notesMd.trim() === "" &&
    session.attendees.length === 0
  );
}

/** Nothing will ever come of this conference: park the row (never alerts). */
async function autoDiscard(row: Row, note: string): Promise<void> {
  await db.wgTranscript.update({
    where: { id: row.id },
    data: { status: "discarded", lastError: note, nextAttemptAt: null },
  });
}

type StepOutcome = "advanced" | "waiting" | "done";

async function fetchStep(row: Row, now: Date): Promise<StepOutcome> {
  const parts: { entries: RawTranscriptEntry[]; participants: MeetParticipant[] }[] = [];
  const participants: MeetParticipant[] = [];
  let pending = 0;
  let missing = 0;
  for (const record of row.conferenceRecords) {
    const transcripts = await listTranscripts(record);
    if (transcripts.length === 0) {
      missing++;
      continue;
    }
    const generated = transcripts.filter((t) => t.state === "FILE_GENERATED");
    if (generated.length < transcripts.length) {
      pending++;
      continue;
    }
    const people = await listParticipants(record);
    participants.push(...people);
    for (const t of generated) {
      parts.push({ entries: await listTranscriptEntries(t.name), participants: people });
    }
  }

  const endedAt = row.endedAt ?? row.startedAt;
  const hoursSinceEnd = (now.getTime() - endedAt.getTime()) / HOUR;
  if (pending > 0 && hoursSinceEnd < TRANSCRIPT_WAIT_HOURS) return "waiting";
  if (parts.length === 0) {
    if (missing > 0 && pending === 0 && hoursSinceEnd < NO_TRANSCRIPT_GRACE_HOURS) return "waiting";
    await autoDiscard(
      row,
      pending > 0
        ? "Google never finished generating the transcript."
        : "No transcript was generated for this meeting (transcription was off, or nobody spoke).",
    );
    return "done";
  }

  const entries = mergeEntries(parts);
  if (wordCount(entries) < MIN_WORDS) {
    await autoDiscard(row, "The transcript is empty.");
    return "done";
  }
  await db.wgTranscript.update({
    where: { id: row.id },
    data: {
      entries: entries as unknown as Prisma.InputJsonValue,
      entryCount: entries.length,
      meetParticipants: toAttendees(participants) as unknown as Prisma.InputJsonValue,
      language: entries.find((e) => e.lang)?.lang ?? null,
      status: "transcribed",
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
    },
  });
  return "advanced";
}

async function summarizeStep(row: Row): Promise<StepOutcome> {
  if (!minutesAiConfigured()) {
    // Leads still get the transcript; the draft is written by hand.
    await db.wgTranscript.update({
      where: { id: row.id },
      data: {
        status: "summarized",
        lastError: "Minutes AI is not configured (ANTHROPIC_API_KEY); no draft was generated.",
      },
    });
    return "advanced";
  }
  const entries = (row.entries ?? []) as unknown as TranscriptEntry[];
  const previous = await db.wgSession.findFirst({
    where: { wgId: row.wgId, status: "published", occurredAt: { lt: row.session.occurredAt } },
    orderBy: { occurredAt: "desc" },
    select: { notesMd: true },
  });
  const draft = await draftMinutes({
    wgName: row.wg.name,
    wgDescription: row.wg.description,
    language: row.wg.language,
    attendees: row.session.attendees.map((a) => a.name),
    previousMinutes: previous?.notesMd ?? null,
    startedAt: row.startedAt,
    entries,
  });
  // Prefill the lead's working copy unless they already wrote something.
  const untouched =
    row.session.notesMd.trim() === "" ||
    (row.summaryMd !== null && row.session.notesMd === row.summaryMd);
  await db.$transaction([
    db.wgTranscript.update({
      where: { id: row.id },
      data: {
        summaryMd: draft.minutesMd,
        summaryModel: draft.model,
        summarizedAt: new Date(),
        openQuestions: draft.openQuestions,
        status: "summarized",
        attempts: 0,
        lastError: null,
        nextAttemptAt: null,
      },
    }),
    ...(untouched && row.session.status === "draft"
      ? [
          db.wgSession.update({
            where: { id: row.sessionId },
            data: { notesMd: draft.minutesMd, source: "ai_draft" },
          }),
        ]
      : []),
  ]);
  console.log(
    `[wg-transcripts] drafted ${row.wg.slug} ${row.session.occurredAt.toISOString().slice(0, 10)}: ` +
      `${draft.inputTokens} in / ${draft.outputTokens} out tokens (${draft.model})`,
  );
  return "advanced";
}

function meetingLabel(row: Row): string {
  const tz = row.wg.schedule?.timezone ?? "UTC";
  return formatInTimezone(row.session.occurredAt, tz);
}

async function notifyLeads(row: Row, reminder: boolean): Promise<number> {
  let sent = 0;
  for (const lead of row.wg.leads) {
    if (!lead.user.email) continue;
    await sendMinutesReviewEmail({
      to: lead.user.email,
      wgName: row.wg.name,
      wgSlug: row.wg.slug,
      sessionId: row.sessionId,
      meetingLabel: meetingLabel(row),
      attendees: row.session.attendees.map((a) => a.name),
      summaryMd: row.summaryMd,
      openQuestions: (row.openQuestions as string[] | null) ?? [],
      reminder,
    });
    sent++;
  }
  return sent;
}

async function notifyStep(row: Row): Promise<StepOutcome> {
  // A regenerated draft doesn't re-notify: the leads already know.
  if (!row.approvalRequestedAt) await notifyLeads(row, false);
  await db.wgTranscript.update({
    where: { id: row.id },
    data: {
      status: "awaiting_approval",
      approvalRequestedAt: row.approvalRequestedAt ?? new Date(),
      attempts: 0,
      // Keep the "AI not configured" note when no draft could be produced.
      lastError: row.summaryMd ? null : row.lastError,
      nextAttemptAt: null,
    },
  });
  return "advanced";
}

async function recordFailure(id: string, e: unknown, now: Date): Promise<void> {
  const message = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
  const row = await db.wgTranscript.findUnique({ where: { id }, include: { wg: true } });
  if (!row) return;
  const attempts = row.attempts + 1;
  const failed = attempts >= MAX_ATTEMPTS;
  await db.wgTranscript.update({
    where: { id },
    data: {
      attempts,
      lastError: message,
      nextAttemptAt: failed ? null : new Date(now.getTime() + backoffMinutes(attempts) * 60_000),
      ...(failed ? { status: "failed" } : {}),
    },
  });
  console.error(`[wg-transcripts] ${row.wg.slug} ${id} attempt ${attempts} failed: ${message}`);
  if (failed) {
    await alertOps(
      `⚠️ Working-group minutes pipeline gave up on ${row.wg.name} (transcript ${id}) after ${attempts} attempts: ${message}`,
    );
  }
}

export type ProcessResult = { status: WgTranscriptStatus; waiting: boolean; locked?: boolean };

/**
 * Advance one transcript as far as it can go right now (several steps in a
 * row when nothing blocks), under a short lock so two runs never overlap.
 */
export async function processTranscript(
  id: string,
  opts: { now?: Date; deadline?: number } = {},
): Promise<ProcessResult> {
  const now = opts.now ?? new Date();
  const claimed = await db.wgTranscript.updateMany({
    where: {
      id,
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - LOCK_STALE_MIN * 60_000) } }],
    },
    data: { lockedAt: now },
  });
  if (claimed.count === 0) {
    const row = await db.wgTranscript.findUniqueOrThrow({ where: { id }, select: { status: true } });
    return { status: row.status, waiting: true, locked: true };
  }

  try {
    for (let i = 0; i < 4; i++) {
      const row = await loadRow(id);
      if (!isActiveStatus(row.status)) return { status: row.status, waiting: false };
      if (opts.deadline && Date.now() > opts.deadline) return { status: row.status, waiting: true };
      const outcome =
        row.status === "awaiting_transcript"
          ? await fetchStep(row, now)
          : row.status === "transcribed"
            ? await summarizeStep(row)
            : await notifyStep(row);
      if (outcome !== "advanced") {
        const fresh = await db.wgTranscript.findUniqueOrThrow({ where: { id }, select: { status: true } });
        return { status: fresh.status, waiting: outcome === "waiting" };
      }
    }
    const row = await db.wgTranscript.findUniqueOrThrow({ where: { id }, select: { status: true } });
    return { status: row.status, waiting: isActiveStatus(row.status) };
  } catch (e) {
    await recordFailure(id, e, now);
    const row = await db.wgTranscript.findUniqueOrThrow({ where: { id }, select: { status: true } });
    return { status: row.status, waiting: row.status !== "failed" };
  } finally {
    await db.wgTranscript.update({ where: { id }, data: { lockedAt: null } }).catch(() => {});
  }
}

/** One reminder to the leads, REMINDER_AFTER_DAYS after the first notification. */
export async function sendReviewReminders(now = new Date()): Promise<number> {
  const due = await db.wgTranscript.findMany({
    where: {
      status: "awaiting_approval",
      remindedAt: null,
      approvalRequestedAt: { lt: new Date(now.getTime() - REMINDER_AFTER_DAYS * DAY) },
    },
    include: rowInclude,
  });
  let sent = 0;
  for (const row of due) {
    try {
      sent += await notifyLeads(row, true);
      await db.wgTranscript.update({ where: { id: row.id }, data: { remindedAt: now } });
    } catch (e) {
      console.error(`[wg-transcripts] reminder for ${row.id} failed:`, e);
    }
  }
  return sent;
}

/** Drop discarded/failed transcripts (and their untouched sessions) after RETENTION_DAYS. */
export async function cleanupTranscripts(now = new Date()): Promise<number> {
  const old = await db.wgTranscript.findMany({
    where: {
      status: { in: ["discarded", "failed"] },
      startedAt: { lt: new Date(now.getTime() - RETENTION_DAYS * DAY) },
    },
    include: { session: { include: { attendees: true } } },
  });
  for (const row of old) {
    if (pristine(row.session)) {
      await db.wgSession.delete({ where: { id: row.sessionId } }); // cascades
    } else {
      await db.wgTranscript.delete({ where: { id: row.id } });
    }
  }
  return old.length;
}

/**
 * Push the Meet setting to spaces that never received it (schedules that
 * predate ADR-0004) and retry failed pushes hourly, so the rollout and error
 * recovery don't wait for a lead to touch the schedule.
 */
export async function backfillMeetConfig(
  now = new Date(),
): Promise<{ attempted: number; failed: number }> {
  const schedules = await db.wgSchedule.findMany({
    where: {
      meetLink: { not: null },
      wg: { state: "enabled" },
      OR: [
        { meetingCode: null },
        { meetAutoTranscribe: null },
        { meetConfigError: { not: null }, updatedAt: { lt: new Date(now.getTime() - HOUR) } },
      ],
    },
    select: { wgId: true },
    take: 20,
  });
  let failed = 0;
  for (const s of schedules) {
    const r = await syncMeetConfig(s.wgId);
    if (!r.ok) failed++;
  }
  return { attempted: schedules.length, failed };
}

export type PipelineResult = {
  skipped?: string;
  meetConfig?: { attempted: number; failed: number };
  discover?: DiscoverResult;
  processed: number;
  waiting: number;
  failed: number;
  reminders: number;
  cleaned: number;
  errors: string[];
  ms: number;
};

/** The cron entry point: discover, advance every due row, remind, clean up. */
export async function runTranscriptPipeline(
  opts: { budgetMs?: number; now?: Date } = {},
): Promise<PipelineResult> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const deadline = started + (opts.budgetMs ?? 240_000);
  const result: PipelineResult = {
    processed: 0, waiting: 0, failed: 0, reminders: 0, cleaned: 0, errors: [], ms: 0,
  };
  if (!meetConfigured()) {
    return { ...result, skipped: "Google Workspace is not configured.", ms: Date.now() - started };
  }

  // Spaces first, so a code set just now is discovered in the same tick.
  result.meetConfig = await backfillMeetConfig(now);
  result.discover = await discoverTranscripts(now);
  result.errors.push(...result.discover.errors);

  const due = await db.wgTranscript.findMany({
    where: {
      status: { in: ACTIVE },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: 25,
  });
  for (const { id } of due) {
    if (Date.now() > deadline) break;
    const r = await processTranscript(id, { now, deadline });
    result.processed++;
    if (r.status === "failed") result.failed++;
    else if (r.waiting) result.waiting++;
  }

  result.reminders = await sendReviewReminders(now);
  result.cleaned = await cleanupTranscripts(now);
  result.ms = Date.now() - started;
  return result;
}

// ── Lead actions (called from server actions) ────────────────────────────────

/** Put a failed row back on the step it failed at. */
export async function requestRetry(id: string): Promise<void> {
  const row = await db.wgTranscript.findUniqueOrThrow({ where: { id } });
  await db.wgTranscript.update({
    where: { id },
    data: {
      status: row.entryCount > 0 ? "transcribed" : "awaiting_transcript",
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
      lockedAt: null,
    },
  });
}

/** Re-run the Claude step on an existing transcript. */
export async function requestRegeneration(id: string): Promise<void> {
  await db.wgTranscript.update({
    where: { id },
    data: { status: "transcribed", attempts: 0, lastError: null, nextAttemptAt: null, lockedAt: null },
  });
}

/** Advance a row now, outside the cron (fire-and-forget from a server action). */
export function processInBackground(id: string): void {
  processTranscript(id).catch((e) => console.error(`[wg-transcripts] background run ${id} failed:`, e));
}

/** The names Meet saw that match none of the ticked attendees (case-insensitive). */
export function unticked(
  meetParticipants: MeetAttendee[] | null,
  tickedNames: string[],
): MeetAttendee[] {
  if (!meetParticipants) return [];
  const ticked = new Set(tickedNames.map((n) => n.trim().toLowerCase()));
  return meetParticipants.filter((p) => !ticked.has(p.name.trim().toLowerCase()));
}

export { personName };
