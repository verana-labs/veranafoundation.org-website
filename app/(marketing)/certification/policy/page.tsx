import type { Metadata } from "next";
import Link from "next/link";
import { getCertificationDocument } from "@/app/lib/certification";
import { Markdown } from "@/app/components/Markdown";

export const metadata: Metadata = {
  title: "Certification Policy · Certification",
  description:
    "The Verana Certification Policy: levels, assessment, validity and renewal, issuance on the Verana Certification Ecosystem, organization designations, certificator accreditation, marks, appeals and fees.",
};

export default async function CertificationPolicyPage() {
  const doc = await getCertificationDocument("certification-policy");

  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="mb-4">
            <Link href="/certification" className="tag hover:text-purple transition-colors">
              ← Certification
            </Link>
          </p>
          <h1 className="display text-4xl sm:text-5xl leading-tight">Certification Policy</h1>
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
            The policy is versioned. Each version is published here with its integrity digest, and
            the digest of the version in force is anchored as the governance framework of the Verana
            Certification Ecosystem. An assessment is governed by the program version in force on the
            day of the attempt; a certification by the policy version in force on its issuance date.
          </p>
        </div>
      </section>

      <section>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {doc ? (
            <Markdown source={doc.markdown} />
          ) : (
            <p className="text-sm text-muted">
              The Certification Policy is being finalized and will be published here, with its
              version and digest, before the first cohort opens.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
