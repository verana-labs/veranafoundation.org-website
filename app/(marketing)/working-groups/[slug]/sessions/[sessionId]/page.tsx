import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { isWgLead, personName } from "@/app/lib/working-groups";
import { minutesConfigured, minutesTargetFor, minutesUrl } from "@/app/lib/minutes";
import { minutesAiConfigured } from "@/app/lib/minutes-ai";
import {
  wordCount,
  type MeetAttendee,
  type TranscriptEntry,
} from "@/app/lib/transcript-format";
import LocalTime from "@/app/components/LocalTime";
import SessionEditor, { type TranscriptView } from "./SessionEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Session record" };

export default async function SessionPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = await params;
  const user = await currentUser();
  if (!user?.id) redirect("/login");

  const session = await db.wgSession.findUnique({
    where: { id: sessionId },
    include: {
      wg: {
        include: {
          leads: { include: { user: true } },
          participants: { where: { leftAt: null }, include: { user: true } },
        },
      },
      attendees: true,
      transcript: true,
    },
  });
  if (!session || session.wg.slug !== slug) notFound();

  // ADR-0004: leads (and admins) edit; active participants read; others 404.
  const lead =
    (await isWgLead(user.id, session.wgId)) ||
    (user.email ? await isAdmin(user.email) : false);
  const participant = session.wg.participants.some((p) => p.userId === user.id);
  if (!lead && !participant) notFound();

  // Attendance picker = leads ∪ active participants, de-duplicated.
  const people = new Map<string, { userId: string; name: string }>();
  for (const l of session.wg.leads) {
    people.set(l.userId, { userId: l.userId, name: personName(l.user) });
  }
  for (const p of session.wg.participants) {
    people.set(p.userId, { userId: p.userId, name: personName(p.user) });
  }

  const target = minutesTargetFor(session.wg.visibility);
  const t = session.transcript;
  const entries = ((t?.entries ?? []) as unknown as TranscriptEntry[]) ?? [];
  const transcript: TranscriptView | null = t
    ? {
        status: t.status,
        entryCount: t.entryCount,
        words: wordCount(entries),
        language: t.language,
        startedAtIso: t.startedAt.toISOString(),
        summaryModel: t.summaryModel,
        summarizedAtIso: t.summarizedAt?.toISOString() ?? null,
        hasSummary: !!t.summaryMd,
        openQuestions: (t.openQuestions as string[] | null) ?? [],
        lastError: t.lastError,
        publishTranscript: t.publishTranscript,
        transcriptUrl:
          t.transcriptPath && t.transcriptCommitSha
            ? minutesUrl(t.transcriptPath, t.transcriptCommitSha, target)
            : null,
        meetAttendees: ((t.meetParticipants ?? []) as unknown as MeetAttendee[]).map((a) => ({
          name: a.name,
          kind: a.kind,
          joinedAt: a.joinedAt,
          leftAt: a.leftAt,
        })),
        entries: entries.map((e) => ({ at: e.at, speaker: e.speaker, text: e.text })),
      }
    : null;

  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">
            <a href={`/working-groups/${slug}`} className="hover:underline">
              {session.wg.name}
            </a>
          </p>
          <h1 className="display text-4xl leading-tight">
            Session · <LocalTime iso={session.occurredAt.toISOString()} format="long" />
          </h1>
          <div className="accent-line mt-6" />
        </div>
      </section>
      <section>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <SessionEditor
            // Remount on any server-side change so the controlled fields reset.
            key={`${session.updatedAt.toISOString()}:${t?.updatedAt.toISOString() ?? ""}`}
            sessionId={session.id}
            slug={slug}
            status={session.status}
            source={session.source}
            notesMd={session.notesMd}
            people={[...people.values()]}
            checked={session.attendees.filter((a) => a.userId).map((a) => a.userId!)}
            guests={session.attendees.filter((a) => !a.userId).map((a) => a.name)}
            publishReady={minutesConfigured(target)}
            aiReady={minutesAiConfigured()}
            publishedUrl={
              session.notesPath && session.notesCommitSha
                ? minutesUrl(session.notesPath, session.notesCommitSha, target)
                : null
            }
            canEdit={lead}
            transcript={transcript}
          />
        </div>
      </section>
    </>
  );
}
