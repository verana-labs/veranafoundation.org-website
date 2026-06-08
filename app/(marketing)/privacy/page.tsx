import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How the Verana Foundation (in formation, represented by 2060 OÜ) collects, uses, and retains personal data on veranafoundation.org, and your rights under the GDPR.",
};

export default function PrivacyPage() {
  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-4">Legal</p>
          <h1 className="display text-4xl sm:text-5xl">Privacy Policy</h1>
          <div className="accent-line mt-6" />
          <p className="text-xs tracking-wider uppercase text-muted mt-8">
            <strong className="text-ink">Last updated.</strong> 2026-06-06
          </p>
        </div>
      </section>

      <article className="prose-body max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <p>
          This page explains what personal data the{" "}
          <strong>Verana Foundation (in formation)</strong>, represented by{" "}
          <strong>2060 OÜ</strong>, collects through{" "}
          <strong>veranafoundation.org</strong>, why we collect it, how long we
          keep it, and your rights under the EU General Data Protection
          Regulation (GDPR). It covers the <strong>contact form</strong> on{" "}
          <code>/contact</code> and any cookies or anti-abuse signals set by the
          site.
        </p>
        <p>
          We do not sell data and do not run ad targeting or remarketing. The
          only data we collect is what you explicitly send through the contact
          form, what our hosting provider logs for security, and — with your
          consent — aggregate usage measurements so we can see which pages people
          read.
        </p>

        <h2>Data controller</h2>
        <p>
          The Verana Foundation is in formation. Until incorporation, the data
          controller is <strong>2060 OÜ</strong>, Ahtri tn 12, 10151 Tallinn,
          Estonia (registry 16853041), acting as the Foundation&rsquo;s steward;
          thereafter the incorporated Foundation. For privacy matters, use the{" "}
          <a href="/contact">contact form</a> with inquiry type{" "}
          <em>General inquiry</em> and begin the message with{" "}
          <em>&ldquo;Legal:&rdquo;</em>. We do not publish a direct privacy
          email; routing is handled internally.
        </p>

        <h2>What we collect and why</h2>
        <p>When you submit the form on {""}<code>/contact</code>, we receive:</p>
        <ul>
          <li>
            <strong>Required.</strong> Inquiry type, name, email, message,
            consent.
          </li>
          <li>
            <strong>Conditionally required.</strong> Organization (for
            membership, partnership, or press inquiries).
          </li>
          <li>
            <strong>Optional.</strong> Role or title, website/LinkedIn, referral
            source.
          </li>
        </ul>
        <p>Automatically, as part of submission security:</p>
        <ul>
          <li>
            <strong>IP address and user-agent</strong>, from our hosting
            provider, used only for rate limiting and honeypot-based abuse
            detection — not for tracking or profiling.
          </li>
        </ul>
        <p>
          <strong>Purpose.</strong> To respond to your inquiry and route it to
          the right person. <strong>Legal basis.</strong> Your consent (GDPR Art.
          6(1)(a)) and our legitimate interest in answering inbound inquiries
          (Art. 6(1)(f)).
        </p>

        <h2>Cookies and analytics</h2>
        <p>
          Analytics, if enabled, are consent-gated: a banner offers{" "}
          <strong>Accept all</strong> or <strong>Essential only</strong>, and any
          analytics tag loads only after consent. Your choice is stored in your
          browser&rsquo;s <code>localStorage</code> (not a cookie) so the banner
          does not reappear. No ad networks, no cross-site trackers; IP addresses
          anonymized. The specific analytics provider and measurement ID will be
          listed here once finalized.
        </p>

        <h2>Where data is processed</h2>
        <p>
          Contact-form submissions are stored in our <strong>self-hosted
          Relaticle CRM</strong> (<code>crm.2060.io</code>), operated by 2060 OÜ
          on our own infrastructure, so we can respond to and manage your
          inquiry. No third-party CRM or marketing platform receives this data.
          Spam protection is self-hosted (honeypot, time-to-submit, rate
          limiting); no third-party captcha is used. Site hosting and any
          cross-border transfer rely on an EC adequacy decision, the EU-US Data
          Privacy Framework, or Standard Contractual Clauses as applicable.
        </p>

        <h2>How long we keep it</h2>
        <ul>
          <li>
            <strong>Contact-form correspondence</strong> — up to 24 months from
            the last interaction, then deleted or anonymized unless an
            engagement is ongoing.
          </li>
          <li>
            <strong>Spam-protection logs</strong> (IP, user-agent) — up to 30
            days.
          </li>
          <li>
            <strong>Analytics</strong> — minimum provider retention; aggregate
            reports contain no identifiers.
          </li>
        </ul>

        <h2>Your rights</h2>
        <p>Under the GDPR, you may:</p>
        <ul>
          <li>access the personal data we hold about you;</li>
          <li>rectify inaccurate data;</li>
          <li>erase your data where we have no lawful basis to keep it;</li>
          <li>restrict or object to processing;</li>
          <li>receive a portable copy of the data you gave us;</li>
          <li>withdraw consent at any time;</li>
          <li>
            lodge a complaint with a supervisory authority — while stewarded by
            2060 OÜ, the{" "}
            <a href="https://www.aki.ee/en" rel="noopener">
              Estonian Data Protection Inspectorate
            </a>
            .
          </li>
        </ul>
        <p>
          To exercise any right, use the <a href="/contact">contact form</a>{" "}
          (inquiry type <em>General</em>, message prefixed{" "}
          <em>&ldquo;Legal:&rdquo;</em>). We respond within 30 days.
        </p>

        <h2>Changes</h2>
        <p>
          We update this page when our practices change. The{" "}
          <em>Last updated</em> date reflects the most recent change; prior
          submissions remain governed by the version in force when they were
          sent.
        </p>
      </article>
    </>
  );
}
