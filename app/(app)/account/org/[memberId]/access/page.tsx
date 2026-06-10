import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isManagerOf } from "@/app/lib/authz";
import { PageHero, Section } from "@/app/components/PageHero";
import AccessManager from "./AccessManager";

export const metadata: Metadata = { title: "Access list" };

export default async function AccessPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  const user = await currentUser();
  if (!user?.id || !(await isManagerOf(user.id, memberId))) notFound();

  const member = await db.member.findUnique({ where: { id: memberId } });
  if (!member) notFound();

  const entries = await db.memberAccess.findMany({
    where: { memberId, status: { not: "removed" } },
    orderBy: { addedAt: "asc" },
  });
  const admins = entries.filter((e) => e.role === "manager");
  const representatives = entries.filter((e) => e.role === "representative");
  const lastAdminId = admins.length === 1 ? admins[0].id : null;

  return (
    <>
      <PageHero
        back={{ href: `/account/org/${memberId}`, label: member.legalName }}
        title="Manage Participants"
        lead={
          <>
            Manage who can act for <strong>{member.legalName}</strong>. Admins
            manage this list; representatives get working-group access.
          </>
        }
      />
      <Section bordered={false}>
        <AccessManager
          memberId={memberId}
          admins={admins.map((e) => ({
            id: e.id,
            email: e.email,
            role: "manager",
            status: e.status,
          }))}
          representatives={representatives.map((e) => ({
            id: e.id,
            email: e.email,
            role: "representative",
            status: e.status,
          }))}
          lastAdminId={lastAdminId}
        />
      </Section>
    </>
  );
}
