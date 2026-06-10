import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { formatEur } from "@/app/lib/dues";
import { PageHero, Section } from "@/app/components/PageHero";
import { markPaid, reissueInvoice, voidInvoice } from "./actions";

export const metadata: Metadata = { title: "Invoices · Admin" };

export default async function AdminInvoicesPage() {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) notFound();

  const invoices = await db.invoice.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { membership: { include: { member: true } } },
  });

  return (
    <>
      <PageHero back={{ href: "/admin", label: "Admin" }} title="Invoices" />
      <Section bordered={false}>
        {invoices.length === 0 ? (
          <p className="text-muted">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="p-2">Number</th>
                <th className="p-2">Member</th>
                <th className="p-2">Gross</th>
                <th className="p-2">VAT</th>
                <th className="p-2">Method</th>
                <th className="p-2">Status</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-rule align-middle">
                  <td className="p-2 whitespace-nowrap">{inv.number}</td>
                  <td className="p-2 text-muted">
                    {inv.membership.member.legalName}
                  </td>
                  <td className="p-2 whitespace-nowrap">{formatEur(inv.grossAmount)}</td>
                  <td className="p-2 text-muted whitespace-nowrap">{inv.vatTreatment}</td>
                  <td className="p-2 text-muted">{inv.payMethod ?? "—"}</td>
                  <td className="p-2">
                    <span className="badge">{inv.status}</span>
                  </td>
                  <td className="p-2">
                    {inv.status === "issued" && (
                      <div className="flex gap-2">
                        <form action={markPaid}>
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          <button type="submit" className="btn text-xs">
                            Mark paid
                          </button>
                        </form>
                        <form action={voidInvoice}>
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          <button type="submit" className="btn text-xs">
                            Void
                          </button>
                        </form>
                      </div>
                    )}
                    {inv.status === "void" &&
                      inv.membership.class === "associate" &&
                      inv.membership.status !== "active" && (
                        <form action={reissueInvoice}>
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          <button
                            type="submit"
                            className="btn text-xs"
                            title="Fresh invoice (new number, 30-day due date, current tier price); membership year starts on payment."
                          >
                            Reissue
                          </button>
                        </form>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Section>
    </>
  );
}
