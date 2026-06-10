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

  // Checkout (payment mode — the current flow). Cards complete synchronously
  // (`completed` with payment_status "paid"); SEPA bank transfers complete
  // later via `async_payment_succeeded`. markInvoicePaid is idempotent.
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as {
      id: string;
      payment_intent?: string | { id: string } | null;
      payment_status?: string;
      amount_total?: number | null;
      metadata?: { invoiceId?: string };
    };
    const invoiceId = session.metadata?.invoiceId;
    const settled =
      event.type === "checkout.session.async_payment_succeeded" ||
      session.payment_status === "paid";

    if (invoiceId && settled) {
      const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
      if (invoice) {
        await markInvoicePaid({
          invoiceId: invoice.id,
          provider: "stripe",
          providerRef:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? session.id,
          amount: session.amount_total ?? invoice.grossAmount,
          payMethod:
            event.type === "checkout.session.completed" ? "card" : "bank_transfer",
        });
      }
    }
  }

  // Legacy: Stripe-hosted invoices issued by the previous flow.
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
