import { NextResponse } from "next/server";
import { reconcileWiseCredits } from "@/app/lib/wise-reconcile";

export const dynamic = "force-dynamic";

// Cron backstop for Wise reconciliation (the `balances#credit` webhook is the
// primary trigger). Call daily, e.g. a k8s CronJob:
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//     http://veranafoundation-website.web.svc.cluster.local/api/cron/wise-reconcile
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await reconcileWiseCredits();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[wise-cron] reconcile failed", e);
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
  }
}
