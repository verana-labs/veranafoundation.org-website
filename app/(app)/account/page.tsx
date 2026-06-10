import type { Metadata } from "next";
import Link from "next/link";
import { currentUser, effectiveMemberships } from "@/app/lib/authz";
import { db } from "@/app/lib/db";
import MembershipCard from "@/app/components/MembershipCard";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await currentUser();
  const links = user ? await effectiveMemberships(user.id) : [];

  const orgs = links.filter((l) => l.member.type === "organization");
  const individual = links.find((l) => l.member.type === "individual");

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
                    membershipClass={individual.member.memberships[0]?.class}
                    status={individual.member.memberships[0]?.status}
                    country={individual.member.countryOfResidence}
                    periodEnd={individual.member.memberships[0]?.periodEnd}
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
                      membershipClass={l.member.memberships[0]?.class}
                      status={l.member.memberships[0]?.status}
                      role={l.role}
                      country={l.member.jurisdiction}
                      periodEnd={l.member.memberships[0]?.periodEnd}
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
