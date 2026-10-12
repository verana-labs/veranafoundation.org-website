import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProgram, getModule, tracksWithModule, CERT_REPO_URL } from "@/app/lib/certification";
import { Markdown } from "@/app/components/Markdown";
import { ModuleStatusBadge } from "@/app/components/CertificationCards";

export const revalidate = 3600;

export async function generateStaticParams() {
  const program = await getProgram();
  return (program?.modules ?? []).map((m) => ({ code: m.code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const mod = await getModule((await params).code);
  if (!mod) return { title: "Certification" };
  return {
    title: `${mod.code} ${mod.title} · Certification`,
    description: mod.summary,
  };
}

export default async function ModulePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [program, mod] = await Promise.all([getProgram(), getModule(code)]);
  if (!mod) notFound();
  const tracks = program ? tracksWithModule(program, mod.code) : [];

  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="mb-4">
            <Link href="/certification" className="tag hover:text-purple transition-colors">
              ← Certification
            </Link>
          </p>
          <p className="font-mono text-sm text-muted">{mod.code}</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight">{mod.title}</h1>
          <div className="accent-line mt-6" />
          <p className="mt-8 text-lg text-muted leading-relaxed">{mod.summary}</p>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
            <span className="badge">{mod.hours} h</span>
            <span className="badge">{mod.assessment}</span>
            <ModuleStatusBadge status={mod.status} />
            {mod.version ? <span className="badge">material v{mod.version}</span> : null}
            {program ? <span className="badge">program {program.version}</span> : null}
          </div>
          {tracks.length ? (
            <p className="mt-6 text-sm text-muted">
              In the tracks:{" "}
              {tracks.map((t, i) => (
                <span key={t.slug}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/certification/tracks/${t.slug}`} className="text-purple hover:underline">
                    {t.name}
                  </Link>
                </span>
              ))}
              .
            </p>
          ) : null}
        </div>
      </section>

      {mod.status !== "published" ? (
        <section className="border-b border-rule">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <p className="text-sm text-muted">
              This module is an outline: the objectives, sections and assessment are agreed; the
              material is being written by the Showcase and Certification Working Group.
            </p>
          </div>
        </section>
      ) : null}

      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <Markdown source={mod.bodyMarkdown} />
        </div>
      </section>

      <section>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-sm text-muted">
          Open material, CC BY-SA 4.0.{" "}
          <a
            href={`${CERT_REPO_URL}/blob/main/modules/${mod.code}/README.md`}
            rel="noopener"
            className="text-purple hover:underline"
          >
            Source on GitHub ↗
          </a>
        </div>
      </section>
    </>
  );
}
