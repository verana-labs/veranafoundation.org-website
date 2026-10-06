"use client";

import { useState, useTransition } from "react";
import { joinWg, leaveWg, withdrawJoinRequest } from "./actions";

export type JoinRequestStatus = "none" | "pending" | "declined";

// Join/leave a working group. Joining means Calendar invites + appearing in
// attendance and published minutes — said up front, per ADR-0003. Private
// groups take a request that a lead approves.
export default function JoinControls({
  wgId,
  signedIn,
  accessible,
  joined,
  lockReason,
  hasSchedule,
  transcribed,
  visibility,
  requestStatus,
}: {
  wgId: string;
  signedIn: boolean;
  accessible: boolean;
  joined: boolean;
  lockReason: string;
  hasSchedule: boolean;
  /** ADR-0004: meetings are transcribed and the minutes AI-drafted. */
  transcribed: boolean;
  visibility: "public" | "private";
  requestStatus: JoinRequestStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");

  if (!signedIn) {
    return (
      <p className="text-sm text-muted">
        <a href="/login" className="text-purple hover:underline">Sign in</a> to
        participate. {lockReason}
        {visibility === "private" && " This group is private: joining needs a lead's approval."}
      </p>
    );
  }
  if (!accessible && !joined) {
    return <p className="text-sm text-muted">{lockReason}</p>;
  }

  function run(fn: () => Promise<{ error?: string; message?: string }>) {
    startTransition(async () => {
      const res = await fn();
      setError(res.error ?? null);
      setMessage(res.message ?? null);
    });
  }

  const consent = (
    <>
      You&apos;ll be invited to the meetings in your calendar, and your name
      will appear on attendance lists and published minutes.
      {transcribed && (
        <>
          {" "}Meetings are transcribed automatically and an AI assistant
          drafts the minutes, which a group lead reviews before anything is
          published; transcripts stay internal to the group.
        </>
      )}
    </>
  );

  return (
    <div>
      {joined ? (
        <div className="flex flex-wrap items-center gap-4">
          <span className="badge badge-green">You&apos;re a participant</span>
          {hasSchedule && (
            <span className="text-sm text-muted">
              Meeting invitations arrive in your calendar automatically.
            </span>
          )}
          <button
            type="button"
            className="btn text-sm"
            disabled={pending}
            onClick={() => run(() => leaveWg(wgId))}
          >
            {pending ? "Leaving…" : "Leave group"}
          </button>
        </div>
      ) : visibility === "private" ? (
        requestStatus === "pending" ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="badge badge-amber">Request pending</span>
            <span className="text-sm text-muted">
              A lead will review your request; you&apos;ll be emailed either way.
            </span>
            <button
              type="button"
              className="btn text-sm"
              disabled={pending}
              onClick={() => run(() => withdrawJoinRequest(wgId))}
            >
              {pending ? "Withdrawing…" : "Withdraw request"}
            </button>
          </div>
        ) : (
          <div className="max-w-md">
            {requestStatus === "declined" && (
              <p className="text-sm text-muted mb-3">
                Your previous request was not approved. You may ask again, for
                instance after talking to a lead.
              </p>
            )}
            <div className="form-field">
              <label htmlFor="join-note">Message to the leads (optional)</label>
              <textarea
                id="join-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Who you are and why you'd like to take part"
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() => run(() => joinWg(wgId, note))}
            >
              {pending ? "Sending…" : requestStatus === "declined" ? "Request again" : "Request to join"}
            </button>
            <p className="text-sm text-muted mt-2">
              This group is private: a lead approves each request. Once approved,{" "}
              {consent}
            </p>
          </div>
        )
      ) : (
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => run(() => joinWg(wgId))}
          >
            {pending ? "Joining…" : "Join this working group"}
          </button>
          <p className="text-sm text-muted mt-2">{consent}</p>
        </div>
      )}
      {message && !error && (
        <p className="text-sm mt-2" style={{ color: "var(--color-green)" }}>{message}</p>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
