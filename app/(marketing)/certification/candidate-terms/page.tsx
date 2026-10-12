import type { Metadata } from "next";
import Link from "next/link";
import { getCertificationDocument } from "@/app/lib/certification";
import { Markdown } from "@/app/components/Markdown";

export const metadata: Metadata = {
  title: "Candidate Terms · Certification",
  description:
    "The terms every candidate of the Verana Certification Program accepts before the first assessment: enrolment, assessments and integrity, certifications, marks, the registry, fees, data and appeals.",
};

export default async function CandidateTermsPage() {
  const doc = await getCertificationDocument("candidate-terms");

  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="mb-4">
            <Link href="/certification" className="tag hover:text-purple transition-colors">
              ← Certification
            </Link>
          </p>
          <h1 className="display text-4xl sm:text-5xl leading-tight">Candidate Terms</h1>
          <div className="accent-line mt-6" />
          {doc ? (
            <dl className="mt-8 text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted">Version</dt>
              <dd className="font-mono">{doc.version}</dd>
              <dt className="text-muted">Digest</dt>
              <dd className="font-mono break-all text-xs">{doc.sha384}</dd>
            </dl>
          ) : null}
          <p className="mt-6 text-sm text-muted max-w-2xl leading-relaxed">
            Accepted by every candidate on the Foundation platform before the first assessment. The{" "}
            <Link href="/certification/policy" className="text-purple hover:underline">
              Certification Policy
            </Link>{" "}
            is part of these terms.
          </p>
        </div>
      </section>

      <section>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {doc ? (
            <Markdown source={doc.markdown} />
          ) : (
            <p className="text-sm text-muted">
              The Candidate Terms are being finalized and will be published here before the first
              cohort opens.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
