import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/app/lib/db";
import { flagEmoji, countryName } from "@/app/lib/countries";

export const metadata: Metadata = {
  title: "Members",
  description:
    "The organizations and people behind the Verana Foundation: Associate members supporting the open trust layer, and the Contributors building it.",
};

// Member data lives in the DB and is admin-curated (Membership.listed);
// always render fresh — the admin toggle revalidates this path.
export const dynamic = "force-dynamic";

/** Memberships shown publicly: admin-listed and in good standing. */
const SHOWN = ["active", "past_due"] as const;

export default async function MembersPage() {
  const [associates, contributors] = await Promise.all([
    db.member.findMany({
      where: {
        membership: {
          class: "associate",
          listed: true,
          status: { in: [...SHOWN] },
        },
        // Associates appear with their logo — which requires their consent.
        logoDisplayConsent: true,
      },
      include: { membership: { select: { periodStart: true } } },
    }),
    db.member.findMany({
      where: {
        membership: {
          class: "contributor",
          listed: true,
          status: { in: [...SHOWN] },
        },
      },
      include: { membership: { select: { periodStart: true } } },
    }),
  ]);

  const byMembershipDate = (
    a: { membership: { periodStart: Date | null } | null; createdAt: Date },
    b: { membership: { periodStart: Date | null } | null; createdAt: Date },
  ) =>
    (a.membership?.periodStart ?? a.createdAt).getTime() -
    (b.membership?.periodStart ?? b.createdAt).getTime();
  associates.sort(byMembershipDate);
  contributors.sort(byMembershipDate);

  return (
    <>
      {/* Hero */}
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Members</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">
            The organizations and people behind Verana
          </h1>
          <div className="accent-line mt-6" />
          <p className="mt-8 text-lg text-muted max-w-2xl leading-relaxed">
            Associate members fund and govern the open trust layer; Contributors
            build it. Together they keep verifiable trust a public utility — not
            a product.
          </p>
        </div>
      </section>

      {/* Associates */}
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-3">Associate members</p>
          <h2 className="display text-3xl">Supporting organizations</h2>
          <div className="accent-line mt-4 mb-10" />
          {associates.length === 0 ? (
            <p className="text-muted">
              Associate members will appear here.{" "}
              <Link href="/join" className="text-purple hover:underline">
                Become the first →
              </Link>
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
              {associates.map((m) => (
                <div
                  key={m.id}
                  className="logo-wall-item"
                  title={m.legalName}
                  aria-label={m.legalName}
                >
                  {m.logoUri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/logo/${m.id}?v=${m.updatedAt.getTime()}`}
                      alt={`${m.legalName} logo`}
                      loading="lazy"
                    />
                  ) : (
                    // No logo uploaded yet: the name stands in for it.
                    <span className="text-sm font-semibold text-center leading-snug">
                      {m.legalName}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Contributors */}
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-3">Contributors</p>
          <h2 className="display text-3xl">Building the trust layer</h2>
          <div className="accent-line mt-4 mb-10" />
          {contributors.length === 0 ? (
            <p className="text-muted">
              Contributor members will appear here.{" "}
              <Link href="/apply" className="text-purple hover:underline">
                Join as a Contributor — it&rsquo;s free →
              </Link>
            </p>
          ) : (
            <ul className="flex flex-wrap gap-3">
              {contributors.map((m) => {
                const country = m.jurisdiction ?? m.countryOfResidence;
                const flag = flagEmoji(country);
                return (
                  <li
                    key={m.id}
                    className="inline-flex items-center gap-2 rounded-full border border-rule bg-card px-4 py-1.5 text-sm"
                    title={countryName(country) ?? undefined}
                  >
                    <span>{m.legalName}</span>
                    {flag && <span aria-hidden="true">{flag}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="card max-w-2xl">
            <p className="tag mb-3">Join them</p>
            <h3 className="display text-2xl">Your organization belongs here</h3>
            <p className="text-sm text-muted leading-relaxed mt-2">
              Contributor membership is free for individuals and organizations
              doing technical and standards work; Associate membership funds the
              Foundation and carries governance rights.
            </p>
            <Link href="/join" className="btn btn-primary w-fit mt-5">
              Become a member
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
