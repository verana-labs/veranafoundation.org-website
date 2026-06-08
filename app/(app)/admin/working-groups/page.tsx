import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import WorkingGroupsAdmin from "./WorkingGroupsAdmin";

export const metadata: Metadata = { title: "Working groups · Admin" };

export default async function AdminWorkingGroupsPage() {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) notFound();

  const groups = await db.workingGroup.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="prose-body max-w-2xl">
      <p className="text-sm text-muted">
        <Link href="/admin">← Admin</Link>
      </p>
      <h1 className="display text-3xl">Working groups</h1>
      <p className="text-muted mt-2">
        Members access these by signing in; an <em>Associate-only</em> group
        requires an active Associate membership.
      </p>
      <div className="mt-8">
        <WorkingGroupsAdmin
          groups={groups.map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
            requiredClass: g.requiredClass,
            link: g.link,
          }))}
        />
      </div>
    </div>
  );
}
