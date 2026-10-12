import type { Metadata } from "next";
import Link from "next/link";
import { getProgram, getCertificators } from "@/app/lib/certification";
import { PageHero, Section } from "@/app/components/PageHero";
import { CertificatorCard } from "@/app/components/CertificationCards";

export const metadata: Metadata = {
  title: "Authorized Certificators · Certification",
  description:
    "The directory of Verana Authorized Certificators: Associate members accredited by the Foundation to train, assess and certify under the Verana Certification Program.",
};

export const revalidate = 3600;

export default async function CertificatorsPage() {
  const [program, certificators] = await Promise.all([getProgram(), getCertificators()]);
  const tracks = program?.tracks ?? [];

  return (
    <>
      <PageHero
        back={{ href: "/certification", label: "Certification" }}
        title="Authorized Certificators"
        lead="Associate members of the Foundation, accredited every year to deliver workshops, proctor exams, grade practical work and issue certifications. Contact a certificator directly to enrol for Level 2 or to certify your organization."
      />

      <Section>
        {certificators.length === 0 ? (
          <p className="text-sm text-muted">The directory opens with the first accreditations.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {certificators.map((c) => (
              <CertificatorCard key={c.slug} c={c} tracks={tracks} />
            ))}
          </div>
        )}
        <p className="text-xs text-muted mt-8 max-w-2xl leading-relaxed">
          A launch certificator is accredited directly by the Certification Office for the first
          program version. Certificators never certify their own organization, affiliates or staff.
          Accreditation scope (tracks, regions, languages) is set per certificator in its agreement.
        </p>
      </Section>

      <Section bordered={false}>
        <div className="card">
          <h3>Become an Authorized Certificator</h3>
          <p className="text-sm text-muted leading-relaxed">
            Associate members with certified instructors and training capability can apply. The
            Office reviews a complete application within two weeks.
          </p>
          <Link href="/certification/become-a-certificator" className="text-sm text-purple hover:underline">
            Criteria and application →
          </Link>
        </div>
      </Section>
    </>
  );
}
