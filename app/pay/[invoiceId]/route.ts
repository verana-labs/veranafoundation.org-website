import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { createCheckoutSession, getStripe } from "@/app/lib/payments/stripe";

export const dynamic = "force-dynamic";

// The persistent pay link printed on invoices, emails and the apply flow.
// Deliberately outside the auth middleware: it's opened from email, possibly
// by a billing contact without an account. The invoice id is an unguessable
// cuid and the page leaks nothing — it just forwards to Stripe Checkout.
// A fresh session is minted per click (Checkout Sessions expire after 24h).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { membership: { include: { member: true } } },
  });
  if (!invoice) return to("/account");
  if (invoice.status === "paid") return to(`/account?paid=${invoice.id}`);
  if (invoice.status !== "issued" || !getStripe()) return to("/account?payError=1");

  const member = invoice.membership.member;
  try {
    const session = await createCheckoutSession({
      member: {
        id: member.id,
        legalName: member.legalName,
        primaryEmail: member.primaryEmail,
        stripeCustomerId: member.stripeCustomerId,
      },
      invoice: {
        id: invoice.id,
        number: invoice.number,
        grossAmount: invoice.grossAmount,
        currency: invoice.currency,
        description: `Associate membership dues — ${invoice.number}`,
      },
    });

    await db.$transaction([
      // Latest session id, for support/audit; the webhook matches by metadata.
      db.invoice.update({
        where: { id: invoice.id },
        data: { providerRef: session.sessionId },
      }),
      ...(member.stripeCustomerId
        ? []
        : [
            db.member.update({
              where: { id: member.id },
              data: { stripeCustomerId: session.customerId },
            }),
          ]),
    ]);

    return NextResponse.redirect(session.url, 303);
  } catch (e) {
    console.error("[pay] checkout session failed", e);
    return to("/account?payError=1");
  }
}
