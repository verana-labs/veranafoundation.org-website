import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { PageHero, Section } from "@/app/components/PageHero";

export const metadata: Metadata = { title: "Audit log · Admin" };

export default async function AdminAuditPage() {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) notFound();

  const actions = await db.adminAction.findMany({
    orderBy: { at: "desc" },
    take: 100,
  });

  return (
    <>
      <PageHero
        back={{ href: "/admin", label: "Admin" }}
        title="Audit log"
        lead="The 100 most recent admin actions."
      />
      <Section bordered={false}>
        {actions.length === 0 ? (
          <p className="text-muted">Nothing logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="p-2">When</th>
                <th className="p-2">Actor</th>
                <th className="p-2">Action</th>
                <th className="p-2">Target</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} className="border-t border-rule">
                  <td className="p-2 text-muted whitespace-nowrap">
                    {a.at.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="p-2 text-muted">{a.actorEmail}</td>
                  <td className="p-2">{a.action}</td>
                  <td className="p-2 text-muted">
                    {a.targetType}
                    {a.targetId ? ` · ${a.targetId.slice(0, 8)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Section>
    </>
  );
}
