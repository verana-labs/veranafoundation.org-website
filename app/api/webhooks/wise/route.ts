import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileWiseCredits } from "@/app/lib/wise-reconcile";

export const dynamic = "force-dynamic";

// Wise profile webhook (subscribe `balances#credit` on the business profile,
// pointing here). Wise signs every delivery with its own RSA key — set
// WISE_WEBHOOK_PUBLIC_KEY to the PEM published in their docs (per environment).
// The payload's amount/currency are ignored on purpose: the event is only a
// trigger, and reconciliation re-reads the SCA-protected statement itself, so
// even a forged call could at worst start a harmless idempotent scan.
export async function POST(req: Request) {
  const pem = process.env.WISE_WEBHOOK_PUBLIC_KEY;
  if (!pem) {
    return NextResponse.json({ error: "Wise webhook not configured" }, { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get("x-signature-sha256");
  const valid =
    !!signature &&
    crypto.verify("RSA-SHA256", Buffer.from(body), pem, Buffer.from(signature, "base64"));
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { event_type?: string } = {};
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (event.event_type === "balances#credit") {
    try {
      await reconcileWiseCredits();
    } catch (e) {
      // 200 anyway: Wise retries failures, and the cron backstop re-covers the
      // window — a transient statement error must not disable the webhook.
      console.error("[wise-webhook] reconcile failed", e);
    }
  }

  return NextResponse.json({ received: true });
}
