import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { isWgLead, personName } from "@/app/lib/working-groups";
import { minutesConfigured, minutesUrl } from "@/app/lib/minutes";
import SessionEditor from "./SessionEditor";

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
    },
  });
  if (!session || session.wg.slug !== slug) notFound();

  // Editable by participants, leads, admins (the recorder is one of those).
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

  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(session.occurredAt);

  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">
            <a href={`/working-groups/${slug}`} className="hover:underline">
              {session.wg.name}
            </a>
          </p>
          <h1 className="display text-4xl leading-tight">Session — {day}</h1>
          <div className="accent-line mt-6" />
        </div>
      </section>
      <section>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <SessionEditor
            sessionId={session.id}
            slug={slug}
            status={session.status}
            notesMd={session.notesMd}
            people={[...people.values()]}
            checked={session.attendees.filter((a) => a.userId).map((a) => a.userId!)}
            guests={session.attendees.filter((a) => !a.userId).map((a) => a.name)}
            publishReady={minutesConfigured()}
            publishedUrl={
              session.notesPath && session.notesCommitSha
                ? minutesUrl(session.notesPath, session.notesCommitSha)
                : null
            }
          />
        </div>
      </section>
    </>
  );
}
