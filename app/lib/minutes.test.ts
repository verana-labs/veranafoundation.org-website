import { describe, expect, it } from "vitest";
import { minutesPath, renderMinutes, renderTranscript, transcriptPath } from "./minutes";

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

describe("renderMinutes (ADR-0004 front matter)", () => {
  it("adds drafted_by, approved_by and transcript only when present", () => {
    const base = {
      wgSlug: "trust-registry",
      wgName: "Trust Registry WG",
      date: new Date("2026-10-07T15:00:00Z"),
      attendees: ["Ada Lovelace"],
      recordedBy: "Ada Lovelace",
      markdown: "## Agenda\n\n- Hello",
    };
    const plain = renderMinutes(base);
    expect(plain).not.toContain("drafted_by");
    expect(plain).not.toContain("approved_by");
    expect(plain).not.toContain("transcript:");

    const ai = renderMinutes({
      ...base,
      draftedBy: "claude-opus-5",
      approvedBy: "Ada Lovelace",
      transcriptPath: "trust-registry/transcripts/2026-10-07.md",
    });
    expect(ai).toContain('drafted_by: "claude-opus-5"');
    expect(ai).toContain('approved_by: "Ada Lovelace"');
    expect(ai).toContain('transcript: "trust-registry/transcripts/2026-10-07.md"');
    expect(ai.indexOf("drafted_by")).toBeLessThan(ai.indexOf("---\n\n# "));
  });
});

describe("renderTranscript", () => {
  it("renders front matter and one elapsed-time line per utterance", () => {
    const md = renderTranscript({
      wgSlug: "trust-registry",
      wgName: "Trust Registry WG",
      date: new Date("2026-10-07T15:00:00Z"),
      startedAt: new Date("2026-10-07T15:00:00Z"),
      language: "en-US",
      participants: ['Ada "Law" Lovelace'],
      entries: [
        { at: "2026-10-07T15:00:08Z", end: null, speaker: "Ada Lovelace", participant: "p/a", text: "Hello.", lang: "en-US" },
      ],
    });
    expect(transcriptPath("trust-registry", new Date("2026-10-07T15:00:00Z"))).toBe(
      "trust-registry/transcripts/2026-10-07.md",
    );
    expect(md).toContain('language: "en-US"');
    expect(md).toContain('  - "Ada \\"Law\\" Lovelace"');
    expect(md).toContain("# Trust Registry WG — transcript, 2026-10-07");
    expect(md).toContain("- [00:00:08] Ada Lovelace: Hello.");
    expect(md.endsWith("\n")).toBe(true);
  });
});
