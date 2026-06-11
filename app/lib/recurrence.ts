/**
 * Recurrence helpers for WG schedules (ADR-0003). The schedule editor only
 * generates a small RRULE grammar — weekly / every-2-weeks / monthly-nth-weekday
 * — and this module expands it to concrete occurrences for the site UI.
 * Google Calendar does its own expansion from the same RRULE; occurrences are
 * "same wall-clock time in the schedule's timezone", so expansion here is done
 * in wall time and converted back to UTC (DST-correct).
 */

export type Frequency = "weekly" | "biweekly" | "monthly";

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;
const NTH = ["first", "second", "third", "fourth", "fifth"] as const;

type Wall = { y: number; mo: number; d: number; h: number; mi: number };

/** Wall-clock parts of a UTC instant in a timezone. */
export function utcToWall(date: Date, tz: string): Wall & { weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", weekday: "short", hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    mo: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")) % 24, // Intl may emit "24" at midnight
    mi: Number(get("minute")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      get("weekday"),
    ),
  };
}

/** UTC instant of a wall-clock time in a timezone (two-pass offset fix-up). */
export function wallToUtc(w: Wall, tz: string): Date {
  let ts = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi);
  for (let i = 0; i < 2; i++) {
    const seen = utcToWall(new Date(ts), tz);
    ts += Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi)
        - Date.UTC(seen.y, seen.mo - 1, seen.d, seen.h, seen.mi);
  }
  return new Date(ts);
}

/** Build the RRULE for a frequency anchored at the first occurrence. */
export function buildRrule(freq: Frequency, startsAt: Date, tz: string): string {
  const w = utcToWall(startsAt, tz);
  const byday = BYDAY[w.weekday];
  switch (freq) {
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${byday}`;
    case "biweekly":
      return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${byday}`;
    case "monthly": {
      const nth = Math.ceil(w.d / 7); // nth weekday-of-month of the anchor date
      return `FREQ=MONTHLY;BYDAY=${nth}${byday}`;
    }
  }
}

type ParsedRule =
  | { kind: "weekly"; interval: number }
  | { kind: "monthly"; nth: number; weekday: number };

export function parseRrule(rrule: string): ParsedRule | null {
  const fields = new Map(
    rrule.split(";").map((kv) => kv.split("=") as [string, string]),
  );
  const freq = fields.get("FREQ");
  if (freq === "WEEKLY") {
    return { kind: "weekly", interval: Number(fields.get("INTERVAL") ?? "1") };
  }
  if (freq === "MONTHLY") {
    const m = /^(\d)([A-Z]{2})$/.exec(fields.get("BYDAY") ?? "");
    if (!m) return null;
    const weekday = BYDAY.indexOf(m[2] as (typeof BYDAY)[number]);
    if (weekday < 0) return null;
    return { kind: "monthly", nth: Number(m[1]), weekday };
  }
  return null;
}

/** Human label, e.g. "Every 2 weeks on Wednesday at 17:00 (Europe/Paris)". */
export function describeRrule(rrule: string, startsAt: Date, tz: string): string {
  const rule = parseRrule(rrule);
  const w = utcToWall(startsAt, tz);
  const time = `${String(w.h).padStart(2, "0")}:${String(w.mi).padStart(2, "0")}`;
  const day = DAY_NAMES[rule?.kind === "monthly" ? rule.weekday : w.weekday];
  let cadence = "Weekly";
  if (rule?.kind === "weekly" && rule.interval > 1) {
    cadence = `Every ${rule.interval} weeks`;
  } else if (rule?.kind === "monthly") {
    cadence = `Monthly (${NTH[rule.nth - 1] ?? `${rule.nth}th`} ${day})`;
  }
  return rule?.kind === "monthly"
    ? `${cadence} at ${time} (${tz})`
    : `${cadence} on ${day} at ${time} (${tz})`;
}

/** UTC start of the nth `weekday` of a month, at the given wall time. */
function nthWeekdayOfMonth(
  y: number, mo: number, nth: number, weekday: number,
  h: number, mi: number, tz: string,
): Date | null {
  const firstDow = new Date(Date.UTC(y, mo - 1, 1, 12)).getUTCDay();
  const d = 1 + ((weekday - firstDow + 7) % 7) + (nth - 1) * 7;
  if (d > new Date(Date.UTC(y, mo, 0, 12)).getUTCDate()) return null; // no 5th X
  return wallToUtc({ y, mo, d, h, mi }, tz);
}

/**
 * The next `count` occurrences at/after `from`. Pure wall-time arithmetic:
 * weekly steps add days to the wall date; monthly recomputes the nth weekday —
 * both then resolve through the timezone, so DST shifts keep the local time.
 */
export function nextOccurrences(
  startsAt: Date,
  tz: string,
  rrule: string,
  from: Date,
  count: number,
): Date[] {
  const rule = parseRrule(rrule);
  if (!rule) return [];
  const anchor = utcToWall(startsAt, tz);
  const out: Date[] = [];

  if (rule.kind === "weekly") {
    // Iterate k steps of `interval` weeks from the anchor wall date.
    const stepMs = rule.interval * 7 * 86_400_000;
    const k0 = Math.max(
      0,
      Math.floor((from.getTime() - startsAt.getTime()) / stepMs) - 1,
    );
    for (let k = k0; out.length < count && k < k0 + count + 110; k++) {
      const base = new Date(Date.UTC(anchor.y, anchor.mo - 1, anchor.d, 12));
      base.setUTCDate(base.getUTCDate() + k * rule.interval * 7);
      const occ = wallToUtc(
        { y: base.getUTCFullYear(), mo: base.getUTCMonth() + 1,
          d: base.getUTCDate(), h: anchor.h, mi: anchor.mi },
        tz,
      );
      if (occ >= from && occ >= startsAt) out.push(occ);
    }
  } else {
    let y = anchor.y, mo = anchor.mo;
    for (let i = 0; out.length < count && i < count + 26; i++) {
      const occ = nthWeekdayOfMonth(y, mo, rule.nth, rule.weekday, anchor.h, anchor.mi, tz);
      if (occ && occ >= from && occ >= startsAt) out.push(occ);
      mo++;
      if (mo > 12) { mo = 1; y++; }
    }
  }
  return out;
}
