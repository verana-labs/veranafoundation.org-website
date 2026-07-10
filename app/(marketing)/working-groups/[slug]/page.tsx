import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser, isAdmin } from "@/app/lib/authz";
import {
  canAccessWg,
  getWgBySlug,
  lockReason,
  upcomingOccurrences,
  userActiveClasses,
  wgLeads,
  wgParticipants,
} from "@/app/lib/working-groups";
import { describeRrule } from "@/app/lib/recurrence";
import { minutesUrl } from "@/app/lib/minutes";
import { calendarConfigured } from "@/app/lib/google-calendar";
import PersonAvatars from "@/app/components/PersonAvatars";
import JoinControls from "./JoinControls";
import LeadConsole from "./LeadConsole";
import RecordButton from "./RecordButton";

// Per-request: membership, participation and lead views differ by visitor.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const wg = await getWgBySlug((await params).slug);
  return { title: wg ? `${wg.name} · Working groups` : "Working group" };
}

function fmtOccurrence(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: tz,
  }).format(d);
}

export default async function WorkingGroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const wg = await getWgBySlug(slug);
  if (!wg || wg.state !== "enabled") notFound();

  const user = await currentUser();
  const classes = user?.id
    ? await userActiveClasses(user.id)
    : new Set<"contributor" | "associate">();
  const accessible = !!user?.id && canAccessWg(wg.requiredClass, classes);
  const joined =
    !!user?.id && wg.participants.some((p) => p.userId === user.id);
  const lead =
    !!user?.id &&
    (wg.leads.some((l) => l.userId === user.id) ||
      (user.email ? await isAdmin(user.email) : false));

  const leads = wgLeads(wg);
  const participants = wgParticipants(wg);
  const occurrences = wg.schedule ? upcomingOccurrences(wg.schedule, 6) : [];
  const published = wg.sessions.filter((s) => s.status === "published");
  const drafts = joined || lead ? wg.sessions.filter((s) => s.status === "draft") : [];

  return (
    <>
      {/* Hero — same full-bleed, rule-separated pattern as the marketing pages */}
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Working group</p>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="display text-4xl sm:text-5xl leading-tight">{wg.name}</h1>
            <span className={`badge ${wg.requiredClass === "associate" ? "badge-purple" : ""}`}>
              {wg.requiredClass === "associate" ? "Associate only" : "Associate or Contributor"}
            </span>
          </div>
          <div className="accent-line mt-6" />
          {wg.description && (
            <p className="mt-8 text-lg text-muted max-w-2xl leading-relaxed">
              {wg.description}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            {leads.length > 0 && (
              <div className="flex items-center gap-3">
                <PersonAvatars people={leads} size={32} />
                <div className="text-sm">
                  <p className="text-muted">Led by</p>
                  <p className="font-medium">{leads.map((l) => l.name).join(", ")}</p>
                </div>
              </div>
            )}
            {participants.length > 0 && (
              <div className="flex items-center gap-3">
                <PersonAvatars people={participants} size={32} />
                <div className="text-sm">
                  <p className="text-muted">Participants</p>
                  <p className="font-medium">{participants.length}</p>
                </div>
              </div>
            )}
            {wg.link && (
              <a href={wg.link} rel="noopener" className="btn text-sm">
                Group space ↗
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Meetings */}
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="display text-2xl">Meetings</h2>

          {wg.schedule ? (
            <>
              <p className="mt-3 text-muted">
                {describeRrule(wg.schedule.rrule, wg.schedule.startsAt, wg.schedule.timezone)}
                {" · "}{wg.schedule.durationMin} min
              </p>
              {(joined || lead) && wg.schedule.meetLink && (
                <p className="mt-3">
                  <a href={wg.schedule.meetLink} rel="noopener" className="btn btn-primary text-sm">
                    Join the meeting (Google Meet)
                  </a>
                </p>
              )}
              <ul className="mt-6 space-y-2 max-w-2xl">
                {occurrences.map((o) => (
                  <li
                    key={o.start.toISOString()}
                    className="wg-tile flex flex-wrap items-center justify-between gap-3"
                  >
                    <span className={o.cancelled ? "line-through text-muted" : ""}>
                      {fmtOccurrence(o.start, wg.schedule!.timezone)}
                      {o.cancelled && (
                        <span className="no-underline"> — cancelled{o.note ? ` (${o.note})` : ""}</span>
                      )}
                    </span>
                    {(joined || lead) && !o.cancelled && o.start < new Date(Date.now() + 86_400_000) && (
                      <RecordButton wgId={wg.id} startIso={o.start.toISOString()} />
                    )}
                  </li>
                ))}
                {occurrences.length === 0 && (
                  <li className="text-sm text-muted">No upcoming meetings.</li>
                )}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-muted">
              No meeting schedule yet{lead ? " — set one below." : "."}
            </p>
          )}

          <div className="mt-8">
            <JoinControls
              wgId={wg.id}
              signedIn={!!user}
              accessible={accessible}
              joined={joined}
              lockReason={lockReason(wg.requiredClass)}
              hasSchedule={!!wg.schedule}
            />
          </div>
        </div>
      </section>

      {/* Sessions & minutes */}
      <section className={lead ? "border-b border-rule" : ""}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="display text-2xl">Past sessions &amp; minutes</h2>
          {published.length === 0 && drafts.length === 0 ? (
            <p className="mt-3 text-muted">No recorded sessions yet.</p>
          ) : (
            <div className="mt-6 space-y-4 max-w-3xl">
              {drafts.map((s) => (
                <div key={s.id} className="wg-tile flex items-center justify-between gap-3">
                  <span>
                    {fmtOccurrence(s.occurredAt, wg.schedule?.timezone ?? "UTC")}
                    <span className="badge badge-amber ml-3">Draft</span>
                  </span>
                  <a href={`/working-groups/${wg.slug}/sessions/${s.id}`} className="btn text-sm">
                    Open
                  </a>
                </div>
              ))}
              {published.map((s) => {
                const gh = s.notesPath && s.notesCommitSha
                  ? minutesUrl(s.notesPath, s.notesCommitSha)
                  : null;
                return (
                  <details key={s.id} className="wg-tile">
                    <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-3">
                      <span className="font-medium">
                        {fmtOccurrence(s.occurredAt, wg.schedule?.timezone ?? "UTC")}
                      </span>
                      <span className="text-sm text-muted">
                        {s.attendees.length} attendee{s.attendees.length === 1 ? "" : "s"}
                        {" · recorded by "}
                        {s.recordedBy.displayName ?? s.recordedBy.name ?? "—"}
                      </span>
                    </summary>
                    <div className="mt-4 text-sm">
                      <p className="text-muted">
                        Attendees: {s.attendees.map((a) => a.name).join(", ") || "—"}
                      </p>
                      <pre className="whitespace-pre-wrap font-sans mt-3 leading-relaxed">
                        {s.notesMd}
                      </pre>
                      {gh && (
                        <p className="mt-3">
                          <a href={gh} rel="noopener" className="text-purple hover:underline">
                            Published record on GitHub ↗
                          </a>
                        </p>
                      )}
                      {(joined || lead) && (
                        <p className="mt-2">
                          <a
                            href={`/working-groups/${wg.slug}/sessions/${s.id}`}
                            className="text-purple hover:underline"
                          >
                            Edit &amp; republish
                          </a>
                        </p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Lead console */}
      {lead && (
        <section>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <h2 className="display text-2xl">Lead console</h2>
            <LeadConsole
              wgId={wg.id}
              calendarReady={calendarConfigured()}
              schedule={
                wg.schedule
                  ? {
                      startsAt: wg.schedule.startsAt.toISOString(),
                      timezone: wg.schedule.timezone,
                      durationMin: wg.schedule.durationMin,
                      rrule: wg.schedule.rrule,
                      syncedAt: wg.schedule.syncedAt?.toISOString() ?? null,
                      syncError: wg.schedule.syncError,
                      meetLink: wg.schedule.meetLink,
                    }
                  : null
              }
              occurrences={occurrences.map((o) => ({
                startIso: o.start.toISOString(),
                label: fmtOccurrence(o.start, wg.schedule?.timezone ?? "UTC"),
                cancelled: o.cancelled,
              }))}
              leads={leads}
              participants={participants}
              invites={wg.invites.map((i) => ({
                id: i.id,
                email: i.email,
                role: i.role,
              }))}
            />
          </div>
        </section>
      )}
    </>
  );
}
