import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "@/app/(marketing)/contact/ContactForm";

export const metadata: Metadata = {
  title: "Become a certificator · Certification",
  description:
    "Apply to become a Verana Authorized Certificator: eligibility (Associate membership, Certified Instructors, a verifiable service), the accreditation process, obligations, and the application form.",
};

const CRITERIA = [
  "An Associate membership of the Foundation in good standing, kept active for the whole accreditation period.",
  "At least two Certified Instructors covering every track you will deliver. For the first program version, the Certification Office certifies the instructors of launch certificators itself.",
  "A verifiable service on the Verana network that holds your Verana Authorized Certificator credential and issues the certifications you grant.",
  "The capability to deliver training and proctored assessments, and to keep candidate records for the validity period of the certifications you issue.",
  "A signed Authorized Certificator Agreement, which incorporates the Certification Policy.",
];

const STEPS = [
  { title: "Apply", text: "Send the form below with your organization, the tracks, regions and languages you want to deliver, your instructors and your training capability." },
  { title: "Review", text: "The Certification Office reviews a complete application within two weeks and may limit the accreditation to specific tracks, regions or languages." },
  { title: "Sign and onboard", text: "You sign the Authorized Certificator Agreement, pay the accreditation fee, and your verifiable service is onboarded as an issuer in the Verana Certification Ecosystem." },
  { title: "Deliver", text: "You are listed in the directory, deliver the published curriculum, proctor and grade, report results within five business days, and renew yearly after the annual review." },
];

const OBLIGATIONS = [
  "Deliver the published curriculum unchanged; additions are allowed when marked as your own.",
  "Proctor and grade with Certified Instructors only, against the published rubrics; report results within five business days.",
  "Never certify your own organization, affiliates, employees or contractors.",
  "Keep question banks, rubrics and lab solutions confidential.",
  "Accept audits, including observers and unannounced candidates.",
  "Use the Verana Authorized Certificator mark only as the policy allows.",
];

export default function BecomeACertificatorPage() {
  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="mb-4">
            <Link href="/certification" className="tag hover:text-purple transition-colors">
              ← Certification
            </Link>
          </p>
          <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">
            Become an Authorized Certificator
          </h1>
          <div className="accent-line mt-6" />
          <p className="mt-8 text-lg text-muted max-w-2xl leading-relaxed">
            Certificators are the Associate members that train, assess and certify under the Verana
            Certification Program. They set their own workshop prices, and the Foundation refers
            candidates and companies to them without preference.
          </p>
        </div>
      </section>

      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid md:grid-cols-2 gap-10">
          <div>
            <p className="tag mb-3">Eligibility</p>
            <h2 className="display text-2xl mb-6">What you need</h2>
            <ul className="space-y-3 text-sm text-muted leading-relaxed">
              {CRITERIA.map((c) => (
                <li key={c} className="flex gap-3">
                  <span aria-hidden="true" className="text-purple">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted mt-6">
              Not an Associate member yet?{" "}
              <Link href="/join" className="text-purple hover:underline">
                Join the Foundation →
              </Link>
            </p>
          </div>
          <div>
            <p className="tag mb-3">Obligations</p>
            <h2 className="display text-2xl mb-6">What you commit to</h2>
            <ul className="space-y-3 text-sm text-muted leading-relaxed">
              {OBLIGATIONS.map((o) => (
                <li key={o} className="flex gap-3">
                  <span aria-hidden="true" className="text-purple">•</span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted mt-6">
              Fees (accreditation per year, issuance per credential) are set in Annex A of the{" "}
              <Link href="/certification/policy" className="text-purple hover:underline">
                Certification Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-3">Process</p>
          <h2 className="display text-2xl mb-8">From application to the directory</h2>
          <ol className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card">
                <span className="font-mono text-xs text-muted">0{i + 1}</span>
                <h3>{s.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid md:grid-cols-12 gap-10">
            <aside className="md:col-span-4 order-2 md:order-1">
              <p className="tag mb-3">In your message</p>
              <h2 className="display text-2xl">What to include</h2>
              <ul className="mt-6 space-y-4 text-sm text-muted">
                <li>Your organization and its Associate membership status.</li>
                <li>The tracks, regions and languages you want to deliver.</li>
                <li>Your prospective instructors and their Verana experience.</li>
                <li>Your training and assessment capability: venues, remote delivery, record keeping.</li>
                <li>The DID of your verifiable service, if you already run one.</li>
              </ul>
              <p className="text-xs text-muted mt-8">
                Applications are handled by the Certification Office. Nothing is published until
                accreditation.
              </p>
            </aside>
            <div className="md:col-span-8 order-1 md:order-2">
              <p className="tag mb-3">Apply</p>
              <h2 className="display text-2xl mb-6">Application</h2>
              <ContactForm defaultTopic="certificator" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
