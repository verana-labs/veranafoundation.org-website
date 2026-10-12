import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProgram, getCertificators, trackHours } from "@/app/lib/certification";
import { PageHero, Section } from "@/app/components/PageHero";
import {
  ModuleRow,
  TrackPhaseBadge,
  CertificatorStatusBadge,
  hoursLabel,
} from "@/app/components/CertificationCards";

export const revalidate = 3600;

export async function generateStaticParams() {
  const program = await getProgram();
  return (program?.tracks ?? []).map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const [program, { slug }] = await Promise.all([getProgram(), params]);
  const track = program?.tracks.find((t) => t.slug === slug);
  if (!track) return { title: "Certification" };
  return {
    title: `${track.name} track · Certification`,
    description: track.summary,
  };
}

export default async function TrackPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [program, certificators] = await Promise.all([getProgram(), getCertificators()]);
  const track = program?.tracks.find((t) => t.slug === slug);
  if (!program || !track) notFound();

  const byCode = (code: string) => program.modules.find((m) => m.code === code);
  const level = program.levels.find((l) => l.level === track.level);
  const hours = trackHours(track, program.modules);
  const delivering = certificators.filter((c) => c.tracks.includes(track.slug));
  const isFundamentals = track.level === 1;

  return (
    <>
      <PageHero
        back={{ href: "/certification", label: "Certification" }}
        title={`${track.name} track`}
        lead={track.summary}
      />

      <Section>
        <div className="grid md:grid-cols-12 gap-10">
          <div className="md:col-span-8">
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <span className="badge">level {track.level}</span>
              <TrackPhaseBadge phase={track.phase} />
              <span className="badge">{hoursLabel(hours)} of class</span>
            </div>

            <p className="tag mb-2">Core modules</p>
            <ul className="mb-8">
              {track.core.map((c) => {
                const m = byCode(c);
                return m ? <ModuleRow key={c} m={m} /> : null;
              })}
            </ul>

            {track.modules.length ? (
              <>
                <p className="tag mb-2">Required modules</p>
                <ul className="mb-8">
                  {track.modules.map((c) => {
                    const m = byCode(c);
                    return m ? <ModuleRow key={c} m={m} /> : null;
                  })}
                </ul>
              </>
            ) : null}

            {(track.choice ?? []).map((group, i) => (
              <div key={i}>
                <p className="tag mb-2">Choose one</p>
                <ul className="mb-8">
                  {group.map((c) => {
                    const m = byCode(c);
                    return m ? <ModuleRow key={c} m={m} /> : null;
                  })}
                </ul>
              </div>
            ))}

            {track.reduced?.length ? (
              <>
                <p className="tag mb-2">Required reading</p>
                <ul className="mb-2">
                  {track.reduced.map((c) => {
                    const m = byCode(c);
                    return m ? <ModuleRow key={c} m={m} note="reading and exam questions only" /> : null;
                  })}
                </ul>
                <p className="text-xs text-muted mb-8">
                  The material is required and its questions enter the track exam; the module&rsquo;s
                  practical assessment is not.
                </p>
              </>
            ) : null}
          </div>

          <aside className="md:col-span-4 flex flex-col gap-6">
            <div className="card">
              <h3>{level?.name ?? `Level ${track.level}`}</h3>
              <p className="text-sm text-muted leading-relaxed">{level?.how}</p>
              <p className="text-xs text-muted">
                Valid {level?.validityYears ?? 2} years, renewed by the track exam under the current
                program version.
              </p>
            </div>
            <div className="card">
              <h3>Who it is for</h3>
              <p className="text-sm text-muted leading-relaxed">{track.audience}</p>
            </div>
            <div className="card">
              <h3>How to enrol</h3>
              {isFundamentals ? (
                <p className="text-sm text-muted leading-relaxed">
                  Online, on this site, when the first exam window opens. Free during the first year
                  of the program. The only prerequisite is a Contributor membership of the Foundation,
                  which is free for individuals.
                </p>
              ) : (
                <p className="text-sm text-muted leading-relaxed">
                  Through an Authorized Certificator, which onboards you to the program,
                  proctors the exam and grades your practical work. Fundamentals (Level 1) and an
                  active Contributor membership (free for individuals) are the prerequisites.
                </p>
              )}
              <Link href="/certification/candidate-terms" className="text-sm text-purple hover:underline">
                Candidate Terms →
              </Link>
            </div>
            {!isFundamentals ? (
              <div className="card">
                <h3>Certificators for this track</h3>
                {delivering.length ? (
                  <ul className="text-sm space-y-2">
                    {delivering.map((c) => (
                      <li key={c.slug} className="flex flex-wrap items-center gap-2">
                        <a href={c.website} rel="noopener" className="text-purple hover:underline">
                          {c.name}
                        </a>
                        <CertificatorStatusBadge status={c.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">None accredited for this track yet.</p>
                )}
                <Link href="/certification/certificators" className="text-sm text-purple hover:underline">
                  Directory →
                </Link>
              </div>
            ) : null}
          </aside>
        </div>
      </Section>
    </>
  );
}
