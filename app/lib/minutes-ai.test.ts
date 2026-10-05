import { describe, expect, it } from "vitest";
import { buildUserPrompt, languageName, SYSTEM_PROMPT } from "./minutes-ai";

describe("minutes-ai prompt", () => {
  it("names languages for the model", () => {
    expect(languageName("fr")).toBe("French");
    expect(languageName("en")).toBe("English");
  });
  it("carries the group context, attendees, speakers, previous minutes and transcript", () => {
    const prompt = buildUserPrompt({
      wgName: "Trust Registry WG",
      wgDescription: "Specifies the registry.",
      language: "es",
      attendees: ["Ada Lovelace"],
      previousMinutes: "## Action items\n- [ ] Ship v1 (Grace)",
      startedAt: new Date("2026-10-07T15:00:00Z"),
      entries: [
        { at: "2026-10-07T15:00:08Z", end: null, speaker: "Ada Lovelace", participant: "p/a", text: "Hello.", lang: "en-US" },
        { at: "2026-10-07T15:01:00Z", end: null, speaker: "Grace Hopper", participant: "p/g", text: "Hi.", lang: "en-US" },
      ],
    });
    expect(prompt).toContain("Working group: Trust Registry WG");
    expect(prompt).toContain("About the group: Specifies the registry.");
    expect(prompt).toContain("Write the minutes in Spanish.");
    expect(prompt).toContain("Meeting date: 2026-10-07");
    expect(prompt).toContain("- Ada Lovelace");
    expect(prompt).toContain("- Grace Hopper");
    expect(prompt).toContain("<previous_minutes>\n## Action items\n- [ ] Ship v1 (Grace)\n</previous_minutes>");
    expect(prompt).toContain("[00:00:08] Ada Lovelace: Hello.");
    expect(prompt).toContain("[00:01:00] Grace Hopper: Hi.");
  });
  it("omits optional context cleanly", () => {
    const prompt = buildUserPrompt({
      wgName: "WG",
      wgDescription: null,
      language: "en",
      attendees: [],
      previousMinutes: null,
      startedAt: new Date("2026-10-07T15:00:00Z"),
      entries: [],
    });
    expect(prompt).not.toContain("About the group");
    expect(prompt).not.toContain("previous_minutes");
    expect(prompt).toContain("- (none recorded yet)");
  });
  it("keeps the static instructions stable (prompt-cache prefix)", () => {
    expect(SYSTEM_PROMPT).toContain("## Agenda");
    expect(SYSTEM_PROMPT).toContain("## Action items");
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
