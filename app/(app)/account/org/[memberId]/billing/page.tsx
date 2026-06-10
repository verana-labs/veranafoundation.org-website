import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isManagerOf } from "@/app/lib/authz";
import { formatEur } from "@/app/lib/dues";
import { PageHero, Section } from "@/app/components/PageHero";
import { openBillingPortal } from "./actions";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  const user = await currentUser();
  if (!user?.id || !(await isManagerOf(user.id, memberId))) notFound();

  const member = await db.member.findUnique({ where: { id: memberId } });
  if (!member) notFound();

  const invoices = await db.invoice.findMany({
    where: { membership: { memberId } },
    orderBy: { createdAt: "desc" },
  });

  const hasBankTransferDue = invoices.some(
    (i) => i.status === "issued" && i.payMethod === "bank_transfer",
  );
  const bankDetails = process.env.BANK_TRANSFER_DETAILS;

  return (
    <>
      <PageHero
        back={{ href: "/account", label: "Account" }}
        title="Billing"
      />
      <Section bordered={false}>
      {member.stripeCustomerId && (
        <form action={openBillingPortal} className="mb-6">
          <input type="hidden" name="memberId" value={memberId} />
          <button type="submit" className="btn btn-primary">
            Manage billing &amp; payment ↗
          </button>
        </form>
      )}

      {invoices.length === 0 ? (
        <p className="text-muted mt-6">No invoices yet.</p>
      ) : (
        <div className="overflow-x-auto mt-6">
          <table className="w-full border-collapse text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="p-2">Number</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Method</th>
                <th className="p-2">Status</th>
                <th className="p-2">Due</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-rule">
                  <td className="p-2 whitespace-nowrap">{inv.number}</td>
                  <td className="p-2 whitespace-nowrap">{formatEur(inv.grossAmount)}</td>
                  <td className="p-2 text-muted">{inv.payMethod ?? "—"}</td>
                  <td className="p-2">
                    <span className="badge">{inv.status}</span>
                  </td>
                  <td className="p-2 text-muted whitespace-nowrap">
                    {inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasBankTransferDue && (
        <div className="card mt-6">
          <h2 className="display text-lg">Bank transfer</h2>
          <p className="text-sm text-muted mt-1">
            Pay the outstanding invoice by bank transfer, using the{" "}
            <strong>invoice number as the payment reference</strong>. Your
            membership activates once we reconcile the payment.
          </p>
          {bankDetails ? (
            <pre className="text-sm mt-2 whitespace-pre-wrap">{bankDetails}</pre>
          ) : (
            <p className="text-sm text-muted mt-2">
              Bank details will be sent with your invoice.
            </p>
          )}
        </div>
      )}
      </Section>
    </>
  );
}
