import { describe, expect, it } from "vitest";
import { minutesPath, renderMinutes } from "./minutes";

describe("minutesPath", () => {
  it("is <slug>/minutes/YYYY-MM-DD.md", () => {
    expect(minutesPath("trust-registry", new Date("2026-06-17T15:00:00Z"))).toBe(
      "trust-registry/minutes/2026-06-17.md",
    );
  });
});

describe("renderMinutes", () => {
  it("renders front matter, escaped names and the notes body", () => {
    const md = renderMinutes({
      wgSlug: "trust-registry",
      wgName: "Trust Registry WG",
      date: new Date("2026-06-17T15:00:00Z"),
      attendees: ['Ada "Law" Lovelace', "Grace Hopper"],
      recordedBy: "Grace Hopper",
      markdown: "## Decisions\n\n- Ship it.",
    });
    expect(md).toContain('working_group: "Trust Registry WG"');
    expect(md).toContain("date: 2026-06-17");
    expect(md).toContain('  - "Ada \\"Law\\" Lovelace"');
    expect(md).toContain("# Trust Registry WG — 2026-06-17");
    expect(md).toContain("- Ship it.");
    expect(md.endsWith("\n")).toBe(true);
  });
});
