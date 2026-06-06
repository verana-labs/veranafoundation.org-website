import type { Metadata } from "next";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact the Verana Foundation through one internally-routed form. We do not publish email addresses. Inquiry types: membership, working groups, grants, partnerships, press, general.",
};

export default function ContactPage() {
  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Contact</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight">
            Talk to the Foundation
          </h1>
          <div className="accent-line mt-6" />
          <p className="mt-8 text-muted max-w-2xl leading-relaxed">
            The form below is the way to reach us. We do not publish email
            addresses — they collect more spam than signal — so every inquiry is
            handled internally without exposing a contact endpoint.
          </p>
        </div>
      </section>

      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid md:grid-cols-12 gap-10">
            <aside className="md:col-span-4 order-2 md:order-1">
              <p className="tag mb-3">Why this form</p>
              <h2 className="display text-2xl">Routed internally.</h2>
              <ul className="mt-6 space-y-4 text-sm text-muted">
                <li>No email addresses exposed — nothing in HTML or metadata.</li>
                <li>
                  Self-hosted anti-abuse (honeypot + time-to-submit). No
                  Turnstile, hCaptcha, or reCAPTCHA.
                </li>
                <li>No cookies set by this form.</li>
                <li>
                  Submissions are confidential while the Foundation is in
                  formation.
                </li>
              </ul>
              <p className="text-xs text-muted mt-8">
                Full details in the{" "}
                <a href="/privacy" className="text-purple underline">
                  Privacy Policy
                </a>
                .
              </p>
            </aside>

            <div className="md:col-span-8 order-1 md:order-2">
              <p className="tag mb-3">Send a message</p>
              <h2 className="display text-2xl mb-6">
                Every message is routed to the right person
              </h2>
              <ContactForm />
            </div>
          </div>
        </div>
      </section>

      {/* Other ways */}
      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-3">Other ways to reach us</p>
          <h2 className="display text-2xl mb-8">If the form isn&rsquo;t your preference</h2>
          <div className="grid sm:grid-cols-2 gap-6 max-w-4xl">
            <div className="card">
              <h3>GitHub</h3>
              <p className="text-sm text-muted">
                Open an issue or pull request on the open-source repos.
              </p>
              <a
                href="https://github.com/verana-labs"
                rel="noopener"
                className="text-sm text-purple hover:underline"
              >
                github.com/verana-labs ↗
              </a>
            </div>
            <div className="card">
              <h3>Working groups</h3>
              <p className="text-sm text-muted">
                Members participate in the spec and software working groups.
              </p>
              <a href="/contribute" className="text-sm text-purple hover:underline">
                How to contribute →
              </a>
            </div>
            <div className="card">
              <h3>In person</h3>
              <p className="text-sm text-muted">
                Contributors present at the Internet Identity Workshop and
                adjacent standards venues.
              </p>
            </div>
            <div className="card">
              <h3>Press kit</h3>
              <p className="text-sm text-muted">
                Logos and boilerplate on request — use inquiry type{" "}
                <em>Press</em> on the form.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Office & legal */}
      <section className="reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid md:grid-cols-12 gap-10">
          <div className="md:col-span-4">
            <p className="tag mb-3">Office &amp; legal</p>
            <h2 className="display text-2xl">Who you&rsquo;re talking to</h2>
            <div className="accent-line mt-4" />
          </div>
          <div className="md:col-span-8">
            <address className="not-italic text-muted leading-relaxed">
              <strong className="text-ink block text-lg">
                Verana Foundation (in formation)
              </strong>
              represented by 2060 OÜ, Ahtri tn 12, 10151 Tallinn, Estonia
            </address>
            <dl className="grid sm:grid-cols-2 gap-x-10 gap-y-4 mt-6 text-sm">
              <div>
                <dt className="text-xs tracking-wider uppercase text-muted">
                  Steward (registry)
                </dt>
                <dd className="text-ink mt-1">2060 OÜ · 16853041 (Estonia)</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wider uppercase text-muted">
                  Foundation entity
                </dt>
                <dd className="text-ink mt-1">To be confirmed on incorporation</dd>
              </div>
            </dl>
            <p className="text-sm text-muted mt-8">
              For privacy / GDPR matters, use the form above with inquiry type{" "}
              <em>General</em> and begin the message with <em>&ldquo;Legal:&rdquo;</em>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
