import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { PageHero, Section } from "@/app/components/PageHero";
import AdminAllowlist from "./AdminAllowlist";

export const metadata: Metadata = { title: "Admins · Admin" };

export default async function AdminAdminsPage() {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) notFound();

  const entries = await db.adminAllowlistEntry.findMany({
    orderBy: { addedAt: "asc" },
  });

  return (
    <>
      <PageHero
        back={{ href: "/admin", label: "Admin" }}
        title="Admins"
        lead="Anyone whose verified email is on this list has full Foundation-admin access. This is the only grant of admin rights."
      />
      <Section bordered={false}>
        <AdminAllowlist entries={entries.map((e) => ({ id: e.id, email: e.email }))} />
      </Section>
    </>
  );
}
