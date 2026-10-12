import Link from "next/link";
import type { Certificator, ModuleMeta, Track } from "@/app/lib/certification";
import { trackHours } from "@/app/lib/certification";

/** Small status pill for a module's editorial state. */
export function ModuleStatusBadge({ status }: { status: ModuleMeta["status"] }) {
  return status === "published" ? (
    <span className="badge badge-green">published</span>
  ) : (
    <span className="badge badge-amber">outline</span>
  );
}

/** Launch-phase pill for a track. */
export function TrackPhaseBadge({ phase }: { phase: number }) {
  return phase <= 1 ? (
    <span className="badge badge-purple">launch</span>
  ) : (
    <span className="badge">phase {phase}</span>
  );
}

export function CertificatorStatusBadge({ status }: { status: Certificator["status"] }) {
  if (status === "accredited") return <span className="badge badge-green">accredited</span>;
  if (status === "suspended") return <span className="badge badge-red">suspended</span>;
  return <span className="badge badge-purple">launch certificator</span>;
}

export function hoursLabel(h: { min: number; max: number }): string {
  return h.min === h.max ? `${h.min} h` : `${h.min} to ${h.max} h`;
}

/** One row of a track's module list. */
export function ModuleRow({ m, note }: { m: ModuleMeta; note?: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 border-b border-rule last:border-b-0">
      <span className="font-mono text-xs text-muted w-8">{m.code}</span>
      <Link href={`/certification/modules/${m.code}`} className="font-medium hover:underline">
        {m.title}
      </Link>
      <span className="text-xs text-muted">
        {m.hours} h · {m.assessment}
        {note ? ` · ${note}` : ""}
      </span>
      <span className="ml-auto">
        <ModuleStatusBadge status={m.status} />
      </span>
    </li>
  );
}

/** Track summary card for the overview grid. */
export function TrackCard({ track, modules }: { track: Track; modules: ModuleMeta[] }) {
  const hours = trackHours(track, modules);
  const beyondCore = [
    ...track.modules,
    ...(track.choice ?? []).map((g) => g.join(" or ")),
    ...(track.reduced ?? []).map((c) => `${c} (reading)`),
  ];
  return (
    <Link href={`/certification/tracks/${track.slug}`} className="card hover:border-muted transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="badge">level {track.level}</span>
        <TrackPhaseBadge phase={track.phase} />
      </div>
      <h3>{track.name}</h3>
      <p className="text-sm text-muted leading-relaxed">{track.summary}</p>
      <p className="text-xs text-muted mt-auto">
        {beyondCore.length ? `Core + ${beyondCore.join(", ")}` : "Core modules only"} · {hoursLabel(hours)}
      </p>
    </Link>
  );
}

/** Certificator card for the directory. */
export function CertificatorCard({
  c,
  tracks,
}: {
  c: Certificator;
  tracks: Track[];
}) {
  const trackNames = c.tracks
    .map((slug) => tracks.find((t) => t.slug === slug))
    .filter((t): t is Track => !!t);
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2">
        <CertificatorStatusBadge status={c.status} />
        {c.country ? <span className="font-mono text-xs text-muted">{c.country}</span> : null}
      </div>
      <h3>{c.name}</h3>
      {c.about ? <p className="text-sm text-muted leading-relaxed">{c.about}</p> : null}
      <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mt-1">
        <dt className="text-muted">Regions</dt>
        <dd>{c.regions.join(", ")}</dd>
        <dt className="text-muted">Languages</dt>
        <dd>{c.languages.map((l) => l.toUpperCase()).join(", ")}</dd>
        <dt className="text-muted">Tracks</dt>
        <dd className="flex flex-wrap gap-x-3 gap-y-1">
          {trackNames.map((t) => (
            <Link key={t.slug} href={`/certification/tracks/${t.slug}`} className="text-purple hover:underline">
              {t.name}
            </Link>
          ))}
        </dd>
      </dl>
      <a href={c.website} rel="noopener" className="text-sm text-purple hover:underline mt-1">
        {c.website.replace(/^https?:\/\//, "")} ↗
      </a>
    </div>
  );
}
