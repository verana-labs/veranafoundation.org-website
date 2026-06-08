import { db } from "@/app/lib/db";
import { computeVat } from "@/app/lib/vat";
import { getProvider, type PayMethod } from "@/app/lib/payments";

/** The single invoicing entity (lazily created). */
export async function getSellerEntity() {
  const existing = await db.sellerEntity.findFirst();
  if (existing) return existing;
  return db.sellerEntity.create({
    data: {
      legalName:
        process.env.SELLER_LEGAL_NAME ??
        "Verana Foundation (in formation), represented by 2060 OÜ",
      country: process.env.SELLER_COUNTRY ?? "EE",
      vatNumber: process.env.SELLER_VAT_NUMBER ?? null,
      invoicePrefix: process.env.INVOICE_PREFIX ?? "VF-",
    },
  });
}

async function nextInvoiceNumber(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  // Low volume; count-based sequence is adequate. Uniqueness is also enforced
  // by the Invoice.number unique constraint.
  const n = (await db.invoice.count()) + 1;
  return `${prefix}${year}-${String(n).padStart(4, "0")}`;
}

/**
 * Create an issued invoice for a membership and hand it to the payment
 * provider. Returns the hosted pay URL for card, or null for bank transfer.
 */
export async function createMembershipInvoice(args: {
  membershipId: string;
  member: {
    id: string;
    legalName: string;
    primaryEmail: string;
    stripeCustomerId: string | null;
  };
  net: number;
  country: string;
  hasVatNumber: boolean;
  payMethod: PayMethod;
}): Promise<{ invoiceId: string; hostedPayUrl: string | null }> {
  const seller = await getSellerEntity();
  const vat = computeVat(args.net, args.country, args.hasVatNumber);
  const gross = args.net + vat.vatAmount;
  const number = await nextInvoiceNumber(seller.invoicePrefix);

  const invoice = await db.invoice.create({
    data: {
      membershipId: args.membershipId,
      sellerEntityId: seller.id,
      number,
      currency: "EUR",
      netAmount: args.net,
      vatAmount: vat.vatAmount,
      grossAmount: gross,
      vatTreatment: vat.treatment,
      status: "issued",
      payMethod: args.payMethod,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      issuedAt: new Date(),
    },
  });

  const provider = getProvider(args.payMethod);
  const res = await provider.createInvoice({
    member: {
      id: args.member.id,
      legalName: args.member.legalName,
      primaryEmail: args.member.primaryEmail,
      country: args.country,
      stripeCustomerId: args.member.stripeCustomerId,
    },
    invoice: {
      id: invoice.id,
      number,
      grossAmount: gross,
      currency: "EUR",
      description: `Associate membership dues — ${number}`,
    },
  });

  if (res.providerRef) {
    await db.invoice.update({
      where: { id: invoice.id },
      data: { providerRef: res.providerRef },
    });
  }
  if (res.customerId && !args.member.stripeCustomerId) {
    await db.member.update({
      where: { id: args.member.id },
      data: { stripeCustomerId: res.customerId },
    });
  }

  return { invoiceId: invoice.id, hostedPayUrl: res.hostedPayUrl };
}

/** Mark an invoice paid and activate its membership (idempotent). */
export async function markInvoicePaid(args: {
  invoiceId: string;
  provider: string;
  providerRef?: string | null;
  amount: number;
}) {
  const invoice = await db.invoice.findUnique({
    where: { id: args.invoiceId },
    include: { membership: true },
  });
  if (!invoice || invoice.status === "paid") return;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);

  await db.$transaction([
    db.invoice.update({
      where: { id: invoice.id },
      data: { status: "paid", paidAt: now },
    }),
    db.payment.create({
      data: {
        invoiceId: invoice.id,
        provider: args.provider,
        providerRef: args.providerRef ?? null,
        amount: args.amount,
        currency: invoice.currency,
      },
    }),
    db.membership.update({
      where: { id: invoice.membershipId },
      data: { status: "active", periodStart: now, periodEnd },
    }),
  ]);
}
