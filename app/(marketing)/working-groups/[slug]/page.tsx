import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser, isAdmin } from "@/app/lib/authz";
import {
  canAccessWg,
  getWgBySlug,
  lockReason,
  sessionPhase,
  upcomingOccurrences,
  userActiveClasses,
  wgLeads,
  wgParticipants,
} from "@/app/lib/working-groups";
import { describeRrule } from "@/app/lib/recurrence";
import { minutesUrl } from "@/app/lib/minutes";
import { minutesAiConfigured } from "@/app/lib/minutes-ai";
import { calendarConfigured } from "@/app/lib/google-calendar";
import PersonAvatars from "@/app/components/PersonAvatars";
import LocalTime from "@/app/components/LocalTime";
import { Markdown } from "@/app/components/Markdown";
import JoinControls from "./JoinControls";
import LeadConsole from "./LeadConsole";
import RecordButton from "./RecordButton";

// Per-request: membership, participation and lead views differ by visitor.
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const wg = await getWgBySlug((await params).slug);
  return { title: wg ? `${wg.name} · Working groups` : "Working group" };
}

type TranscriptState = {
  status: string;
  lastError: string | null;
  entryCount: number;
} | null;

/** The pipeline badge a lead sees on a draft session (ADR-0004). */
function draftBadge(t: TranscriptState): { label: string; tone: string } | null {
  if (!t) return null;
  switch (t.status) {
    case "awaiting_transcript":
      return { label: "Transcribing", tone: "" };
    case "transcribed":
    case "summarized":
      return { label: "Drafting minutes", tone: "" };
    case "awaiting_approval":
      return { label: "AI draft to review", tone: "badge-amber" };
    case "failed":
      return { label: "Pipeline failed", tone: "badge-red" };
    case "discarded":
      return { label: "AI draft discarded", tone: "" };
    default:
      return null;
  }
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

  const now = new Date();
  const leads = wgLeads(wg);
  const participants = wgParticipants(wg);
  const occurrences = wg.schedule ? upcomingOccurrences(wg.schedule, 6, now) : [];
  const published = wg.sessions.filter((s) => s.status === "published");
  // Drafts are for the group only. A session the pipeline opened and then
  // discarded (no transcript, nobody touched it) is noise: hidden.
  const drafts =
    joined || lead
      ? wg.sessions.filter(
          (s) =>
            s.status === "draft" &&
            !(
              s.source === "ai_draft" &&
              s.transcript?.status === "discarded" &&
              s.notesMd.trim() === "" &&
              s.attendees.length === 0
            ),
        )
      : [];

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
              <p className="mt-1 text-sm text-muted">
                Dates below are shown in your own timezone.
                {wg.autoMinutes && (
                  <>
                    {" "}Meetings are transcribed automatically; an AI assistant drafts
                    the minutes, which a lead reviews before publication. Transcripts
                    stay internal to the group.
                  </>
                )}
              </p>
              {(joined || lead) && wg.schedule.meetLink && (
                <p className="mt-3">
                  <a href={wg.schedule.meetLink} rel="noopener" className="btn btn-primary text-sm">
                    Join the meeting (Google Meet)
                  </a>
                </p>
              )}
              <ul className="mt-6 space-y-2 max-w-2xl">
                {occurrences.map((o) => {
                  const phase = sessionPhase(o.start, wg.schedule!.durationMin, now);
                  const struck = o.cancelled || !!o.movedTo;
                  const current = !struck && (phase === "soon" || phase === "live");
                  const openable =
                    lead &&
                    !struck &&
                    (current || (phase === "upcoming" && o.start.getTime() < now.getTime() + DAY_MS));
                  return (
                    <li
                      key={`${o.start.toISOString()}:${o.originalStart.toISOString()}`}
                      className="wg-tile flex flex-wrap items-center justify-between gap-3"
                    >
                      <span className={struck ? "line-through text-muted" : ""}>
                        <LocalTime iso={o.start.toISOString()} format="long" />
                        {phase === "live" && !struck && (
                          <span className="badge badge-green ml-3 no-underline">In progress</span>
                        )}
                        {o.cancelled && (
                          <span className="no-underline"> — cancelled{o.note ? ` (${o.note})` : ""}</span>
                        )}
                        {o.movedTo && (
                          <span className="no-underline">
                            {" "}— moved to <LocalTime iso={o.movedTo.toISOString()} format="long" />
                            {o.note ? ` (${o.note})` : ""}
                          </span>
                        )}
                        {o.movedFrom && (
                          <span className="badge badge-amber ml-3 no-underline">
                            moved from <LocalTime iso={o.movedFrom.toISOString()} format="date" />
                          </span>
                        )}
                      </span>
                      {openable && (
                        <RecordButton
                          wgId={wg.id}
                          startIso={o.start.toISOString()}
                          label={current ? "Current session" : "Open session"}
                          primary={current}
                        />
                      )}
                    </li>
                  );
                })}
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
              transcribed={wg.autoMinutes}
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
              {drafts.map((s) => {
                const badge = lead ? draftBadge(s.transcript) : null;
                return (
                  <div key={s.id} className="wg-tile flex flex-wrap items-center justify-between gap-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <LocalTime iso={s.occurredAt.toISOString()} format="long" />
                      <span className="badge badge-amber">Draft</span>
                      {badge && <span className={`badge ${badge.tone}`}>{badge.label}</span>}
                    </span>
                    <a href={`/working-groups/${wg.slug}/sessions/${s.id}`} className="btn text-sm">
                      {lead && s.transcript?.status === "awaiting_approval" ? "Review" : "Open"}
                    </a>
                  </div>
                );
              })}
              {published.map((s) => {
                const gh = s.notesPath && s.notesCommitSha
                  ? minutesUrl(s.notesPath, s.notesCommitSha)
                  : null;
                const transcriptUrl =
                  s.transcript?.transcriptPath && s.transcript.transcriptCommitSha
                    ? minutesUrl(s.transcript.transcriptPath, s.transcript.transcriptCommitSha)
                    : null;
                const recorder = s.recordedBy
                  ? (s.recordedBy.displayName ?? s.recordedBy.name ?? "—")
                  : "—";
                return (
                  <details key={s.id} className="wg-tile">
                    <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-3">
                      <span className="font-medium">
                        <LocalTime iso={s.occurredAt.toISOString()} format="long" />
                      </span>
                      <span className="text-sm text-muted">
                        {s.attendees.length} attendee{s.attendees.length === 1 ? "" : "s"}
                        {s.source === "ai_draft"
                          ? ` · AI draft approved by ${recorder}`
                          : ` · recorded by ${recorder}`}
                      </span>
                    </summary>
                    <div className="mt-4 text-sm">
                      <p className="text-muted">
                        Attendees: {s.attendees.map((a) => a.name).join(", ") || "—"}
                      </p>
                      <div className="mt-3">
                        <Markdown source={s.notesMd} />
                      </div>
                      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                        {gh && (
                          <a href={gh} rel="noopener" className="text-purple hover:underline">
                            Published record on GitHub ↗
                          </a>
                        )}
                        {transcriptUrl && (
                          <a href={transcriptUrl} rel="noopener" className="text-purple hover:underline">
                            Transcript on GitHub ↗
                          </a>
                        )}
                        {(joined || lead) && (
                          <a
                            href={`/working-groups/${wg.slug}/sessions/${s.id}`}
                            className="text-purple hover:underline"
                          >
                            {lead ? "Edit & republish" : "Open session"}
                          </a>
                        )}
                      </p>
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
              aiReady={minutesAiConfigured()}
              settings={{ autoMinutes: wg.autoMinutes, language: wg.language }}
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
                      meetingCode: wg.schedule.meetingCode,
                      meetSpaceName: wg.schedule.meetSpaceName,
                      meetAutoTranscribe: wg.schedule.meetAutoTranscribe,
                      meetConfiguredAt: wg.schedule.meetConfiguredAt?.toISOString() ?? null,
                      meetConfigError: wg.schedule.meetConfigError,
                      meetMembersSyncedAt: wg.schedule.meetMembersSyncedAt?.toISOString() ?? null,
                      meetMembersError: wg.schedule.meetMembersError,
                    }
                  : null
              }
              occurrences={occurrences.map((o) => ({
                startIso: o.start.toISOString(),
                originalStartIso: o.originalStart.toISOString(),
                cancelled: o.cancelled,
                movedToIso: o.movedTo?.toISOString() ?? null,
                movedFromIso: o.movedFrom?.toISOString() ?? null,
                note: o.note,
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
