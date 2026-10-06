import { db } from "@/app/lib/db";
import { minutesAiConfigured, summarizeMinutes } from "@/app/lib/minutes-ai";

/**
 * The ≤ 40-word one-liner shown on a published session's card. Kept in its
 * own module (no Next.js imports) so both the service layer and the cron
 * pipeline can use it, and the pipeline stays unit-testable.
 */

/** (Re)generate the summary; no-op without the AI key or without minutes. */
export async function refreshSessionSummary(sessionId: string): Promise<boolean> {
  if (!minutesAiConfigured()) return false;
  const session = await db.wgSession.findUnique({ where: { id: sessionId }, include: { wg: true } });
  if (!session || session.status !== "published" || !session.notesMd.trim()) return false;
  const { summary } = await summarizeMinutes({
    wgName: session.wg.name,
    language: session.wg.language,
    minutesMd: session.notesMd,
  });
  await db.wgSession.update({ where: { id: sessionId }, data: { summary } });
  return true;
}

/** Published sessions without a summary yet (older ones, or a failed call at publish). */
export async function backfillSessionSummaries(limit = 5): Promise<number> {
  if (!minutesAiConfigured()) return 0;
  const sessions = await db.wgSession.findMany({
    where: { status: "published", summary: null, NOT: { notesMd: "" } },
    orderBy: { occurredAt: "desc" },
    take: limit,
    select: { id: true },
  });
  let done = 0;
  for (const s of sessions) {
    try {
      if (await refreshSessionSummary(s.id)) done++;
    } catch (e) {
      console.warn(`[session-summary] backfill of ${s.id} failed:`, e);
    }
  }
  return done;
}
