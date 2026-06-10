import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { PageHero, Section } from "@/app/components/PageHero";

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
    include: {
      membership: true,
      // Whether a signed agreement PDF exists, for the download link.
      signatureRecords: {
        where: { agreementPdfPath: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHero back={{ href: "/admin", label: "Admin" }} title="Members" />
      <Section bordered={false}>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or email"
            className="field w-64"
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
                <th className="p-2">Signed Agreement</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const ms = m.membership;
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
                    <td className="p-2">
                      {m.signatureRecords.length > 0 ? (
                        <a
                          href={`/account/agreement/${m.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple hover:underline"
                        >
                          PDF ↓
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Section>
    </>
  );
}
