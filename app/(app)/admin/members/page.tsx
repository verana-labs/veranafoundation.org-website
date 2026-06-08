import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";

export const metadata: Metadata = { title: "Members · Admin" };

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) notFound();

  const { q } = await searchParams;
  const members = await db.member.findMany({
    where: q
      ? {
          OR: [
            { legalName: { contains: q, mode: "insensitive" } },
            { primaryEmail: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { memberships: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="prose-body max-w-3xl">
      <p className="text-sm text-muted">
        <Link href="/admin">← Admin</Link>
      </p>
      <h1 className="display text-3xl">Members</h1>

      <form className="mt-4 flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name or email"
          className="rounded border border-rule bg-surface px-3 py-2 text-sm w-64"
        />
        <button type="submit" className="btn">
          Search
        </button>
      </form>

      {members.length === 0 ? (
        <p className="text-muted mt-6">No members found.</p>
      ) : (
        <div className="overflow-x-auto mt-6">
          <table className="w-full border-collapse text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="p-2">Name</th>
                <th className="p-2">Type</th>
                <th className="p-2">Membership</th>
                <th className="p-2">Email</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const ms = m.memberships[0];
                return (
                  <tr key={m.id} className="border-t border-rule">
                    <td className="p-2">
                      <Link href={`/admin/members/${m.id}`} className="hover:underline">
                        {m.legalName}
                      </Link>
                    </td>
                    <td className="p-2 text-muted">{m.type}</td>
                    <td className="p-2 text-muted">
                      {ms ? `${ms.class} · ${ms.status}` : "—"}
                    </td>
                    <td className="p-2 text-muted">{m.primaryEmail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
