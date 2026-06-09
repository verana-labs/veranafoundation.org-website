import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { PageHero, Section } from "@/app/components/PageHero";
import WorkingGroupsAdmin from "./WorkingGroupsAdmin";

export const metadata: Metadata = { title: "Working groups · Admin" };

export default async function AdminWorkingGroupsPage() {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) notFound();

  const groups = await db.workingGroup.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <PageHero
        back={{ href: "/admin", label: "Admin" }}
        title="Working groups"
        lead={
          <>
            Members access these by signing in; an <em>Associate-only</em> group
            requires an active Associate membership.
          </>
        }
      />
      <Section bordered={false}>
        <WorkingGroupsAdmin
          groups={groups.map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
            requiredClass: g.requiredClass,
            link: g.link,
            showOnHome: g.showOnHome,
          }))}
        />
      </Section>
    </>
  );
}
