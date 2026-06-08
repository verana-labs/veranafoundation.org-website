"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { markInvoicePaid } from "@/app/lib/invoices";

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
