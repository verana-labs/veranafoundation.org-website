import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How the Verana Foundation (in formation, represented by 2060 OÜ) collects, uses, and retains personal data on veranafoundation.org — accounts, membership, billing — and your rights under the GDPR.",
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
            <strong className="text-ink">Last updated.</strong> 2026-06-19
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
          Regulation (GDPR). The site is more than an informational website: it
          hosts <strong>member accounts</strong>, the{" "}
          <strong>membership application and e-signature flow</strong>,{" "}
          <strong>invoicing and dues payment</strong>, and a{" "}
          <strong>public member directory</strong> — this policy covers all of
          them, plus the contact form and cookies.
        </p>
        <p>
          We do not sell data and do not run ad targeting or remarketing. We
          collect what you give us to operate your membership, what payment and
          sign-in providers necessarily share with us, and — with your consent —
          aggregate usage measurements.
        </p>

        <h2>Data controller</h2>
        <p>
          The Verana Foundation is in formation. Until incorporation, the data
          controller is <strong>2060 OÜ</strong>, Ahtri tn 12, 10151 Tallinn,
          Estonia (registry 16853041), acting as the Foundation&rsquo;s steward;
          thereafter the incorporated Foundation. For privacy matters, use the{" "}
          <a href="/contact">contact form</a> with inquiry type{" "}
          <em>General inquiry</em> and begin the message with{" "}
          <em>&ldquo;Legal:&rdquo;</em>.
        </p>

        <h2>What we collect and why</h2>

        <h3>Accounts and sign-in</h3>
        <ul>
          <li>
            <strong>Identity.</strong> Your verified email address is your
            account key, with your name and avatar if provided by a sign-in
            provider. Sign-in works via Google, GitHub, or a one-time code we
            email you; with OAuth we receive only your basic profile and
            verified email — never your password.
          </li>
          <li>
            <strong>Session.</strong> A strictly necessary, encrypted session
            cookie keeps you signed in. One-time sign-in codes are stored
            hashed and expire after 10 minutes.
          </li>
        </ul>
        <p>
          <strong>Legal basis.</strong> Performance of a contract (GDPR Art.
          6(1)(b)) — operating your account.
        </p>

        <h3>Membership applications and e-signatures</h3>
        <ul>
          <li>
            <strong>Member details.</strong> Legal name; for organizations:
            entity type, country, registered address, optional VAT number,
            optional billing email, optional logo; for individuals: country of
            residence.
          </li>
          <li>
            <strong>Signature record.</strong> When you e-sign the Membership
            Agreement we record the signer&rsquo;s name and title, timestamp,
            agreement version and document hash, and the{" "}
            <strong>IP address and browser user-agent</strong> at signing — kept
            as evidence that the agreement was validly executed — plus the
            personalised signed PDF.
          </li>
          <li>
            <strong>Organization access lists.</strong> Org managers may add
            colleagues&rsquo; email addresses to grant them access; those people
            are notified by email and linked to the organization when they sign
            in.
          </li>
        </ul>
        <p>
          <strong>Legal basis.</strong> Performance of the Membership Agreement
          (Art. 6(1)(b)) and our legitimate interest in evidencing contracts
          (Art. 6(1)(f)).
        </p>

        <h3>Billing and payments</h3>
        <ul>
          <li>
            <strong>Invoices.</strong> We issue and retain dues invoices
            (member identity, amounts, VAT treatment, VAT number where
            applicable) as our accounting records.
          </li>
          <li>
            <strong>Card payments</strong> are processed by{" "}
            <strong>Stripe</strong>; card numbers never touch our servers. We
            store Stripe&rsquo;s customer and payment identifiers to match
            payments to invoices.
          </li>
          <li>
            <strong>Bank transfers</strong> arrive on our{" "}
            <strong>Wise</strong> business account. To match a wire to an
            invoice we read, via Wise&rsquo;s API, the transfer&rsquo;s amount,
            date, payment reference, and sender name.
          </li>
        </ul>
        <p>
          <strong>Legal basis.</strong> Performance of the Membership Agreement
          (Art. 6(1)(b)) and our legal obligations under Estonian accounting and
          tax law (Art. 6(1)(c)).
        </p>

        <h3>Public member directory</h3>
        <p>
          The <a href="/members">/members</a> page lists members of the
          Foundation. Listing is curated by Foundation administrators, and an
          organization&rsquo;s logo appears only with the{" "}
          <strong>explicit consent</strong> given at upload (&ldquo;We may
          display this logo on veranafoundation.org&rdquo;). You can withdraw at
          any time: remove the logo from your membership card, or ask us to
          unlist the membership entirely. <strong>Legal basis.</strong> Consent
          (Art. 6(1)(a)) and legitimate interest in presenting the
          Foundation&rsquo;s membership (Art. 6(1)(f)).
        </p>

        <h3>Transactional email</h3>
        <p>
          We send operational email tied to your membership: sign-in codes,
          executed-agreement copies, payment requests, reminders and receipts,
          renewal and expiry notices, and access notifications. These are part
          of operating the service, not marketing; we send no newsletters
          without separate consent.
        </p>

        <h3>Contact form</h3>
        <p>
          Submissions on <code>/contact</code> (inquiry type, name, email,
          message, optional organization/role/links) are stored in our{" "}
          <strong>self-hosted Relaticle CRM</strong> (<code>crm.2060.io</code>)
          so we can respond. IP address and user-agent are used only for rate
          limiting and abuse detection.
        </p>

        <h3>Administration and security</h3>
        <p>
          Administrative actions on member records (e.g. marking an invoice
          paid, updating an address, listing a member) are written to an{" "}
          <strong>audit log</strong> recording who did what and when. Hosting
          logs (IP, user-agent) serve security and rate limiting only.
        </p>

        <h2>Cookies and analytics</h2>
        <p>
          The only cookie required by the site is the{" "}
          <strong>strictly necessary session cookie</strong> for signed-in
          users. For analytics we use <strong>Google Analytics 4</strong>{" "}
          (Google Ireland Ltd.) to measure aggregate page traffic. It is
          consent-gated: a banner offers <strong>Accept all</strong> or{" "}
          <strong>Essential only</strong>, and the Google Analytics tag loads —
          and its cookies are set — <strong>only after you select &ldquo;Accept
          all&rdquo;</strong>; choosing &ldquo;Essential only&rdquo; (or making
          no choice) loads nothing. The lawful basis is your{" "}
          <strong>consent</strong> (GDPR Art. 6(1)(a)), which you can withdraw
          at any time by clearing the choice stored in <code>localStorage</code>{" "}
          or via the banner&rsquo;s preferences. IP addresses are anonymized; no
          ad networks, no cross-site trackers, no selling of data. See the{" "}
          <a href="/cookies">cookie policy</a>.
        </p>

        <h2>Processors and where data goes</h2>
        <ul>
          <li>
            <strong>Google (Analytics)</strong> — Google Analytics 4, only after
            you consent to analytics. Aggregate traffic measurement; no profile
            data is shared.
          </li>
          <li>
            <strong>Stripe</strong> (Ireland/US) — card payments and checkout.
          </li>
          <li>
            <strong>Wise</strong> (Belgium/UK) — our business bank account for
            dues received by transfer.
          </li>
          <li>
            <strong>Google / GitHub</strong> — only if you choose them for
            sign-in.
          </li>
          <li>
            <strong>Our email provider</strong> — delivery of transactional
            email.
          </li>
          <li>
            <strong>Our hosting provider (EU)</strong> and our self-hosted CRM,
            operated by 2060 OÜ.
          </li>
        </ul>
        <p>
          Cross-border transfers rely on an EC adequacy decision, the EU-US Data
          Privacy Framework, or Standard Contractual Clauses as applicable. No
          third-party marketing platform receives your data.
        </p>

        <h2>How long we keep it</h2>
        <ul>
          <li>
            <strong>Account and member records</strong> — for the life of the
            membership and up to 24 months after it ends, then deleted or
            anonymized except where retention below applies.
          </li>
          <li>
            <strong>Invoices, payments, and signed agreements</strong> — up to{" "}
            <strong>7 years</strong>, as required by Estonian accounting law and
            to evidence the contract.
          </li>
          <li>
            <strong>Signature evidence</strong> (IP, user-agent at signing) —
            kept with the signed agreement.
          </li>
          <li>
            <strong>One-time sign-in codes</strong> — 10 minutes;{" "}
            <strong>spam/abuse logs</strong> — up to 30 days.
          </li>
          <li>
            <strong>Contact-form correspondence</strong> — up to 24 months from
            the last interaction.
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
          <li>rectify inaccurate data (organization managers can correct the
            registered address directly from the membership card);</li>
          <li>erase your data where we have no lawful basis to keep it;</li>
          <li>restrict or object to processing;</li>
          <li>receive a portable copy of the data you gave us;</li>
          <li>
            withdraw consent at any time (e.g. remove your logo or ask to be
            unlisted from <a href="/members">/members</a>) — without affecting
            prior processing;
          </li>
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
          Note that invoices, payment records, and executed agreements are
          retained despite erasure requests while a legal obligation or the
          contract-evidence interest applies. To exercise any right, use the{" "}
          <a href="/contact">contact form</a> (inquiry type <em>General</em>,
          message prefixed <em>&ldquo;Legal:&rdquo;</em>). We respond within 30
          days.
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
