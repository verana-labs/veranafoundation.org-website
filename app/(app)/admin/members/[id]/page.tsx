import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { suspendMembership, reinstateMembership } from "./actions";

export const metadata: Metadata = { title: "Member · Admin" };

export default async function AdminMemberDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) notFound();

  const { id } = await params;
  const member = await db.member.findUnique({
    where: { id },
    include: {
      memberships: { orderBy: { createdAt: "desc" } },
      access: { where: { status: { not: "removed" } }, orderBy: { addedAt: "asc" } },
      signatureRecords: { orderBy: { signedAt: "desc" } },
    },
  });
  if (!member) notFound();

  return (
    <div className="prose-body max-w-3xl">
      <p className="text-sm text-muted">
        <Link href="/admin/members">← Members</Link>
      </p>
      <h1 className="display text-3xl">{member.legalName}</h1>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted">Type</dt>
        <dd>{member.type}</dd>
        <dt className="text-muted">Primary email</dt>
        <dd>{member.primaryEmail}</dd>
        <dt className="text-muted">Jurisdiction</dt>
        <dd>{member.jurisdiction ?? "—"}</dd>
        <dt className="text-muted">VAT</dt>
        <dd>{member.vatNumber ?? "—"}</dd>
      </dl>

      <h2 className="display text-xl mt-8">Memberships</h2>
      <ul className="mt-2 grid gap-2">
        {member.memberships.map((ms) => (
          <li key={ms.id} className="card flex items-center justify-between gap-3">
            <span className="text-sm">
              {ms.class} · {ms.status}
              {ms.provisional && <span className="badge ml-2">provisional</span>}
            </span>
            <form
              action={ms.status === "suspended" ? reinstateMembership : suspendMembership}
            >
              <input type="hidden" name="membershipId" value={ms.id} />
              <input type="hidden" name="memberId" value={member.id} />
              <button type="submit" className="btn text-xs">
                {ms.status === "suspended" ? "Reinstate" : "Suspend"}
              </button>
            </form>
          </li>
        ))}
      </ul>

      <h2 className="display text-xl mt-8">Access list</h2>
      <ul className="mt-2 grid gap-1 text-sm">
        {member.access.map((a) => (
          <li key={a.id}>
            {a.email} — {a.role}
            {a.status === "invited" && <span className="badge ml-2">invited</span>}
          </li>
        ))}
        {member.access.length === 0 && <li className="text-muted">None.</li>}
      </ul>

      <h2 className="display text-xl mt-8">Signatures</h2>
      <ul className="mt-2 grid gap-1 text-sm">
        {member.signatureRecords.map((s) => (
          <li key={s.id}>
            {s.signerName} signed <strong>{s.agreementVersion}</strong> on{" "}
            {s.signedAt.toISOString().slice(0, 10)}
          </li>
        ))}
        {member.signatureRecords.length === 0 && (
          <li className="text-muted">None.</li>
        )}
      </ul>
    </div>
  );
}
