"use client";

import { useTransition } from "react";
import { startSession } from "./actions";

/** Opens (or reopens) the session record for an occurrence — leads only. */
export default function RecordButton({
  wgId,
  startIso,
  label = "Open session",
  primary = false,
}: {
  wgId: string;
  startIso: string;
  label?: string;
  primary?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={`btn text-sm${primary ? " btn-primary" : ""}`}
      disabled={pending}
      onClick={() => startTransition(() => startSession(wgId, startIso))}
    >
      {pending ? "Opening…" : label}
    </button>
  );
}
