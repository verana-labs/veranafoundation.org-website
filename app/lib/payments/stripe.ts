import Stripe from "stripe";

const SITE_URL = process.env.AUTH_URL ?? "https://veranafoundation.org";

// Where Stripe domiciles the virtual IBAN shown for EU bank transfers
// (one of BE / DE / ES / FR / IE / NL — Estonia isn't offered).
const BANK_TRANSFER_COUNTRY = process.env.STRIPE_BANK_TRANSFER_COUNTRY ?? "DE";

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

// Stripe Checkout as a collector (payment mode, no `invoice_creation`): our DB
// owns the single canonical invoice (number, VAT, PDF) and Checkout only takes
// the payment — members never see a second, Stripe-numbered invoice and the
// 0.4% Stripe Invoicing fee doesn't apply. VAT is computed in-app (vat.ts) and
// charged as the gross amount on one line; Stripe Tax stays off. Sessions
// expire after 24h, so /pay/[invoiceId] mints a fresh one per click.
// See verana-invoicing-spec.md §Provider choice.
export async function createCheckoutSession(args: {
  member: {
    id: string;
    legalName: string;
    primaryEmail: string;
    stripeCustomerId: string | null;
  };
  invoice: {
    id: string;
    number: string;
    grossAmount: number; // minor units; VAT already computed in-app
    currency: string;
    description: string;
  };
}): Promise<{ url: string; sessionId: string; customerId: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured.");
  const { member, invoice } = args;

  let customerId = member.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: member.legalName,
      email: member.primaryEmail,
      metadata: { memberId: member.id },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    // Card settles instantly; customer_balance is Stripe's SEPA bank transfer
    // (async — confirmed by checkout.session.async_payment_succeeded).
    payment_method_types: ["card", "customer_balance"],
    payment_method_options: {
      customer_balance: {
        funding_type: "bank_transfer",
        bank_transfer: {
          type: "eu_bank_transfer",
          eu_bank_transfer: { country: BANK_TRANSFER_COUNTRY },
        },
      },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: invoice.currency.toLowerCase(),
          unit_amount: invoice.grossAmount,
          product_data: { name: invoice.description },
        },
      },
    ],
    client_reference_id: invoice.id,
    metadata: { invoiceId: invoice.id, number: invoice.number },
    payment_intent_data: {
      metadata: { invoiceId: invoice.id, number: invoice.number },
    },
    success_url: `${SITE_URL}/account?paid=${invoice.id}`,
    cancel_url: `${SITE_URL}/account`,
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return { url: session.url, sessionId: session.id, customerId };
}
