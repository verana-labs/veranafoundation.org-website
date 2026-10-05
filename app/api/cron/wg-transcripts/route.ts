import { NextResponse } from "next/server";
import { runTranscriptPipeline } from "@/app/lib/transcripts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Working-group transcript pipeline (ADR-0004, lib/transcripts.ts): discover
// ended Meet conferences, persist their transcripts, draft the minutes with
// Claude, notify the leads; reminders and retention clean-up. Idempotent —
// safe to re-run. Triggered every 5 minutes by k8s/cronjob-wg-transcripts.yaml.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runTranscriptPipeline({ budgetMs: 240_000 });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[wg-transcripts-cron] failed", e);
    return NextResponse.json({ error: "Transcript pipeline failed" }, { status: 500 });
  }
}
