"use client";

import { useEffect, useState } from "react";

function fmt(iso: string, timeZone?: string): string {
  const label = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone ?? "UTC",
    timeZoneName: timeZone ? "short" : undefined,
  }).format(new Date(iso));
  return timeZone ? label : `${label} UTC`;
}

/**
 * A meeting time, shown in the visitor's own timezone. Server render (and the
 * first client render) use UTC with an explicit "UTC" label so hydration is
 * deterministic; after mount it switches to the browser's timezone with its
 * short name (e.g. "CEST", "GMT-5").
 */
export default function LocalTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => fmt(iso));
  useEffect(() => {
    setLabel(fmt(iso, Intl.DateTimeFormat().resolvedOptions().timeZone));
  }, [iso]);
  return <span suppressHydrationWarning>{label}</span>;
}
