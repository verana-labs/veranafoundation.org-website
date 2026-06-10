import type { Metadata } from "next";
import Link from "next/link";
import { currentUser, effectiveMemberships } from "@/app/lib/authz";
import { db } from "@/app/lib/db";
import { formatEur } from "@/app/lib/dues";
import { invoicePayUrl } from "@/app/lib/invoices";
import MembershipCard from "@/app/components/MembershipCard";
import PayMethodChooser from "@/app/components/PayMethodChooser";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; payError?: string }>;
}) {
  const { paid, payError } = await searchParams;
  const user = await currentUser();
  const links = user ? await effectiveMemberships(user.id) : [];

  const orgs = links.filter((l) => l.member.type === "organization");
  const individual = links.find((l) => l.member.type === "individual");

  // Back from Stripe Checkout (?paid={invoiceId}): the webhook is the source of
  // truth, so the invoice may or may not be marked paid yet (bank transfers
  // settle days later). Reflect whichever state we see.
  let paidBanner: "received" | "processing" | null = null;
  if (paid) {
    const inv = await db.invoice.findUnique({ where: { id: paid } });
    paidBanner = inv ? (inv.status === "paid" ? "received" : "processing") : null;
  }

  // Outstanding dues for orgs this user manages — pay any time from here.
  const manageableIds = orgs
    .filter(
      (l) =>
        l.role === "manager" &&
        (l.member.membership?.status === "pending" ||
          l.member.membership?.status === "past_due"),
    )
    .map((l) => l.memberId);
  const dueInvoices = manageableIds.length
    ? (
        await db.invoice.findMany({
          where: { status: "issued", membership: { memberId: { in: manageableIds } } },
          orderBy: { issuedAt: "desc" },
          include: { membership: { include: { member: true } } },
        })
      ).filter((inv) => !(paidBanner === "processing" && inv.id === paid))
    : [];

  // Active manager / representative counts per org, to decide which menu actions
  // are offered (the actions re-check server-side before mutating).
  const orgIds = orgs.map((l) => l.memberId);
  const accessCounts = orgIds.length
    ? await db.memberAccess.groupBy({
        by: ["memberId", "role"],
        where: { memberId: { in: orgIds }, status: { not: "removed" } },
        _count: { _all: true },
      })
    : [];
  const countOf = (memberId: string, role: "manager" | "representative") =>
    accessCounts.find((c) => c.memberId === memberId && c.role === role)?._count._all ?? 0;

  return (
    <>
      {/* Hero */}
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Account</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">
            Your account
          </h1>
          <div className="accent-line mt-6" />
          <p className="mt-8 text-lg text-muted max-w-2xl leading-relaxed">
            {user?.name || user?.email ? (
              <>
                Signed in as{" "}
                <strong className="text-ink">{user.name ?? user.email}</strong>.{" "}
              </>
            ) : null}
            Your memberships and the organizations you act for, in one place.
          </p>
        </div>
      </section>

      {(paidBanner || payError || dueInvoices.length > 0) && (
        <section className="border-b border-rule">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid gap-4">
            {paidBanner === "received" && (
              <div className="card max-w-2xl border-l-4 border-l-emerald-600">
                <h3>Payment received</h3>
                <p className="text-sm text-muted leading-relaxed">
                  Thank you — your membership is active. A receipt is on its way
                  to your inbox.
                </p>
              </div>
            )}
            {paidBanner === "processing" && (
              <div className="card max-w-2xl border-l-4 border-l-purple">
                <h3>Payment in progress</h3>
                <p className="text-sm text-muted leading-relaxed">
                  Bank transfers can take 1–2 business days to settle. Your
                  membership activates automatically, and we&rsquo;ll email a
                  receipt as soon as the payment lands.
                </p>
              </div>
            )}
            {payError && (
              <div className="card max-w-2xl border-l-4 border-l-red-600">
                <h3>Payment unavailable</h3>
                <p className="text-sm text-muted leading-relaxed">
                  We couldn&rsquo;t start the online payment. Please try again in
                  a moment, or settle by bank transfer using the details in your
                  invoice email.
                </p>
              </div>
            )}
            {dueInvoices.map((inv) => (
              <div key={inv.id} className="card max-w-2xl">
                <h3>Dues pending — {inv.membership.member.legalName}</h3>
                <p className="text-sm text-muted">
                  Invoice {inv.number} · {formatEur(inv.grossAmount)}
                  {inv.dueDate
                    ? ` · due ${inv.dueDate.toISOString().slice(0, 10)}`
                    : ""}
                </p>
                <PayMethodChooser
                  payUrl={invoicePayUrl(inv.id)}
                  bankDetails={process.env.BANK_TRANSFER_DETAILS ?? null}
                  invoiceNumber={inv.number}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {links.length === 0 ? (
        <section>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="card max-w-2xl">
              <h3>No membership yet</h3>
              <p className="text-sm text-muted leading-relaxed">
                You&rsquo;re not part of any membership yet. Ask your
                organization&rsquo;s admin to add your email, or{" "}
                <Link href="/apply" className="text-purple hover:underline">
                  apply to join the Foundation →
                </Link>
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          {individual && (
            <section className="border-b border-rule">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <p className="tag mb-3">Individual membership</p>
                <h2 className="display text-3xl">Your membership</h2>
                <div className="accent-line mt-4 mb-8" />
                <div className="max-w-md">
                  <MembershipCard
                    name={individual.member.legalName}
                    type="individual"
                    membershipClass={individual.member.membership?.class}
                    status={individual.member.membership?.status}
                    country={individual.member.countryOfResidence}
                    periodEnd={individual.member.membership?.periodEnd}
                    agreementHref={`/account/agreement/${individual.memberId}`}
                    menu={{ memberId: individual.memberId, canCancel: true }}
                  />
                </div>
              </div>
            </section>
          )}

          {orgs.length > 0 && (
            <section>
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <p className="tag mb-3">Organizations</p>
                <h2 className="display text-3xl">Organizations you belong to</h2>
                <div className="accent-line mt-4 mb-10" />
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {orgs.map((l) => (
                    <MembershipCard
                      key={l.id}
                      name={l.member.legalName}
                      type="organization"
                      membershipClass={l.member.membership?.class}
                      status={l.member.membership?.status}
                      role={l.role}
                      country={l.member.jurisdiction}
                      periodEnd={l.member.membership?.periodEnd}
                      agreementHref={
                        // Only managers (incl. the signer) may download the
                        // signed agreement — not representatives.
                        l.role === "manager"
                          ? `/account/agreement/${l.memberId}`
                          : null
                      }
                      menu={(() => {
                        const isManager = l.role === "manager";
                        const mgr = countOf(l.memberId, "manager");
                        const rep = countOf(l.memberId, "representative");
                        return {
                          memberId: l.memberId,
                          manageHref: isManager ? `/account/org/${l.memberId}/access` : null,
                          billingHref: isManager ? `/account/org/${l.memberId}/billing` : null,
                          // Managers may leave only if another manager remains;
                          // representatives may always leave.
                          canLeave: isManager ? mgr > 1 : true,
                          // Only the sole manager with no representatives can cancel.
                          canCancel: isManager && mgr === 1 && rep === 0,
                        };
                      })()}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
