import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, isAdmin } from "@/app/lib/authz";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await currentUser();
  // Hide existence from non-admins (defence in depth on top of middleware).
  if (!user || !(await isAdmin(user.email))) notFound();

  return (
    <div className="prose-body">
      <h1 className="display text-3xl">Admin</h1>
      <ul className="mt-6 grid gap-2">
        <li>
          <Link href="/admin/members" className="hover:underline">
            Members
          </Link>
        </li>
        <li>
          <Link href="/admin/working-groups" className="hover:underline">
            Working groups
          </Link>
        </li>
        <li>
          <Link href="/admin/admins" className="hover:underline">
            Admins
          </Link>
        </li>
        <li>
          <Link href="/admin/settings" className="hover:underline">
            Settings (Membership Agreement)
          </Link>
        </li>
        <li>
          <Link href="/admin/audit" className="hover:underline">
            Audit log
          </Link>
        </li>
      </ul>
      <p className="text-muted mt-4 text-sm">
        Invoices land with Associate (paid) membership in Phase 3.
      </p>
    </div>
  );
}
