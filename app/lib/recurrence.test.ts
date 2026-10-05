import { describe, expect, it } from "vitest";
import {
  buildRrule,
  describeRrule,
  nextOccurrences,
  occurrenceFor,
  occurrenceWindowAt,
  expandOccurrences,
  sessionPhase,
  formatInTimezone,
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

describe("occurrenceFor / sessionPhase / formatInTimezone (ADR-0004)", () => {
  // Weekly on Wednesday 17:00 Europe/Paris, anchored 2026-10-07.
  const schedule = {
    startsAt: new Date("2026-10-07T15:00:00Z"),
    durationMin: 60,
    timezone: "Europe/Paris",
    rrule: "FREQ=WEEKLY;BYDAY=WE",
  };

  it("snaps a conference to the occurrence within an hour either side", () => {
    expect(occurrenceFor(schedule, new Date("2026-10-14T15:03:20Z")).toISOString()).toBe(
      "2026-10-14T15:00:00.000Z",
    );
    expect(occurrenceFor(schedule, new Date("2026-10-14T14:40:00Z")).toISOString()).toBe(
      "2026-10-14T15:00:00.000Z",
    );
    expect(occurrenceFor(schedule, new Date("2026-10-14T15:45:00Z")).toISOString()).toBe(
      "2026-10-14T15:00:00.000Z",
    );
  });
  it("keeps an ad-hoc call on the link as its own minute-truncated occurrence", () => {
    expect(occurrenceFor(schedule, new Date("2026-10-16T09:12:45.678Z")).toISOString()).toBe(
      "2026-10-16T09:12:00.000Z",
    );
  });
  it("follows DST: after the October switch the UTC hour moves", () => {
    expect(occurrenceFor(schedule, new Date("2026-11-04T16:02:00Z")).toISOString()).toBe(
      "2026-11-04T16:00:00.000Z",
    );
  });
  it("classifies the session phase around an occurrence", () => {
    const start = new Date("2026-10-14T15:00:00Z");
    expect(sessionPhase(start, 60, new Date("2026-10-14T14:00:00Z"))).toBe("upcoming");
    expect(sessionPhase(start, 60, new Date("2026-10-14T14:50:00Z"))).toBe("soon");
    expect(sessionPhase(start, 60, new Date("2026-10-14T15:30:00Z"))).toBe("live");
    expect(sessionPhase(start, 60, new Date("2026-10-14T16:00:00Z"))).toBe("live");
    expect(sessionPhase(start, 60, new Date("2026-10-14T16:00:01Z"))).toBe("past");
  });
  it("formats a label in the schedule timezone for emails", () => {
    // ICU versions differ on the separators ("Wednesday, 7 October 2026 at 17:00").
    expect(formatInTimezone(new Date("2026-10-07T15:00:00Z"), "Europe/Paris")).toMatch(
      /^Wednesday,? 7 October 2026,? (at )?17:00 \(Europe\/Paris\)$/,
    );
  });
});

describe("occurrenceWindowAt (transcription window, ADR-0004 amendment)", () => {
  // Weekly on Wednesday 17:00 Europe/Paris, 60 min.
  const schedule = {
    startsAt: new Date("2026-10-07T15:00:00Z"),
    durationMin: 60,
    timezone: "Europe/Paris",
    rrule: "FREQ=WEEKLY;BYDAY=WE",
  };
  const occ = "2026-10-14T15:00:00.000Z";

  it("opens 20 minutes before the start and closes 30 minutes after the end", () => {
    expect(occurrenceWindowAt(schedule, new Date("2026-10-14T14:40:00Z"))?.toISOString()).toBe(occ);
    expect(occurrenceWindowAt(schedule, new Date("2026-10-14T14:39:59Z"))).toBeNull();
    expect(occurrenceWindowAt(schedule, new Date("2026-10-14T15:30:00Z"))?.toISOString()).toBe(occ);
    expect(occurrenceWindowAt(schedule, new Date("2026-10-14T16:30:00Z"))?.toISOString()).toBe(occ);
    expect(occurrenceWindowAt(schedule, new Date("2026-10-14T16:30:01Z"))).toBeNull();
  });
  it("ignores calls on other days and cancelled occurrences", () => {
    expect(occurrenceWindowAt(schedule, new Date("2026-10-16T15:00:00Z"))).toBeNull();
    expect(
      occurrenceWindowAt(schedule, new Date("2026-10-14T15:05:00Z"), [
        { originalStart: new Date(occ), movedTo: null, note: "holiday" },
      ]),
    ).toBeNull();
  });
  it("follows a moved meeting: window at the new time, none at the vacated slot", () => {
    const moved = [{ originalStart: new Date(occ), movedTo: new Date("2026-10-15T15:00:00Z"), note: null }];
    expect(occurrenceWindowAt(schedule, new Date("2026-10-14T15:05:00Z"), moved)).toBeNull();
    expect(occurrenceWindowAt(schedule, new Date("2026-10-15T15:05:00Z"), moved)?.toISOString()).toBe(
      "2026-10-15T15:00:00.000Z",
    );
  });
  it("follows DST", () => {
    expect(occurrenceWindowAt(schedule, new Date("2026-11-04T16:10:00Z"))?.toISOString()).toBe(
      "2026-11-04T16:00:00.000Z",
    );
  });
});

describe("expandOccurrences (cancelled + moved meetings)", () => {
  const schedule = {
    startsAt: new Date("2026-10-07T15:00:00Z"),
    durationMin: 60,
    timezone: "Europe/Paris",
    rrule: "FREQ=WEEKLY;BYDAY=WE",
  };
  const from = new Date("2026-10-10T00:00:00Z");
  it("lists the series when there are no exceptions", () => {
    const list = expandOccurrences(schedule, [], from, 3);
    expect(list.map((o) => o.start.toISOString())).toEqual([
      "2026-10-14T15:00:00.000Z",
      "2026-10-21T15:00:00.000Z",
      "2026-10-28T16:00:00.000Z",
    ]);
    expect(list.every((o) => !o.cancelled && !o.movedTo && !o.movedFrom)).toBe(true);
  });
  it("keeps a cancelled slot struck-through and lists a moved one twice", () => {
    const list = expandOccurrences(
      schedule,
      [
        { originalStart: new Date("2026-10-14T15:00:00Z"), movedTo: null, note: "holiday" },
        { originalStart: new Date("2026-10-21T15:00:00Z"), movedTo: new Date("2026-10-23T09:00:00Z"), note: null },
      ],
      from,
      4,
    );
    expect(list.map((o) => [o.start.toISOString(), o.cancelled, o.movedTo?.toISOString() ?? null, o.movedFrom?.toISOString() ?? null])).toEqual([
      ["2026-10-14T15:00:00.000Z", true, null, null],
      ["2026-10-21T15:00:00.000Z", false, "2026-10-23T09:00:00.000Z", null],
      ["2026-10-23T09:00:00.000Z", false, null, "2026-10-21T15:00:00.000Z"],
      ["2026-10-28T16:00:00.000Z", false, null, null],
    ]);
    expect(list[0].note).toBe("holiday");
  });
  it("shows a meeting moved into the window from an earlier slot", () => {
    const list = expandOccurrences(
      schedule,
      [{ originalStart: new Date("2026-10-07T15:00:00Z"), movedTo: new Date("2026-10-12T10:00:00Z"), note: null }],
      from,
      2,
    );
    expect(list[0]).toMatchObject({ movedFrom: new Date("2026-10-07T15:00:00Z") });
    expect(list[0].start.toISOString()).toBe("2026-10-12T10:00:00.000Z");
  });
});
