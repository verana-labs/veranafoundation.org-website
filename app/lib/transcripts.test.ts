import { describe, expect, it } from "vitest";
import {
  backoffMinutes,
  isActiveStatus,
  mergeEntries,
  toAttendees,
  unticked,
} from "./transcripts";

describe("backoffMinutes", () => {
  it("doubles from 5 minutes and caps at 6 hours", () => {
    expect([1, 2, 3, 4, 5].map(backoffMinutes)).toEqual([5, 10, 20, 40, 80]);
    expect(backoffMinutes(12)).toBe(360);
    expect(backoffMinutes(0)).toBe(5);
  });
});

describe("isActiveStatus", () => {
  it("only the three pipeline states are active", () => {
    expect(isActiveStatus("awaiting_transcript")).toBe(true);
    expect(isActiveStatus("transcribed")).toBe(true);
    expect(isActiveStatus("summarized")).toBe(true);
    expect(isActiveStatus("awaiting_approval")).toBe(false);
    expect(isActiveStatus("approved")).toBe(false);
    expect(isActiveStatus("failed")).toBe(false);
  });
});

const people = [
  {
    name: "conferenceRecords/1/participants/a",
    displayName: "Ada Lovelace",
    kind: "signed_in" as const,
    userId: "users/a",
    joinedAt: "2026-10-07T15:00:10Z",
    leftAt: "2026-10-07T15:30:00Z",
  },
  {
    name: "conferenceRecords/1/participants/g",
    displayName: "Guest",
    kind: "anonymous" as const,
    userId: null,
    joinedAt: "2026-10-07T15:05:00Z",
    leftAt: null,
  },
];

describe("mergeEntries", () => {
  it("resolves speakers, drops empty text and sorts across records", () => {
    const merged = mergeEntries([
      {
        participants: people,
        entries: [
          {
            participant: "conferenceRecords/1/participants/g",
            text: "second",
            startTime: "2026-10-07T15:06:00Z",
          },
          { participant: "conferenceRecords/1/participants/a", text: "   ", startTime: "2026-10-07T15:07:00Z" },
        ],
      },
      {
        participants: people,
        entries: [
          {
            participant: "conferenceRecords/1/participants/a",
            text: " first ",
            languageCode: "en-US",
            startTime: "2026-10-07T15:01:00Z",
            endTime: "2026-10-07T15:01:05Z",
          },
          { participant: "conferenceRecords/2/participants/x", text: "third", startTime: "2026-10-07T15:40:00Z" },
        ],
      },
    ]);
    expect(merged.map((e) => `${e.speaker}: ${e.text}`)).toEqual([
      "Ada Lovelace: first",
      "Guest: second",
      "Unknown participant: third",
    ]);
    expect(merged[0]).toMatchObject({ lang: "en-US", end: "2026-10-07T15:01:05Z" });
    expect(merged[1].lang).toBeNull();
  });
});

describe("toAttendees", () => {
  it("de-duplicates a person who rejoined and keeps the widest window", () => {
    const attendees = toAttendees([
      ...people,
      { ...people[0], name: "conferenceRecords/2/participants/a", joinedAt: "2026-10-07T15:35:00Z", leftAt: "2026-10-07T15:59:00Z" },
    ]);
    expect(attendees).toHaveLength(2);
    expect(attendees[0]).toMatchObject({
      name: "Ada Lovelace",
      userId: "users/a",
      joinedAt: "2026-10-07T15:00:10Z",
      leftAt: "2026-10-07T15:59:00Z",
    });
  });
});

describe("unticked", () => {
  it("compares names case-insensitively and tolerates a missing list", () => {
    const meet = [
      { name: "Ada Lovelace", kind: "signed_in" as const, userId: "users/a", joinedAt: null, leftAt: null },
      { name: "Grace Hopper", kind: "signed_in" as const, userId: "users/g", joinedAt: null, leftAt: null },
    ];
    expect(unticked(meet, ["ada lovelace"]).map((a) => a.name)).toEqual(["Grace Hopper"]);
    expect(unticked(null, [])).toEqual([]);
  });
});
