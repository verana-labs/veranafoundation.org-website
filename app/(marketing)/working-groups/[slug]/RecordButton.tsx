"use client";

import { useTransition } from "react";
import { startSession } from "./actions";

/** Opens (or reopens) the session record for an occurrence — note-taking. */
export default function RecordButton({
  wgId,
  startIso,
}: {
  wgId: string;
  startIso: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn text-sm"
      disabled={pending}
      onClick={() => startTransition(() => startSession(wgId, startIso))}
    >
      {pending ? "Opening…" : "Record session"}
    </button>
  );
}
