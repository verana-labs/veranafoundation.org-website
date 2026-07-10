import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description:
    "The Verana Foundation is a non-profit that owns the Verifiable Trust and VPR specifications, stewards the open-source software, grows the ecosystem, and issues the VNA utility token it does not own. In formation, stewarded by 2060 OÜ.",
};

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">About</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">
            The non-profit steward of the open trust layer
          </h1>
          <div className="accent-line mt-6" />
          <p className="mt-8 text-lg text-muted max-w-2xl leading-relaxed">
            The Verana Foundation is a non-profit dedicated to rebuilding
            digital trust in an era of agentic AI, identity theft,
            misinformation, and opaque governance. It stewards open standards
            and decentralized infrastructure for secure, verifiable,
            interoperable, and privacy-respecting communication between people,
            services, and AI agents.
          </p>
        </div>
      </section>

      {/* What we steward */}
      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-3">What we steward</p>
          <h2 className="display text-3xl">
            The ecosystem&rsquo;s shared, off-network assets
          </h2>
          <div className="accent-line mt-4 mb-10" />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="card">
              <span className="badge badge-purple self-start">
                CC BY-SA 4.0
              </span>
              <h3>Specifications</h3>
              <p className="text-sm text-muted leading-relaxed">
                The Foundation <strong className="text-ink">owns and hosts</strong>{" "}
                the two specifications, authored in the open (2060 is lead
                author). Both are licensed Creative Commons
                Attribution-ShareAlike 4.0.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <a
                  href="https://verana-labs.github.io/verifiable-trust-spec/"
                  rel="noopener"
                  className="text-purple hover:underline"
                >
                  Verifiable Trust ↗
                </a>
                <a
                  href="https://verana-labs.github.io/verifiable-trust-vpr-spec/"
                  rel="noopener"
                  className="text-purple hover:underline"
                >
                  Verifiable Public Registry (VPR) ↗
                </a>
              </div>
            </div>
            <div className="card">
              <span className="badge badge-green self-start">open source</span>
              <h3>Open-source software</h3>
              <p className="text-sm text-muted leading-relaxed">
                The Foundation{" "}
                <strong className="text-ink">
                  hosts, stewards and maintains
                </strong>{" "}
                the reference implementations, released as open source;
                copyright is held by the contributors, so the Foundation
                stewards rather than owns the code.
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
              <span className="badge self-start">utility token</span>
              <h3>VNA token</h3>
              <p className="text-sm text-muted leading-relaxed">
                The Foundation, via the Verana BVI Token Issuer, issues and
                administers the VNA token, the protocol&rsquo;s native utility
                token, <strong className="text-ink">which it does not own</strong>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Status & membership */}
      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid md:grid-cols-2 gap-6">
          <div className="card">
            <span className="badge self-start">in formation</span>
            <h3>Status</h3>
            <p className="text-sm text-muted leading-relaxed">
              The Foundation is a non-profit structured so that no single party
              can capture it. It is{" "}
              <strong className="text-ink">in formation</strong>;{" "}
              <a
                href="https://2060.io"
                rel="noopener"
                className="text-purple hover:underline"
              >
                2060 OÜ
              </a>{" "}
              acts as its organizer and steward pre-incorporation. The final
              entity map and jurisdiction are being confirmed.
            </p>
          </div>
          <div className="card">
            <span className="badge badge-green self-start">two classes</span>
            <h3>Membership</h3>
            <p className="text-sm text-muted leading-relaxed">
              There are two membership classes —{" "}
              <strong className="text-ink">Associate Member</strong> and{" "}
              <strong className="text-ink">Contributor Member</strong> — the
              latter open to both organizations and individuals. Founding
              members are 2060 OÜ, Mobiera, and Orchestrating Identity. To
              participate in the working groups, see{" "}
              <Link
                href="/working-groups"
                className="text-purple hover:underline"
              >
                Working Groups
              </Link>
              .
            </p>
            <Link
              href="/join"
              className="text-sm text-purple hover:underline mt-auto self-end"
            >
              Compare membership and join →
            </Link>
          </div>
        </div>
      </section>

      {/* What the Foundation is not */}
      <section className="reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div
            className="card border-l-[3px]"
            style={{ borderLeftColor: "var(--color-purple)" }}
          >
            <h3>What the Foundation is not</h3>
            <ul className="text-sm text-muted leading-relaxed list-disc pl-5 space-y-1">
              <li>
                Not the network&rsquo;s governance or security body — that is
                the{" "}
                <a
                  href="https://veranacouncil.org"
                  rel="noopener"
                  className="text-purple hover:underline"
                >
                  Verana Council
                </a>
                .
              </li>
              <li>It does not run validator nodes.</li>
              <li>It does not own the VNA token.</li>
              <li>It does not hold commercial customer contracts.</li>
              <li>It is not a product vendor.</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
