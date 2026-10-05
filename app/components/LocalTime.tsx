"use client";

import { useEffect, useState } from "react";

export type LocalTimeFormat = "short" | "long" | "date" | "time";

const OPTIONS: Record<LocalTimeFormat, Intl.DateTimeFormatOptions> = {
  short: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  long: {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  },
  date: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit" },
};

function fmt(iso: string, format: LocalTimeFormat, timeZone?: string): string {
  const withTime = format !== "date";
  const label = new Intl.DateTimeFormat("en-GB", {
    ...OPTIONS[format],
    hour12: false,
    timeZone: timeZone ?? "UTC",
    timeZoneName: withTime && timeZone ? "short" : undefined,
  }).format(new Date(iso));
  return withTime && !timeZone ? `${label} UTC` : label;
}

/**
 * A date/time shown in the visitor's own timezone. Server render (and the
 * first client render) use UTC with an explicit "UTC" label so hydration is
 * deterministic; after mount it switches to the browser's timezone with its
 * short name (e.g. "CEST", "GMT-5").
 */
export default function LocalTime({
  iso,
  format = "short",
}: {
  iso: string;
  format?: LocalTimeFormat;
}) {
  const [label, setLabel] = useState(() => fmt(iso, format));
  useEffect(() => {
    setLabel(fmt(iso, format, Intl.DateTimeFormat().resolvedOptions().timeZone));
  }, [iso, format]);
  return <span suppressHydrationWarning>{label}</span>;
}
