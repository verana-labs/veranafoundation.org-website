import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms of use for veranafoundation.org, the institutional website of the Verana Foundation (in formation).",
};

export default function TermsPage() {
  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-4">Legal</p>
          <h1 className="display text-4xl sm:text-5xl">Terms of Use</h1>
          <div className="accent-line mt-6" />
          <p className="text-xs tracking-wider uppercase text-muted mt-8">
            <strong className="text-ink">Last updated.</strong> 2026-06-06
          </p>
        </div>
      </section>

      <article className="prose-body max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <p>
          This website (<strong>veranafoundation.org</strong>) is the
          institutional site of the <strong>Verana Foundation (in formation)</strong>,
          represented by 2060 OÜ pre-incorporation. It is provided for
          informational purposes.
        </p>

        <h2>No offer or advice</h2>
        <p>
          Nothing on this site is an offer, solicitation, or investment advice
          regarding the VNA token or any equity. The VNA token is a utility token
          of a decentralized protocol; the Foundation issues and administers it
          but does not own it. Membership, grants, and token economics are
          governed by their respective agreements and specifications, not by this
          site.
        </p>

        <h2>Open-source software &amp; specifications</h2>
        <p>
          The reference software is licensed under Apache 2.0 (copyright held by
          contributors); the specifications are published under their own terms.
          Your use of those artifacts is governed by their respective licenses,
          available in their repositories, not by these terms.
        </p>

        <h2>Content license</h2>
        <p>
          Unless otherwise noted, text on this site is licensed{" "}
          <strong>CC-BY-SA 4.0</strong> and brand assets <strong>CC-BY 4.0</strong>.
        </p>

        <h2>No warranty</h2>
        <p>
          The site is provided &ldquo;as is&rdquo;, without warranties of any
          kind to the fullest extent permitted by law. Links to third-party sites
          are provided for convenience and are not endorsements.
        </p>

        <h2>Changes</h2>
        <p>
          These terms may be updated as the Foundation is incorporated. The{" "}
          <em>Last updated</em> date reflects the most recent change.
        </p>
      </article>
    </>
  );
}
