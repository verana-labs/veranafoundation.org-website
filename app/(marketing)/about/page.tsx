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
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">About</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight">
            The non-profit steward of the open trust layer
          </h1>
          <div className="accent-line mt-6" />
        </div>
      </section>

      <article className="prose-body max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2>Mission</h2>
        <p>
          The Verana Foundation is a non-profit dedicated to rebuilding digital
          trust in an era of agentic AI, identity theft, misinformation, and
          opaque governance. It stewards open standards and decentralized
          infrastructure for secure, verifiable, interoperable, and
          privacy-respecting communication between people, services, and AI
          agents.
        </p>

        <h2>What we steward</h2>
        <p>
          The Foundation is the custodian of the ecosystem&rsquo;s shared,
          off-network assets:
        </p>
        <ul>
          <li>
            <strong>Specifications</strong> — the Foundation{" "}
            <strong>owns and hosts</strong> the two specifications, authored in
            the open (2060 is lead author):{" "}
            <a
              href="https://verana-labs.github.io/verifiable-trust-spec/"
              rel="noopener"
            >
              Verifiable Trust
            </a>{" "}
            and{" "}
            <a
              href="https://verana-labs.github.io/verifiable-trust-vpr-spec/"
              rel="noopener"
            >
              Verifiable Public Registry (VPR)
            </a>
            . Both are licensed{" "}
            <strong>Creative Commons Attribution-ShareAlike 4.0</strong>{" "}
            (CC BY-SA 4.0).
          </li>
          <li>
            <strong>Open-source software</strong> — the Foundation{" "}
            <strong>hosts, stewards and maintains</strong> the reference
            implementations, released as open source; copyright is held by the
            contributors, so the Foundation stewards rather than owns the code.
            See{" "}
            <a href="https://github.com/verana-labs" rel="noopener">
              github.com/verana-labs
            </a>
            .
          </li>
          <li>
            <strong>VNA token</strong> — the Foundation, via the Verana BVI Token
            Issuer, issues and administers the VNA token, the protocol&rsquo;s
            native utility token, <strong>which it does not own</strong>.
          </li>
        </ul>

        <h2>Status</h2>
        <p>
          The Foundation is a non-profit structured so that no single party can
          capture it. It is <strong>in formation</strong>;{" "}
          <a href="https://2060.io" rel="noopener">
            2060 OÜ
          </a>{" "}
          acts as its organizer and steward pre-incorporation. The final entity map and
          jurisdiction are being confirmed.
        </p>

        <h2>Membership</h2>
        <p>
          There are two membership classes — <strong>Associate Member</strong>{" "}
          and <strong>Contributor Member</strong> — the latter open to both
          organizations and individuals. Founding members are 2060 OÜ, Mobiera,
          and Orchestrating Identity.{" "}
          <Link href="/join">Compare membership and join →</Link> To participate
          in the working groups, see{" "}
          <Link href="/working-groups">Working Groups</Link>.
        </p>

        <h2>What the Foundation is not</h2>
        <ul>
          <li>
            Not the network&rsquo;s governance or security body — that is the{" "}
            <a href="https://veranacouncil.org" rel="noopener">
              Verana Council
            </a>
            .
          </li>
          <li>It does not run validator nodes.</li>
          <li>It does not own the VNA token.</li>
          <li>It does not hold commercial customer contracts.</li>
          <li>It is not a product vendor.</li>
        </ul>
      </article>
    </>
  );
}
