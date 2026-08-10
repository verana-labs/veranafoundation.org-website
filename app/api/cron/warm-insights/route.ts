import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  INSIGHTS_CACHE_TAG,
  WINDOW_CHOICES,
  getInsights,
} from "@/app/lib/github-insights";

export const dynamic = "force-dynamic";

// Cache warmer for the /admin/contributors dashboard: recomputes the GitHub
// contributor insights for every window (7/30/90 days) so no visitor ever hits
// the multi-minute cold path — including right after a deploy, when the Next.js
// data cache starts empty. Call hourly, e.g. a k8s CronJob
// (k8s/cronjob-warm-insights.yaml):
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//     http://veranafoundation-website.web.svc.cluster.local/api/cron/warm-insights
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Mark every window's entry stale so the reads below recompute rather than
  // serve the previous hour's data. Users keep being served whatever is cached
  // while this request rebuilds the entries.
  revalidateTag(INSIGHTS_CACHE_TAG);

  // Sequential on purpose: each window already fans out across every active
  // repo with its own concurrency pool; running windows in parallel would
  // triple the GraphQL burst for no wall-clock win worth the rate-limit risk.
  const windows: { windowDays: number; ok: boolean; contributors?: number; ms: number }[] = [];
  for (const windowDays of WINDOW_CHOICES) {
    const started = Date.now();
    try {
      const insights = await getInsights(windowDays);
      windows.push({
        windowDays,
        ok: insights !== null,
        contributors: insights?.totals.contributors,
        ms: Date.now() - started,
      });
    } catch (e) {
      console.error(`[warm-insights] window ${windowDays}d failed`, e);
      windows.push({ windowDays, ok: false, ms: Date.now() - started });
    }
  }

  // 200 as long as the route ran; per-window failures are visible in the body
  // (and a run where every window failed returns 500 so the CronJob shows red).
  const allFailed = windows.every((w) => !w.ok);
  return NextResponse.json({ warmed: windows }, { status: allFailed ? 500 : 200 });
}
