"use client";

import { useState, useTransition } from "react";
import { joinWg, leaveWg } from "./actions";

// Join/leave a working group. Joining means Calendar invites + appearing in
// attendance and published minutes — said up front, per ADR-0003.
export default function JoinControls({
  wgId,
  signedIn,
  accessible,
  joined,
  lockReason,
  hasSchedule,
}: {
  wgId: string;
  signedIn: boolean;
  accessible: boolean;
  joined: boolean;
  lockReason: string;
  hasSchedule: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <p className="text-sm text-muted">
        <a href="/login" className="text-purple hover:underline">Sign in</a> to
        participate. {lockReason}
      </p>
    );
  }
  if (!accessible && !joined) {
    return <p className="text-sm text-muted">{lockReason}</p>;
  }

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      setError(res.error ?? null);
    });
  }

  return (
    <div>
      {joined ? (
        <div className="flex flex-wrap items-center gap-4">
          <span className="badge badge-green">You're a participant</span>
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
          <p className="text-sm text-muted mt-2">
            You'll be invited to the meetings in your calendar, and your name
            will appear on attendance lists and published minutes.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
