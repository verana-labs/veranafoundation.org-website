import { describe, it, expect } from "vitest";
import { dueAction, daysSince } from "./dunning";

describe("daysSince", () => {
  it("floors to whole days", () => {
    const issued = new Date("2026-06-01T10:00:00Z");
    expect(daysSince(issued, new Date("2026-06-08T09:59:00Z"))).toBe(6);
    expect(daysSince(issued, new Date("2026-06-08T10:00:00Z"))).toBe(7);
  });
});

describe("dueAction", () => {
  it("does nothing before the first milestone", () => {
    expect(dueAction(0)).toBeNull();
    expect(dueAction(6)).toBeNull();
  });

  it("hits each reminder milestone from its day onward", () => {
    expect(dueAction(7)).toEqual({ kind: "remind", day: 7 });
    expect(dueAction(13)).toEqual({ kind: "remind", day: 7 });
    expect(dueAction(14)).toEqual({ kind: "remind", day: 14 });
    expect(dueAction(21)).toEqual({ kind: "remind", day: 21 });
    expect(dueAction(28)).toEqual({ kind: "remind", day: 28 });
    expect(dueAction(38)).toEqual({ kind: "remind", day: 28 });
  });

  it("returns only the latest reached milestone (no backlog after downtime)", () => {
    expect(dueAction(23)).toEqual({ kind: "remind", day: 21 });
  });

  it("expires from day 39", () => {
    expect(dueAction(39)).toEqual({ kind: "expire" });
    expect(dueAction(120)).toEqual({ kind: "expire" });
  });
});
