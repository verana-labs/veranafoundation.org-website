"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { createMembershipInvoice, markInvoicePaid } from "@/app/lib/invoices";
import { tierAmount, formatEur } from "@/app/lib/dues";
import { sendPaymentRequestEmail } from "@/app/lib/billing-emails";

export async function markPaid(formData: FormData) {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) throw new Error("Forbidden");

  const invoiceId = String(formData.get("invoiceId"));
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Not found");

  await markInvoicePaid({
    invoiceId,
    provider: "offline_bank_transfer",
    amount: invoice.grossAmount,
  });
  await db.adminAction.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email!,
      action: "invoice.mark_paid",
      targetType: "Invoice",
      targetId: invoiceId,
    },
  });
  revalidatePath("/admin/invoices");
}

/**
 * Reissue dues for a void/expired case: a fresh invoice (new number, new
 * 30-day due date, current tier price) on the same membership, emailed to the
 * member. The membership year starts on the day of payment (markInvoicePaid:
 * a lapse past the grace window never extends from the old periodEnd).
 */
export async function reissueInvoice(formData: FormData) {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) throw new Error("Forbidden");

  const invoiceId = String(formData.get("invoiceId"));
  const old = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { membership: { include: { member: true } } },
  });
  if (!old) throw new Error("Not found");
  const m = old.membership;
  if (old.status !== "void" || m.class !== "associate") {
    throw new Error("Only void Associate invoices can be reissued.");
  }
  const open = await db.invoice.findFirst({
    where: { membershipId: m.id, status: "issued" },
    select: { id: true },
  });
  if (open) throw new Error("An open invoice already exists for this membership.");
  const net = m.tier ? tierAmount(m.tier) : null;
  if (net == null) throw new Error("Membership has no resolvable tier.");

  const inv = await createMembershipInvoice({
    membershipId: m.id,
    net,
    country: m.member.jurisdiction ?? "EE",
    hasVatNumber: !!m.member.vatNumber,
  });
  if (m.status === "expired") {
    await db.membership.update({ where: { id: m.id }, data: { status: "pending" } });
  }
  try {
    await sendPaymentRequestEmail({
      to: [m.member.primaryEmail, m.member.noticeBillingEmail].filter(Boolean).join(","),
      memberName: m.member.legalName,
      invoiceNumber: inv.number,
      amountDue: formatEur(inv.grossAmount),
      vatNote:
        inv.vat.treatment === "reverse_charge"
          ? "VAT reverse-charged (Art. 196 EU VAT Directive)"
          : inv.vat.vatAmount > 0
            ? `Includes ${formatEur(inv.vat.vatAmount)} VAT`
            : null,
      dueDate: inv.dueDate,
      payUrl: inv.payUrl,
      invoiceId: inv.invoiceId,
    });
  } catch (e) {
    console.error("[admin] reissue email failed", e);
  }
  await db.adminAction.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email!,
      action: "invoice.reissue",
      targetType: "Invoice",
      targetId: inv.invoiceId,
      before: { voided: old.number },
      after: { number: inv.number },
    },
  });
  revalidatePath("/admin/invoices");
}

export async function voidInvoice(formData: FormData) {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) throw new Error("Forbidden");

  const invoiceId = String(formData.get("invoiceId"));
  await db.invoice.update({ where: { id: invoiceId }, data: { status: "void" } });
  await db.adminAction.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email!,
      action: "invoice.void",
      targetType: "Invoice",
      targetId: invoiceId,
    },
  });
  revalidatePath("/admin/invoices");
}
