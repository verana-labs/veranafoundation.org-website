import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import AdminAllowlist from "./AdminAllowlist";

export const metadata: Metadata = { title: "Admins · Admin" };

export default async function AdminAdminsPage() {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) notFound();

  const entries = await db.adminAllowlistEntry.findMany({
    orderBy: { addedAt: "asc" },
  });

  return (
    <div className="prose-body max-w-2xl">
      <p className="text-sm text-muted">
        <Link href="/admin">← Admin</Link>
      </p>
      <h1 className="display text-3xl">Admins</h1>
      <p className="text-muted mt-2">
        Anyone whose verified email is on this list has full Foundation-admin
        access. This is the only grant of admin rights.
      </p>
      <div className="mt-6">
        <AdminAllowlist entries={entries.map((e) => ({ id: e.id, email: e.email }))} />
      </div>
    </div>
  );
}
