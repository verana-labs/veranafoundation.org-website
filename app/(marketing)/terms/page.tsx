import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms of use for veranafoundation.org — the Verana Foundation's website, member accounts, membership application, and billing services.",
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
            <strong className="text-ink">Last updated.</strong> 2026-06-11
          </p>
        </div>
      </section>

      <article className="prose-body max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <p>
          This website (<strong>veranafoundation.org</strong>) is operated by
          the <strong>Verana Foundation (in formation)</strong>, represented by{" "}
          <strong>2060 OÜ</strong> pre-incorporation. Beyond institutional
          information, it provides <strong>member accounts</strong>, the{" "}
          <strong>membership application and e-signature flow</strong>,{" "}
          <strong>invoicing and dues payment</strong>, and a{" "}
          <strong>public member directory</strong>. By using the site you accept
          these terms.
        </p>

        <h2>Relationship to the Membership Agreement</h2>
        <p>
          These terms govern your use of the website and its account features.{" "}
          <strong>Membership itself</strong> — rights, obligations, fees,
          working-group participation — is governed by the{" "}
          <strong>Verana Foundation Membership Agreement</strong> you e-sign
          during application (including its Annexes and Code of Conduct). If
          these terms and the Membership Agreement conflict, the Membership
          Agreement prevails for membership matters.
        </p>

        <h2>Accounts</h2>
        <p>
          Accounts are keyed to a <strong>verified email address</strong>;
          sign-in is passwordless (Google, GitHub, or a one-time emailed code).
          You are responsible for the security of your email and sign-in
          providers, and for the accuracy of the information you submit — in
          particular the organization details, VAT number, and the
          authority-to-bind attestation made when signing on behalf of an
          organization. Organization managers are responsible for the access
          they grant to colleagues. We may suspend accounts used to abuse,
          disrupt, or attempt unauthorized access to the service.
        </p>

        <h2>Application, e-signature, and records</h2>
        <p>
          Submitting the application and typing your name constitutes an{" "}
          <strong>electronic signature</strong> of the Membership Agreement,
          which you accept as binding. We retain the executed agreement, a
          certificate of execution, and technical evidence of signing (see the{" "}
          <a href="/privacy">privacy policy</a>); copies are available from your
          account.
        </p>

        <h2>Fees, invoices, and payment</h2>
        <p>
          Associate dues follow the Fee Schedule in the Membership Agreement
          (Annex D). We issue invoices payable by card (processed by{" "}
          <strong>Stripe</strong>) or bank transfer to our{" "}
          <strong>Wise</strong> business account, using the invoice number as
          payment reference. Membership activates on receipt of payment; unpaid
          invoices lapse after reminders, as described on the invoice and in
          the Membership Agreement. Invoices, applicable VAT treatment, and
          payment records are kept as required by Estonian law.
        </p>

        <h2>Member content and the directory</h2>
        <p>
          Uploading an organization logo grants the Foundation a
          non-exclusive, revocable license to display it on
          veranafoundation.org, subject to the display consent you give at
          upload. You warrant you hold the rights to any logo you upload and
          that it contains nothing unlawful or misleading. The{" "}
          <a href="/members">member directory</a> is curated by the Foundation;
          you may request unlisting at any time.
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
          The reference software is licensed under Apache 2.0, except the
          Verifiable Public Registry, which is AGPL-3.0 (copyright held by
          contributors); the specifications are licensed CC BY-SA 4.0. Your use
          of those artifacts is governed by their respective licenses, available
          in their repositories, not by these terms.
        </p>

        <h2>Content license</h2>
        <p>
          Unless otherwise noted, text on this site is licensed{" "}
          <strong>CC-BY-SA 4.0</strong> and brand assets <strong>CC-BY 4.0</strong>.
          Member logos remain the property of their owners and are not covered
          by these licenses.
        </p>

        <h2>No warranty; liability</h2>
        <p>
          The site and its account features are provided &ldquo;as is&rdquo;,
          without warranties of any kind to the fullest extent permitted by
          law. Links to third-party sites are provided for convenience and are
          not endorsements. For members, liability is governed by the
          Membership Agreement; for all other use of the site, our aggregate
          liability is limited to the fullest extent permitted by law.
        </p>

        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of <strong>Estonia</strong>;
          courts of Tallinn have jurisdiction, without prejudice to mandatory
          consumer protections of your country of residence.
        </p>

        <h2>Changes</h2>
        <p>
          These terms may be updated as the Foundation is incorporated and the
          service evolves. The <em>Last updated</em> date reflects the most
          recent change; material changes affecting member accounts are
          announced by email.
        </p>
      </article>
    </>
  );
}
