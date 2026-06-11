import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileWiseCredits, alertIncomingCredit } from "@/app/lib/wise-reconcile";
import { WiseStatementAccessError } from "@/app/lib/payments/wise";

export const dynamic = "force-dynamic";

// Wise profile webhook (subscribe `balances#credit` on the business profile,
// pointing here). Wise signs every delivery with its own RSA key — set
// WISE_WEBHOOK_PUBLIC_KEY to the PEM published in their docs (per environment).
// The payload's amount/currency are ignored on purpose: the event is only a
// trigger, and reconciliation re-reads the SCA-protected statement itself, so
// even a forged call could at worst start a harmless idempotent scan.
export async function POST(req: Request) {
  // Tolerate \n-escaped PEMs (single-line env values).
  const pem = process.env.WISE_WEBHOOK_PUBLIC_KEY?.replace(/\\n/g, "\n");
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

  let event: {
    event_type?: string;
    data?: { amount?: number; currency?: string; occurred_at?: string };
  } = {};
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (event.event_type === "balances#credit") {
    try {
      await reconcileWiseCredits();
    } catch (e) {
      if (e instanceof WiseStatementAccessError && event.data?.amount != null) {
        // Statement API is closed to us (PSD2 SCA retirement) — degrade to an
        // admin alert with exact-amount invoice matches from the payload.
        console.warn("[wise-webhook] statement access unavailable — alerting admins", e.message);
        await alertIncomingCredit({
          amount: event.data.amount,
          currency: event.data.currency ?? "EUR",
          occurredAt: event.data.occurred_at ?? new Date().toISOString(),
        }).catch((err) => console.error("[wise-webhook] credit alert failed", err));
      } else {
        // 200 anyway: Wise retries failures, and the cron backstop re-covers
        // the window — a transient error must not disable the webhook.
        console.error("[wise-webhook] reconcile failed", e);
      }
    }
  }

  return NextResponse.json({ received: true });
}
