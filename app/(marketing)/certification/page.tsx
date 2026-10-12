import type { Metadata } from "next";
import Link from "next/link";
import { getProgram, getCertificators, CERT_REPO_URL } from "@/app/lib/certification";
import { TrackCard } from "@/app/components/CertificationCards";

export const metadata: Metadata = {
  title: "Certification",
  description:
    "The Verana Certification Program certifies the people and the organizations that use, sell, build and operate products and services on Verana: three levels, role tracks, organization designations, delivered with Authorized Certificators.",
};

// ISR: rebuild from the curriculum repo at most once an hour.
export const revalidate = 3600;

const STEPS = [
  {
    title: "Study the open material",
    text: "Every module is published under a Creative Commons license: text, labs and reading lists. Read it on this site or on GitHub.",
  },
  {
    title: "Pass the Level 1 exam online",
    text: "Fundamentals is a single online exam administered by the Foundation. No certificator is needed, and it is free during the first year.",
  },
  {
    title: "Go deeper with a certificator",
    text: "Level 2 adds a proctored exam and a practical lab or case study, graded by an Authorized Certificator. Workshops are optional and offered by certificators.",
  },
  {
    title: "Receive a verifiable credential",
    text: "Certifications are issued as verifiable credentials on the Verana Certification Ecosystem, to your wallet or to your organization's DID, and verifiable by anyone.",
  },
];

export default async function CertificationPage() {
  const [program, certificators] = await Promise.all([getProgram(), getCertificators()]);
  const launchTracks = program?.tracks.filter((t) => t.phase <= 1) ?? [];
  const laterTracks = program?.tracks.filter((t) => t.phase > 1) ?? [];

  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Certification</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">
            Verana Certification Program
          </h1>
          <div className="accent-line mt-6" />
          <p className="mt-8 text-lg text-muted max-w-2xl leading-relaxed">
            A professional certification for the people and the organizations
            that use, sell, build and operate products and services on Verana.
            Open material, a role-based curriculum, independent certificators,
            and credentials you can verify.
          </p>
          {program ? (
            <p className="mt-6 text-sm text-muted">
              Program version <span className="font-mono">{program.version}</span>, Verifiable
              Trust {program.protocol.verifiableTrust} and Verifiable Public Registry{" "}
              {program.protocol.verifiablePublicRegistry}.
              {program.status === "draft"
                ? " The curriculum is being finalized; the first cohort opens with the publication of the Certification Policy."
                : ""}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="#tracks" className="btn btn-primary">
              Explore the tracks
            </Link>
            <Link href="/certification/certificators" className="btn btn-secondary">
              Find a certificator
            </Link>
          </div>
        </div>
      </section>

      {!program ? (
        <section className="border-b border-rule">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <p className="text-sm text-muted">
              The curriculum could not be loaded right now. It is published at{" "}
              <a href={CERT_REPO_URL} rel="noopener" className="text-purple hover:underline">
                {CERT_REPO_URL.replace("https://", "")} ↗
              </a>
              .
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="border-b border-rule reveal">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
              <p className="tag mb-3">Levels</p>
              <h2 className="display text-3xl">Three levels, one curriculum</h2>
              <div className="accent-line mt-4 mb-8" />
              <div className="grid md:grid-cols-3 gap-6">
                {program.levels.map((l) => (
                  <div key={l.level} className="card">
                    <span className="badge badge-purple self-start">level {l.level}</span>
                    <h3>{l.name}</h3>
                    <p className="text-xs uppercase tracking-wider text-muted font-mono">{l.subtitle}</p>
                    <p className="text-sm text-muted leading-relaxed">{l.how}</p>
                    <p className="text-xs text-muted mt-auto">Valid {l.validityYears} years, renewable.</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="tracks" className="border-b border-rule reveal scroll-mt-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
              <p className="tag mb-3">Role tracks</p>
              <h2 className="display text-3xl">Certified for the job you do</h2>
              <div className="accent-line mt-4 mb-6" />
              <p className="text-muted max-w-2xl leading-relaxed mb-8">
                Every track shares three core modules: Verifiable Trust fundamentals, the Verana
                Public Registry, and the playground practicum. The rest is the role: engineering,
                operations, consulting, sales, legal, procurement, wallets, agents.
              </p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {launchTracks.map((t) => (
                  <TrackCard key={t.slug} track={t} modules={program.modules} />
                ))}
              </div>
              {laterTracks.length ? (
                <>
                  <p className="tag mt-12 mb-4">Opening in later phases</p>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {laterTracks.map((t) => (
                      <TrackCard key={t.slug} track={t} modules={program.modules} />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <section className="border-b border-rule reveal">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
              <p className="tag mb-3">Organizations</p>
              <h2 className="display text-3xl">Three designations for companies</h2>
              <div className="accent-line mt-4 mb-6" />
              <p className="text-muted max-w-2xl leading-relaxed mb-8">
                An organization is certified through an Authorized Certificator, on the strength of
                its certified staff and of evidence of real work. Every designation requires at
                least a Contributor membership of the Foundation.
              </p>
              <div className="grid md:grid-cols-3 gap-6">
                {program.designations.map((d) => (
                  <div key={d.slug} className="card">
                    <h3>{d.name}</h3>
                    <p className="text-sm text-muted leading-relaxed">{d.for}</p>
                    <p className="text-xs uppercase tracking-wider text-muted font-mono mt-2">Certified staff</p>
                    <ul className="text-sm text-muted space-y-1">
                      {d.staff.map((s, i) => (
                        <li key={i}>
                          {s.count} in{" "}
                          {s.tracks
                            .map((slug) => program.tracks.find((t) => t.slug === slug)?.name ?? slug)
                            .join(" or ")}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs uppercase tracking-wider text-muted font-mono mt-2">Evidence</p>
                    <ul className="text-sm text-muted space-y-1">
                      {d.evidence.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-3">How it works</p>
          <h2 className="display text-3xl">From the open material to a verifiable credential</h2>
          <div className="accent-line mt-4 mb-8" />
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

      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid md:grid-cols-2 gap-6">
          <div className="card">
            <span className="badge badge-green self-start">certificators</span>
            <h3>Authorized Certificators</h3>
            <p className="text-sm text-muted leading-relaxed">
              Associate members of the Foundation, accredited every year, that deliver workshops,
              proctor exams, grade practical work and issue the certifications. They never certify
              their own organization or staff.
            </p>
            <p className="text-sm text-muted">
              {certificators.length
                ? `${certificators.length} ${certificators.length === 1 ? "certificator" : "certificators"} listed.`
                : "The directory opens with the first accreditations."}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href="/certification/certificators" className="text-purple hover:underline">
                Directory →
              </Link>
              <Link href="/certification/become-a-certificator" className="text-purple hover:underline">
                Become a certificator →
              </Link>
            </div>
          </div>
          <div className="card">
            <span className="badge badge-purple self-start">policy</span>
            <h3>Rules, versions, marks</h3>
            <p className="text-sm text-muted leading-relaxed">
              The Certification Policy sets the levels, the assessment rules, validity and renewal,
              the designations, certificator accreditation, the use of the Verana Certified marks,
              appeals and fees. Its digest is anchored as the governance framework of the Verana
              Certification Ecosystem.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href="/certification/policy" className="text-purple hover:underline">
                Certification Policy →
              </Link>
              <Link href="/certification/candidate-terms" className="text-purple hover:underline">
                Candidate Terms →
              </Link>
              <a href={CERT_REPO_URL} rel="noopener" className="text-purple hover:underline">
                Curriculum on GitHub ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="card">
            <h3>Who writes the curriculum</h3>
            <p className="text-sm text-muted leading-relaxed">
              The Showcase and Certification Working Group of the Foundation authors and reviews the
              modules, tracks and assessments, in the open. Question banks and grading rubrics stay
              confidential. Join the working group to contribute.
            </p>
            <Link href="/working-groups" className="text-sm text-purple hover:underline">
              Working groups →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
