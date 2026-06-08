import type { Metadata } from "next";
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
      <p className="text-muted mt-4">
        Foundation admin area. Members, invoices, working groups, settings and the
        audit log land in later phases.
      </p>
    </div>
  );
}
