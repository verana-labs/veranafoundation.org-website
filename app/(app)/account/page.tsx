import type { Metadata } from "next";
import Link from "next/link";
import { currentUser, effectiveMemberships } from "@/app/lib/authz";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await currentUser();
  const links = user ? await effectiveMemberships(user.id) : [];

  const orgs = links.filter((l) => l.member.type === "organization");
  const individual = links.find((l) => l.member.type === "individual");

  return (
    <div className="prose-body">
      <h1 className="display text-3xl">Your account</h1>

      {links.length === 0 ? (
        <p className="text-muted mt-4">
          You&rsquo;re not part of any membership yet. Ask your organization&rsquo;s
          admin to add your email, or <Link href="/join">apply</Link>.
        </p>
      ) : (
        <div className="mt-6 grid gap-6">
          {individual && (
            <section>
              <h2 className="display text-xl">Your individual membership</h2>
              <p className="text-muted text-sm">
                {individual.member.legalName} —{" "}
                {individual.member.memberships[0]?.class ?? "—"} ·{" "}
                {individual.member.memberships[0]?.status ?? "—"}
              </p>
            </section>
          )}

          {orgs.length > 0 && (
            <section>
              <h2 className="display text-xl">Organizations you belong to</h2>
              <ul className="mt-2 grid gap-2">
                {orgs.map((l) => (
                  <li key={l.id} className="card">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium">{l.member.legalName}</span>
                      <span className="badge">{l.role}</span>
                    </div>
                    <p className="text-sm text-muted">
                      {l.member.memberships[0]?.class ?? "—"} ·{" "}
                      {l.member.memberships[0]?.status ?? "—"}
                      {l.role === "manager" && (
                        <>
                          {" · "}
                          <Link href={`/account/org/${l.memberId}`}>Manage</Link>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
