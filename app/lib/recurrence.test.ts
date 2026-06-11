import { describe, expect, it } from "vitest";
import {
  buildRrule,
  describeRrule,
  nextOccurrences,
  utcToWall,
  wallToUtc,
} from "./recurrence";

// Wed 2026-06-17 17:00 Europe/Paris (CEST, UTC+2) = 15:00Z
const PARIS = "Europe/Paris";
const START = new Date("2026-06-17T15:00:00.000Z");

describe("wall time conversion", () => {
  it("round-trips through a timezone", () => {
    const w = utcToWall(START, PARIS);
    expect([w.y, w.mo, w.d, w.h, w.mi]).toEqual([2026, 6, 17, 17, 0]);
    expect(wallToUtc(w, PARIS).toISOString()).toBe(START.toISOString());
  });
});

describe("buildRrule", () => {
  it("derives weekday and nth from the anchor", () => {
    expect(buildRrule("weekly", START, PARIS)).toBe("FREQ=WEEKLY;BYDAY=WE");
    expect(buildRrule("biweekly", START, PARIS)).toBe(
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=WE",
    );
    // June 17 is the 3rd Wednesday of June 2026.
    expect(buildRrule("monthly", START, PARIS)).toBe("FREQ=MONTHLY;BYDAY=3WE");
  });
});

describe("nextOccurrences", () => {
  it("expands weekly occurrences and keeps local time across DST", () => {
    const occ = nextOccurrences(
      START, PARIS, "FREQ=WEEKLY;BYDAY=WE",
      new Date("2026-10-20T00:00:00Z"), 3,
    );
    // CEST→CET on 2026-10-25: 17:00 Paris becomes 16:00Z after the switch.
    expect(occ.map((d) => d.toISOString())).toEqual([
      "2026-10-21T15:00:00.000Z",
      "2026-10-28T16:00:00.000Z",
      "2026-11-04T16:00:00.000Z",
    ]);
  });

  it("expands biweekly from the anchor, not from `from`", () => {
    const occ = nextOccurrences(
      START, PARIS, "FREQ=WEEKLY;INTERVAL=2;BYDAY=WE",
      new Date("2026-06-25T00:00:00Z"), 2,
    );
    expect(occ.map((d) => d.toISOString())).toEqual([
      "2026-07-01T15:00:00.000Z",
      "2026-07-15T15:00:00.000Z",
    ]);
  });

  it("expands monthly nth-weekday", () => {
    const occ = nextOccurrences(
      START, PARIS, "FREQ=MONTHLY;BYDAY=3WE",
      new Date("2026-06-18T00:00:00Z"), 2,
    );
    expect(occ.map((d) => d.toISOString())).toEqual([
      "2026-07-15T15:00:00.000Z", // 3rd Wed of July
      "2026-08-19T15:00:00.000Z", // 3rd Wed of August
    ]);
  });

  it("includes the first occurrence itself", () => {
    const occ = nextOccurrences(
      START, PARIS, "FREQ=WEEKLY;BYDAY=WE",
      new Date("2026-06-01T00:00:00Z"), 1,
    );
    expect(occ[0].toISOString()).toBe(START.toISOString());
  });
});

describe("describeRrule", () => {
  it("labels the cadence in the schedule's timezone", () => {
    expect(describeRrule("FREQ=WEEKLY;BYDAY=WE", START, PARIS)).toBe(
      "Weekly on Wednesday at 17:00 (Europe/Paris)",
    );
    expect(describeRrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE", START, PARIS)).toBe(
      "Every 2 weeks on Wednesday at 17:00 (Europe/Paris)",
    );
    expect(describeRrule("FREQ=MONTHLY;BYDAY=3WE", START, PARIS)).toBe(
      "Monthly (third Wednesday) at 17:00 (Europe/Paris)",
    );
  });
});
