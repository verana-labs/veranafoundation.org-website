import { NextResponse } from "next/server";
import { runDunning } from "@/app/lib/dunning";

export const dynamic = "force-dynamic";

// Daily dunning/renewal job (see lib/dunning.ts): renewal invoices on
// periodEnd, reminders at 7/14/21/28 days, void + expire at 39. Idempotent —
// safe to re-run. Triggered by k8s/cronjob-dunning.yaml.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDunning();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[dunning-cron] failed", e);
    return NextResponse.json({ error: "Dunning failed" }, { status: 500 });
  }
}
