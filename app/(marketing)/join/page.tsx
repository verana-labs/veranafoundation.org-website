import type { Metadata } from "next";
import Link from "next/link";
import { formatEur } from "@/app/lib/dues";
import { activeTiers } from "@/app/lib/fees";

export const metadata: Metadata = {
  title: "Join",
  description:
    "Join the Verana Foundation. Two membership classes: Associate Member (supporters; dues by org size) and Contributor Member (technical contributors via working groups; €0). Compare and apply.",
};

// Dues come from the fee schedule in force (the active agreement's — see
// lib/fees.ts), so this page can never quote prices the apply flow won't charge.
export const dynamic = "force-dynamic";

const ROWS: { label: string; assoc: string; contrib: string }[] = [
  {
    label: "Who it's for",
    assoc:
      "Organizations that support and align with the mission — strategic engagement, advisory input, ecosystem development, research, public-interest participation. Non-technical.",
    contrib:
      "Organizations and individuals contributing technical & standards work — software, specifications, credential schemas, registry artifacts, documentation — on a recurring or substantial basis.",
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
      "Materially greater: follow coding/schema standards & WG procedures; license all contributions per the IP rules (open-source licenses for code, e.g. Apache 2.0 / MIT / AGPL; CC BY-SA 4.0 plus a W3C Royalty-Free patent commitment for specs; CC0 / CC-BY-4.0 for schemas); disclose essential patents.",
  },
  // "Annual dues" is built per request from the active fee schedule — see
  // duesRow() in the page component.
  {
    label: "Governance",
    assoc:
      "None — no voting, governance, validator, or financial rights; no path to the Council.",
    contrib: "None — same as Associate.",
  },
];

async function duesRow(): Promise<(typeof ROWS)[number]> {
  const tiers = await activeTiers();
  const lowest = tiers[0];
  const highest = tiers[tiers.length - 1];
  return {
    label: "Annual dues",
    assoc:
      lowest && highest
        ? `Sliding scale by org size: ${formatEur(lowest.amount)} (${lowest.label}) up to ${formatEur(highest.amount)} (${highest.label}). Non-refundable; hardship & non-profit/government adjustments at the Foundation's discretion.`
        : "Sliding scale by organization size — see the application form. Non-refundable; hardship & non-profit/government adjustments at the Foundation's discretion.",
    contrib: "free.",
  };
}

export default async function JoinPage() {
  const rows = [...ROWS];
  rows.splice(3, 0, await duesRow()); // after "Obligations", before "Governance"
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
            Pick the class that matches how you or your organization
            participates.{" "}
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
                <span className="badge badge-green">free</span>
              </div>
              <p className="text-sm text-muted">
                Technical &amp; standards contributors — organizations or individuals.
              </p>
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
                {rows.map((r) => (
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

          
        </div>
      </section>

      {/* Become a member */}
      <section>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="card">
            <h2 className="display text-2xl">Become a member</h2>
            <p className="text-sm text-muted leading-relaxed max-w-2xl">
              Sign in and apply online: review and sign the Membership Agreement,
              and you can start participating in the working groups now, while the
              Foundation is in formation. Full membership rights vest once it is
              incorporated and ratifies the agreement.
            </p>
            <div className="mt-2 flex flex-wrap gap-4">
              <Link href="/apply?class=associate" className="btn btn-primary">
                Apply as Associate
              </Link>
              <Link href="/apply?class=contributor" className="btn btn-green">
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
