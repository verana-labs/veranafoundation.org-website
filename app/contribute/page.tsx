import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contribute",
  description:
    "Participate in the Verana Foundation's open working groups and contribute to the specifications and software. Working-group participation requires Foundation membership (Associate or Contributor).",
};

const WORKING_GROUPS = [
  {
    name: "Specification WG",
    desc: "Authors and maintains the Verifiable Trust and Verifiable Public Registry specifications.",
    href: "https://github.com/verana-labs",
    requires: "Associate or Contributor",
    associateOnly: false,
  },
  {
    name: "Reference Implementations WG",
    desc: "Maintains the open-source software: Verifiable Public Registry, Indexer, VS-Agent, Frontend.",
    href: "https://github.com/verana-labs",
    requires: "Associate or Contributor",
    associateOnly: false,
  },
  {
    name: "Interop WG",
    desc: "Cross-implementation interoperability testing and conformance.",
    href: "https://github.com/verana-labs",
    requires: "Associate or Contributor",
    associateOnly: false,
  },
  {
    name: "Business Cases WG",
    desc: "Use cases, business models, and adoption patterns for the open trust layer.",
    href: "https://github.com/verana-labs",
    requires: "Associate only",
    associateOnly: true,
  },
];

export default function ContributePage() {
  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Contribute</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">
            Build the open trust layer with us
          </h1>
          <div className="accent-line mt-6" />
          <p className="mt-8 text-lg text-muted max-w-2xl leading-relaxed">
            The specifications and software are developed in the open. Here is
            how to take part — and where membership is required.
          </p>
        </div>
      </section>

      {/* Membership-required notice */}
      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="card border-l-[3px]" style={{ borderLeftColor: "var(--color-purple)" }}>
            <h2 className="display text-xl">
              Working-group participation requires membership
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              Joining a working group requires Foundation membership. Most are open
              to <strong className="text-ink">Associate</strong> or{" "}
              <strong className="text-ink">Contributor</strong> members; the{" "}
              <strong className="text-ink">Business Cases WG</strong> requires{" "}
              <strong className="text-ink">Associate</strong> membership.{" "}
              <Link href="/join" className="text-purple hover:underline">
                Compare &amp; join →
              </Link>{" "}
              Anyone may still use, fork, read, and file issues against the public
              open-source code and specifications; working-group participation and
              formal contributions are members-only.
            </p>
          </div>
        </div>
      </section>

      {/* Working groups */}
      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-3">Working groups</p>
          <h2 className="display text-3xl">Where the work happens</h2>
          <div className="accent-line mt-4 mb-10" />
          <div className="space-y-4">
            {WORKING_GROUPS.map((wg) => (
              <a
                key={wg.name}
                href={wg.href}
                rel="noopener"
                className="wg-tile block hover:no-underline"
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="display text-lg text-ink">{wg.name}</p>
                  <span
                    className={`badge flex-shrink-0 ${
                      wg.associateOnly ? "badge-purple" : ""
                    }`}
                  >
                    {wg.requires}
                  </span>
                </div>
                <p className="text-sm text-muted mt-1">{wg.desc}</p>
              </a>
            ))}
          </div>
          <p className="text-xs text-muted mt-4">
            Meeting cadence and charters published per working group
            (pre-incorporation: details to follow).
          </p>
        </div>
      </section>

      {/* Ways to contribute */}
      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="card">
              <span className="badge">no membership needed</span>
              <h3>Use the open-source software</h3>
              <p className="text-sm text-muted leading-relaxed">
                Public repos, issue trackers, and releases. Apache 2.0
                (AGPL-3.0 for the Verifiable Public Registry); copyright held by
                contributors.
              </p>
              <a
                href="https://github.com/verana-labs"
                rel="noopener"
                className="text-sm text-purple hover:underline mt-auto self-end"
              >
                github.com/verana-labs ↗
              </a>
            </div>
            <div className="card">
              <span className="badge">no membership needed</span>
              <h3>Implement the specifications</h3>
              <p className="text-sm text-muted leading-relaxed">
                Build to Verifiable Trust and VPR. Both specs are published for
                implementers.
              </p>
              <a
                href="https://verana-labs.github.io/verifiable-trust-spec/"
                rel="noopener"
                className="text-sm text-purple hover:underline mt-auto self-end"
              >
                Read the specs ↗
              </a>
            </div>
            <div className="card">
              <span className="badge badge-green">members</span>
              <h3>Join to contribute</h3>
              <p className="text-sm text-muted leading-relaxed">
                Participate in a working group and submit formal contributions.
                Recurring technical work joins as a{" "}
                <strong className="text-ink">Contributor Member</strong> (free).
              </p>
              <Link
                href="/join"
                className="text-sm text-purple hover:underline mt-auto self-end"
              >
                Join the Foundation →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Build on Verana */}
      <section className="reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="card">
            <h3>Building an app or agent on Verana?</h3>
            <p className="text-sm text-muted leading-relaxed">
              The Foundation stewards the standards; the builder docs live
              elsewhere. Start at{" "}
              <a href="https://verana.io" rel="noopener" className="text-purple hover:underline">
                verana.io
              </a>{" "}
              and{" "}
              <a href="https://docs.verana.io" rel="noopener" className="text-purple hover:underline">
                docs.verana.io
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
