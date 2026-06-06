import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Join",
  description:
    "Join the Verana Foundation. Two membership classes: Associate Member (supporters; dues by org size) and Contributor Member (technical contributors via working groups; €0). Compare and apply.",
};

const ROWS: { label: string; assoc: string; contrib: string }[] = [
  {
    label: "Who it's for",
    assoc:
      "Organizations that support and align with the mission — strategic engagement, advisory input, ecosystem development, research, public-interest participation. Non-technical.",
    contrib:
      "Organizations contributing technical & standards work — software, specifications, credential schemas, registry artifacts, documentation — on a recurring or substantial basis.",
  },
  {
    label: "How you participate",
    assoc:
      "Attend meetings; non-voting consultation & comment periods; may join working groups (no obligation to contribute code); access to certain non-public materials; eligible for programs, pilots & research partnerships; public recognition.",
    contrib:
      "Join & contribute to any working group; propose new WGs; submit contributions to repos, specs & schemas; review and propose changes; access non-public repos & drafts.",
  },
  {
    label: "Obligations",
    assoc:
      "Code of Conduct; cooperative posture; respect IP, licensing & confidentiality. Technical contributions optional.",
    contrib:
      "Materially greater: follow coding/schema standards & WG procedures; license all contributions per the IP rules (Apache 2.0 / MIT / AGPL for code; W3C Royalty-Free for specs; CC0 / CC-BY-4.0 for schemas); disclose essential patents.",
  },
  {
    label: "Annual dues",
    assoc:
      "Sliding scale by org size: €1,500 (1–10 employees) up to €50,000 (10,001+). Non-refundable; hardship & non-profit/government adjustments at the Foundation's discretion.",
    contrib: "€0 — free.",
  },
  {
    label: "Governance",
    assoc:
      "None — no voting, governance, validator, or financial rights; no path to the Council.",
    contrib: "None — same as Associate.",
  },
];

export default function JoinPage() {
  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Join</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">
            Two ways to join the Foundation
          </h1>
          <div className="accent-line mt-6" />
          <p className="mt-8 text-lg text-muted max-w-3xl leading-relaxed">
            Pick the class that matches how your organization participates.{" "}
            <strong className="text-ink">
              Membership (either class) is required to participate in the working
              groups
            </strong>{" "}
            that author the specs and maintain the software; using the public
            open-source code and specs needs no membership. Membership is governed
            by the Foundation Membership Agreement. Neither class confers
            governance, voting, or validator rights, and neither is a path to the{" "}
            <a href="https://veranacouncil.org" rel="noopener" className="text-purple hover:underline">
              Verana Council
            </a>
            .
          </p>
        </div>
      </section>

      {/* Comparison */}
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {/* Card headers */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="card">
              <div className="flex items-center justify-between">
                <h2 className="display text-2xl">Associate Member</h2>
                <span className="badge badge-purple">dues by org size</span>
              </div>
              <p className="text-sm text-muted">Supporters &amp; aligners.</p>
            </div>
            <div className="card">
              <div className="flex items-center justify-between">
                <h2 className="display text-2xl">Contributor Member</h2>
                <span className="badge badge-green">€0 — free</span>
              </div>
              <p className="text-sm text-muted">Technical &amp; standards contributors.</p>
            </div>
          </div>

          {/* Comparison rows */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm min-w-[640px]">
              <thead>
                <tr>
                  <th className="text-left p-3 w-40 text-muted font-medium align-bottom" />
                  <th className="text-left p-3 display text-base">Associate</th>
                  <th className="text-left p-3 display text-base">Contributor</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.label} className="border-t border-rule align-top">
                    <th className="text-left p-3 font-medium text-ink">
                      {r.label}
                    </th>
                    <td className="p-3 text-muted leading-relaxed">{r.assoc}</td>
                    <td className="p-3 text-muted leading-relaxed">
                      {r.contrib}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-muted mt-6 max-w-3xl">
            Admission becomes effective on the Foundation&rsquo;s incorporation
            and ratification of the agreement (it is in formation, stewarded by
            2060 OÜ); the binding IP, confidentiality, fee, and conduct terms
            apply on signature.
          </p>
        </div>
      </section>

      {/* Become a member */}
      <section>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="card">
            <h2 className="display text-2xl">Become a member</h2>
            <p className="text-sm text-muted leading-relaxed max-w-2xl">
              Tell us which class fits and a little about your organization.
              Submissions are confidential pre-incorporation; the formal
              onboarding process follows once the Foundation is incorporated.
            </p>
            <div className="mt-2 flex flex-wrap gap-4">
              <Link
                href="/contact?topic=membership-associate"
                className="btn btn-primary"
              >
                Apply as Associate
              </Link>
              <Link
                href="/contact?topic=membership-contributor"
                className="btn btn-green"
              >
                Apply as Contributor
              </Link>
            </div>
            <p className="text-sm text-muted mt-4">
              Questions? Use the{" "}
              <Link href="/contact" className="text-purple hover:underline">
                contact form
              </Link>{" "}
              (inquiry type <em>Membership</em>). We do not publish email
              addresses.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
