import type { PayMethod } from "@prisma/client";
import { db } from "@/app/lib/db";
import { computeVat, type VatResult } from "@/app/lib/vat";
import { sendPaymentReceiptEmail } from "@/app/lib/billing-emails";

const SITE_URL = process.env.AUTH_URL ?? "https://veranafoundation.org";

// Dunning cadence (days after an invoice is issued): reminders, then the
// invoice is voided and the membership/application expires. Shared with
// dunning.ts so the reminder copy and the continuity rule below agree.
export const REMINDER_DAYS = [7, 14, 21, 28] as const;
export const EXPIRE_DAYS = 39;

/** The single invoicing entity (lazily created). */
export async function getSellerEntity() {
  const fromEnv = {
    legalName: process.env.SELLER_LEGAL_NAME || "Verana Foundation (2060 OÜ)",
    country: process.env.SELLER_COUNTRY || "EE",
    vatNumber: process.env.SELLER_VAT_NUMBER || null,
  };
  const existing = await db.sellerEntity.findFirst();
  if (!existing) {
    return db.sellerEntity.create({
      data: { ...fromEnv, invoicePrefix: process.env.INVOICE_PREFIX || "VF-" },
    });
  }
  // Keep the row in step with config — the lazily-created row otherwise pins
  // the name/VAT forever (the prod row still said "…in formation, represented
  // by 2060 OÜ", which overflows the invoice PDF header).
  if (
    existing.legalName !== fromEnv.legalName ||
    existing.country !== fromEnv.country ||
    existing.vatNumber !== fromEnv.vatNumber
  ) {
    return db.sellerEntity.update({ where: { id: existing.id }, data: fromEnv });
  }
  return existing;
}

async function nextInvoiceNumber(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  // Low volume; count-based sequence is adequate. Uniqueness is also enforced
  // by the Invoice.number unique constraint.
  const n = (await db.invoice.count()) + 1;
  return `${prefix}${year}-${String(n).padStart(4, "0")}`;
}

/**
 * Our persistent pay link. It never expires — /pay/[invoiceId] mints a fresh
 * Stripe Checkout Session per click. Null when Stripe isn't configured
 * (bank transfer remains available via the emailed details).
 */
export function invoicePayUrl(invoiceId: string): string | null {
  return process.env.STRIPE_SECRET_KEY ? `${SITE_URL}/pay/${invoiceId}` : null;
}

/**
 * Create an issued invoice for a membership. No provider call here — our DB is
 * the system of record; payment is collected later via /pay/{id} (Checkout) or
 * a direct wire reconciled in admin. payMethod stays null until paid.
 */
export async function createMembershipInvoice(args: {
  membershipId: string;
  net: number;
  country: string;
  hasVatNumber: boolean;
}): Promise<{
  invoiceId: string;
  number: string;
  grossAmount: number;
  vat: VatResult;
  dueDate: Date;
  payUrl: string | null;
}> {
  const seller = await getSellerEntity();
  const vat = computeVat(args.net, args.country, args.hasVatNumber);
  const gross = args.net + vat.vatAmount;
  const number = await nextInvoiceNumber(seller.invoicePrefix);
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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
      dueDate,
      issuedAt: new Date(),
    },
  });

  return {
    invoiceId: invoice.id,
    number,
    grossAmount: gross,
    vat,
    dueDate,
    payUrl: invoicePayUrl(invoice.id),
  };
}

/**
 * Mark an invoice paid and activate its membership (idempotent), then send the
 * receipt email (best-effort). Called from the Stripe webhook and admin
 * mark-paid.
 */
export async function markInvoicePaid(args: {
  invoiceId: string;
  provider: string;
  providerRef?: string | null;
  amount: number;
  payMethod?: PayMethod;
}) {
  const invoice = await db.invoice.findUnique({
    where: { id: args.invoiceId },
    include: { membership: { include: { member: true } } },
  });
  if (!invoice || invoice.status === "paid") return;

  const now = new Date();
  // Period continuity: a renewal paid within the grace window extends from the
  // previous periodEnd (the member kept access during grace — paying late must
  // not gain free time). First payments, and reactivations after expiry (fresh
  // invoice), start the year on the day of payment.
  const prevEnd = invoice.membership.periodEnd;
  const base =
    prevEnd != null &&
    now.getTime() - prevEnd.getTime() <= EXPIRE_DAYS * 24 * 60 * 60 * 1000
      ? prevEnd
      : now;
  const periodEnd = new Date(base);
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);

  await db.$transaction([
    db.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "paid",
        paidAt: now,
        payMethod: args.payMethod ?? invoice.payMethod,
      },
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
      data: { status: "active", periodStart: base, periodEnd },
    }),
  ]);

  try {
    await sendPaymentReceiptEmail({
      to: invoice.membership.member.primaryEmail,
      memberName: invoice.membership.member.legalName,
      invoiceNumber: invoice.number,
      amountPaid: args.amount,
      periodEnd,
    });
  } catch (e) {
    console.error("[invoices] receipt email failed", e);
  }
}
