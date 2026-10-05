"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import LocalTime from "@/app/components/LocalTime";
import { Markdown } from "@/app/components/Markdown";
import { elapsedLabel } from "@/app/lib/transcript-format";
import {
  deleteSession,
  discardDraft,
  publishSession,
  regenerateDraft,
  retryTranscript,
  saveSession,
  type ActionState,
} from "../../actions";

export type TranscriptStatus =
  | "awaiting_transcript"
  | "transcribed"
  | "summarized"
  | "awaiting_approval"
  | "approved"
  | "discarded"
  | "failed";

export type MeetAttendeeView = {
  name: string;
  kind: "signed_in" | "anonymous" | "phone";
  joinedAt: string | null;
  leftAt: string | null;
};

/** What the page passes about the meeting's transcript (ADR-0004). */
export type TranscriptView = {
  status: TranscriptStatus;
  entryCount: number;
  words: number;
  language: string | null;
  startedAtIso: string;
  summaryModel: string | null;
  summarizedAtIso: string | null;
  hasSummary: boolean;
  openQuestions: string[];
  lastError: string | null;
  publishTranscript: boolean;
  transcriptUrl: string | null;
  meetAttendees: MeetAttendeeView[];
  entries: { at: string; speaker: string; text: string }[];
};

const STATUS: Record<TranscriptStatus, { label: string; tone: string }> = {
  awaiting_transcript: { label: "Waiting for the Meet transcript", tone: "" },
  transcribed: { label: "Drafting the minutes", tone: "" },
  summarized: { label: "Drafting the minutes", tone: "" },
  awaiting_approval: { label: "AI draft awaiting review", tone: "badge-amber" },
  approved: { label: "AI draft approved", tone: "badge-green" },
  discarded: { label: "AI draft discarded", tone: "" },
  failed: { label: "Transcript pipeline failed", tone: "badge-red" },
};

const ACTIVE_AI: TranscriptStatus[] = ["transcribed", "summarized", "awaiting_approval", "failed"];

function splitGuests(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// One meeting's record. Leads tick attendance, edit the minutes (prefilled by
// the AI draft when there is one) and publish; participants read. Nothing is
// published without the lead's action.
export default function SessionEditor({
  sessionId,
  slug,
  status,
  source,
  notesMd,
  people,
  checked,
  guests,
  publishReady,
  aiReady,
  publishedUrl,
  canEdit,
  transcript,
}: {
  sessionId: string;
  slug: string;
  status: "draft" | "published";
  source: "manual" | "ai_draft";
  notesMd: string;
  people: { userId: string; name: string }[];
  checked: string[];
  guests: string[];
  publishReady: boolean;
  aiReady: boolean;
  publishedUrl: string | null;
  canEdit: boolean;
  transcript: TranscriptView | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState & { action?: string }>({});
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set(checked));
  const [guestText, setGuestText] = useState(guests.join(", "));
  const [notes, setNotes] = useState(notesMd);
  const [publishTranscript, setPublishTranscript] = useState(
    transcript?.publishTranscript ?? false,
  );

  const tickedNames = new Set(
    [
      ...people.filter((p) => checkedIds.has(p.userId)).map((p) => p.name),
      ...splitGuests(guestText),
    ].map((n) => n.toLowerCase()),
  );
  const unticked =
    transcript?.meetAttendees.filter((a) => !tickedNames.has(a.name.trim().toLowerCase())) ?? [];
  const aiDraft = source === "ai_draft" && !!transcript?.hasSummary;
  const transcriptAvailable = !!transcript && transcript.entryCount > 0;

  function formData(): FormData {
    const fd = new FormData();
    fd.set("sessionId", sessionId);
    fd.set("notesMd", notes);
    for (const id of checkedIds) fd.append("attendeeUserIds", id);
    fd.set("guests", guestText);
    if (publishTranscript) fd.set("publishTranscript", "on");
    return fd;
  }

  function run(action: string, fn: () => Promise<ActionState>, refresh = false) {
    startTransition(async () => {
      const res = await fn();
      setResult({ ...res, action });
      if (res.ok && refresh) router.refresh();
    });
  }

  function submit(action: "save" | "publish") {
    if (action === "publish") {
      const what =
        publishTranscript && transcriptAvailable ? "these minutes and the transcript" : "these minutes";
      if (!confirm(`Publish ${what}? They become a public record on GitHub and on this page.`)) return;
    }
    run(
      action,
      () => (action === "save" ? saveSession({}, formData()) : publishSession({}, formData())),
      action === "publish",
    );
  }

  function tickFromMeet(a: MeetAttendeeView) {
    const person = people.find((p) => p.name.toLowerCase() === a.name.trim().toLowerCase());
    if (person) {
      setCheckedIds(new Set([...checkedIds, person.userId]));
    } else {
      setGuestText(guestText.trim() ? `${guestText.trim()}, ${a.name}` : a.name);
    }
  }

  const badge = transcript ? STATUS[transcript.status] : null;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        {status === "published" ? (
          <span className="badge badge-green">Published</span>
        ) : (
          <span className="badge badge-amber">Draft</span>
        )}
        {badge && <span className={`badge ${badge.tone}`}>{badge.label}</span>}
        {publishedUrl && (
          <a href={publishedUrl} rel="noopener" className="text-sm text-purple hover:underline">
            Minutes on GitHub ↗
          </a>
        )}
        {transcript?.transcriptUrl && (
          <a href={transcript.transcriptUrl} rel="noopener" className="text-sm text-purple hover:underline">
            Transcript on GitHub ↗
          </a>
        )}
      </div>
      {!canEdit && (
        <p className="text-sm text-muted mt-3">
          Only the group&apos;s leads can edit sessions and publish minutes; you are
          viewing this session as a participant.
        </p>
      )}
      {transcript?.status === "failed" && (
        <div className="mt-3 text-sm">
          <p className="text-red-600">
            The transcript pipeline gave up: {transcript.lastError ?? "unknown error"}
          </p>
          {canEdit && (
            <button
              type="button"
              className="btn text-sm mt-2"
              disabled={pending}
              onClick={() => run("retry", () => retryTranscript(sessionId), true)}
            >
              Retry
            </button>
          )}
        </div>
      )}
      {transcript?.status === "awaiting_transcript" && (
        <p className="text-sm text-muted mt-3">
          Google Meet is still generating the transcript of this meeting; the
          draft minutes follow a few minutes after it lands.
        </p>
      )}

      {/* Attendance */}
      <h2 className="display text-xl mt-8">Attendance</h2>
      {canEdit ? (
        <>
          <p className="text-sm text-muted mt-1">
            Tick who is present. Names and emails come from their accounts; anyone
            else goes in the guests field.
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-x-8 gap-y-2">
            {people.map((p) => (
              <label key={p.userId} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checkedIds.has(p.userId)}
                  onChange={(e) => {
                    const next = new Set(checkedIds);
                    if (e.target.checked) next.add(p.userId);
                    else next.delete(p.userId);
                    setCheckedIds(next);
                  }}
                />
                {p.name}
              </label>
            ))}
            {people.length === 0 && (
              <p className="text-sm text-muted">Nobody has joined this group yet.</p>
            )}
          </div>
          <div className="form-field mt-4 max-w-md">
            <label htmlFor="guests">Guests (comma-separated)</label>
            <input
              id="guests"
              value={guestText}
              onChange={(e) => setGuestText(e.target.value)}
              placeholder="Jane Doe (Acme), …"
            />
          </div>
        </>
      ) : (
        <p className="text-sm mt-2">
          {[...people.filter((p) => checked.includes(p.userId)).map((p) => p.name), ...guests].join(
            ", ",
          ) || "No attendance recorded."}
        </p>
      )}

      {transcript && transcript.meetAttendees.length > 0 && (
        <div className="wg-tile mt-4 text-sm">
          <p className="font-medium">
            Google Meet saw {transcript.meetAttendees.length} participant
            {transcript.meetAttendees.length === 1 ? "" : "s"}
          </p>
          <p className="text-muted text-xs mt-1">
            A cross-check only: Meet reports display names, not accounts. Nothing is
            applied automatically.
          </p>
          <ul className="mt-2 space-y-1">
            {transcript.meetAttendees.map((a) => {
              const ticked = tickedNames.has(a.name.trim().toLowerCase());
              return (
                <li key={`${a.kind}:${a.name}:${a.joinedAt ?? ""}`} className="flex flex-wrap items-center gap-2">
                  <span>{a.name}</span>
                  {a.kind !== "signed_in" && (
                    <span className="badge">{a.kind === "phone" ? "phone" : "not signed in"}</span>
                  )}
                  {a.joinedAt && (
                    <span className="text-muted text-xs">
                      <LocalTime iso={a.joinedAt} format="time" />
                      {a.leftAt && (
                        <>
                          {" – "}
                          <LocalTime iso={a.leftAt} format="time" />
                        </>
                      )}
                    </span>
                  )}
                  {ticked ? (
                    <span className="badge badge-green">ticked</span>
                  ) : canEdit ? (
                    <button
                      type="button"
                      className="text-purple hover:underline text-xs"
                      onClick={() => tickFromMeet(a)}
                    >
                      {people.some((p) => p.name.toLowerCase() === a.name.trim().toLowerCase())
                        ? "Tick"
                        : "Add as guest"}
                    </button>
                  ) : (
                    <span className="badge badge-amber">not ticked</span>
                  )}
                </li>
              );
            })}
          </ul>
          {unticked.length === 0 && (
            <p className="text-xs text-muted mt-2">Everyone Meet saw is ticked.</p>
          )}
        </div>
      )}

      {/* Minutes */}
      <h2 className="display text-xl mt-10">Minutes</h2>
      {aiDraft && transcript && (
        <div className="wg-tile mt-3 text-sm" style={{ borderLeftColor: "var(--color-purple)" }}>
          <p>
            <strong>Drafted by an AI assistant</strong> ({transcript.summaryModel})
            {transcript.summarizedAtIso && (
              <>
                {" "}on <LocalTime iso={transcript.summarizedAtIso} format="long" />
              </>
            )}
            , from the meeting transcript. Automatic transcripts contain recognition
            errors: read the draft critically and edit it before publishing.
          </p>
          {transcript.openQuestions.length > 0 && (
            <>
              <p className="font-medium mt-3">Open questions to check</p>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                {transcript.openQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {canEdit ? (
        <>
          <p className="text-sm text-muted mt-2">
            Markdown. On publish this becomes
            {" "}<code>{slug}/minutes/&lt;date&gt;.md</code> in the public minutes
            repository.
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={22}
            className="mt-3 w-full font-mono text-sm"
            placeholder={"## Agenda\n\n## Discussion\n\n## Decisions\n\n## Action items"}
          />
        </>
      ) : notes.trim() ? (
        <div className="mt-3">
          <Markdown source={notes} />
        </div>
      ) : (
        <p className="text-sm text-muted mt-2">No minutes yet.</p>
      )}

      {/* Transcript */}
      {transcript && transcriptAvailable && (
        <details className="wg-tile mt-8">
          <summary className="cursor-pointer font-medium text-sm">
            Transcript · {transcript.entryCount} entries · {transcript.words} words
            {transcript.language ? ` · ${transcript.language}` : ""}
            {" · "}internal to the group
          </summary>
          <p className="text-xs text-muted mt-2">
            Automatic transcription by Google Meet; times are elapsed since the
            meeting started.
          </p>
          <ol className="mt-3 space-y-1 text-sm max-h-[32rem] overflow-y-auto">
            {transcript.entries.map((e, i) => (
              <li key={i}>
                <span className="font-mono text-xs text-muted">
                  [{elapsedLabel(new Date(transcript.startedAtIso), new Date(e.at))}]
                </span>{" "}
                <span className="font-medium">{e.speaker}:</span> {e.text}
              </li>
            ))}
          </ol>
        </details>
      )}
      {canEdit && transcript && transcriptAvailable && (
        <label className="flex items-start gap-2 text-sm mt-4">
          <input
            type="checkbox"
            className="mt-1"
            checked={publishTranscript}
            onChange={(e) => setPublishTranscript(e.target.checked)}
          />
          <span>
            Also publish the transcript next to the minutes (
            <code>{slug}/transcripts/&lt;date&gt;.md</code>, public). Off by default:
            transcripts stay internal to the group unless a lead opts in for this
            meeting.
          </span>
        </label>
      )}

      {result.error && <p className="text-sm text-red-600 mt-4">{result.error}</p>}
      {result.ok && !pending && (
        <p className="text-sm mt-4" style={{ color: "var(--color-green)" }}>
          {result.message ?? (result.action === "publish" ? "Published." : "Draft saved.")}
        </p>
      )}
      {canEdit && !publishReady && (
        <p className="text-sm text-amber-700 mt-3">
          The minutes repository isn&apos;t configured on this server — you can keep
          drafting, but publishing will fail until it is.
        </p>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2 mt-5">
          <button type="button" className="btn text-sm" disabled={pending} onClick={() => submit("save")}>
            {pending ? "Working…" : "Save draft"}
          </button>
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={pending}
            onClick={() => submit("publish")}
          >
            {status === "published"
              ? "Republish"
              : aiDraft && transcript?.status === "awaiting_approval"
                ? "Approve & publish"
                : "Publish minutes"}
          </button>
          {transcriptAvailable && aiReady && status === "draft" && (
            <button
              type="button"
              className="btn text-sm"
              disabled={pending || transcript?.status === "transcribed"}
              onClick={() => {
                if (!confirm("Regenerate the AI draft? Your edits to the minutes are kept only if you saved them as something different from the previous draft.")) return;
                run("regenerate", () => regenerateDraft(sessionId), true);
              }}
            >
              Regenerate draft
            </button>
          )}
          {transcript && ACTIVE_AI.includes(transcript.status) && status === "draft" && (
            <button
              type="button"
              className="btn text-sm"
              disabled={pending}
              onClick={() => {
                if (!confirm("Discard the AI draft? The transcript stays internal to the group; you can still write minutes by hand.")) return;
                run("discard", () => discardDraft(sessionId), true);
              }}
            >
              Discard AI draft
            </button>
          )}
          {status === "draft" && (
            <button
              type="button"
              className="btn text-sm"
              disabled={pending}
              onClick={() => {
                if (!confirm("Delete this draft session record (and its transcript)?")) return;
                startTransition(async () => {
                  const res = await deleteSession(sessionId);
                  if (res.error) setResult(res);
                  else router.push(`/working-groups/${slug}`);
                });
              }}
            >
              Delete draft
            </button>
          )}
        </div>
      )}
    </div>
  );
}
