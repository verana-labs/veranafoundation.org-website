import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isManagerOf } from "@/app/lib/authz";
import { PageHero, Section } from "@/app/components/PageHero";
import MembershipCard from "@/app/components/MembershipCard";

export const metadata: Metadata = { title: "Organization" };

export default async function OrgPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  const user = await currentUser();
  if (!user?.id || !(await isManagerOf(user.id, memberId))) notFound();

  const member = await db.member.findUnique({
    where: { id: memberId },
    include: { memberships: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!member) notFound();
  const membership = member.memberships[0];

  return (
    <>
      <PageHero back={{ href: "/account", label: "Account" }} title={member.legalName} />
      <Section bordered={false}>
      <div className="max-w-md">
        <MembershipCard
          name={member.legalName}
          type="organization"
          membershipClass={membership?.class}
          status={membership?.status}
          country={member.jurisdiction}
          periodEnd={membership?.periodEnd}
        />
      </div>

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted">Address</dt>
        <dd>{member.registeredAddress ?? "—"}</dd>
        <dt className="text-muted">VAT</dt>
        <dd>{member.vatNumber ?? "—"}</dd>
      </dl>

      <p className="text-xs text-muted mt-4">
        Organization details are read-only here. Contact the Foundation to
        change them.
      </p>

      <div className="mt-8 flex gap-3">
        <Link href={`/account/org/${memberId}/access`} className="btn btn-primary">
          Manage Members
        </Link>
        <Link href={`/account/org/${memberId}/billing`} className="btn">
          Billing
        </Link>
      </div>
      </Section>
    </>
  );
}
