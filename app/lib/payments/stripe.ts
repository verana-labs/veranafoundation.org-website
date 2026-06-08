import Stripe from "stripe";
import type { PaymentProvider } from "./types";

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

// Stripe Invoicing as a collector. VAT is computed in-app (vat.ts) and sent as
// the gross amount on a single line — we do not enable Stripe Tax, so the two
// payment paths stay consistent. (Switching to Stripe Tax + VIES is a future
// option; see verana-invoicing-spec.md.)
export const stripeProvider: PaymentProvider = {
  id: "stripe",
  async createInvoice({ member, invoice }) {
    const stripe = getStripe();
    if (!stripe) throw new Error("Card payments are not configured.");

    let customerId = member.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: member.legalName,
        email: member.primaryEmail,
        address: { country: member.country },
        metadata: { memberId: member.id },
      });
      customerId = customer.id;
    }

    await stripe.invoiceItems.create({
      customer: customerId,
      amount: invoice.grossAmount,
      currency: invoice.currency.toLowerCase(),
      description: invoice.description,
    });

    const created = await stripe.invoices.create({
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: 30,
      metadata: { invoiceId: invoice.id, number: invoice.number },
    });

    const finalized = await stripe.invoices.finalizeInvoice(created.id as string);

    return {
      providerRef: finalized.id ?? null,
      hostedPayUrl: finalized.hosted_invoice_url ?? null,
      customerId,
    };
  },
};
