import { NextResponse } from "next/server";
import { getStripe } from "@/app/lib/payments/stripe";
import { db } from "@/app/lib/db";
import { markInvoicePaid } from "@/app/lib/invoices";

export const dynamic = "force-dynamic";

// Stripe sends events here. We verify the signature, then on a paid invoice we
// mark our Invoice paid and activate the membership (idempotent).
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    const stripeInvoice = event.data.object as {
      id?: string;
      amount_paid?: number;
      metadata?: { invoiceId?: string };
    };
    const invoiceId = stripeInvoice.metadata?.invoiceId;
    const invoice = invoiceId
      ? await db.invoice.findUnique({ where: { id: invoiceId } })
      : stripeInvoice.id
        ? await db.invoice.findFirst({ where: { providerRef: stripeInvoice.id } })
        : null;

    if (invoice) {
      await markInvoicePaid({
        invoiceId: invoice.id,
        provider: "stripe",
        providerRef: stripeInvoice.id ?? null,
        amount: stripeInvoice.amount_paid ?? invoice.grossAmount,
      });
    }
  }

  return NextResponse.json({ received: true });
}
