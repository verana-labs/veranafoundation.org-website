import { describe, expect, it } from "vitest";
import {
  elapsedLabel,
  speakerNames,
  transcriptLines,
  wordCount,
  type TranscriptEntry,
} from "./transcript-format";

const start = new Date("2026-10-07T15:00:00Z");
const entries: TranscriptEntry[] = [
  { at: "2026-10-07T15:00:08Z", end: null, speaker: "Ada", participant: "p/a", text: " Hello everyone. ", lang: "en-US" },
  { at: "2026-10-07T16:02:30Z", end: null, speaker: "Grace", participant: "p/g", text: "Let's decide.", lang: "en-US" },
  { at: "2026-10-07T16:03:00Z", end: null, speaker: "Ada", participant: "p/a", text: "Agreed", lang: null },
];

describe("transcript formatting", () => {
  it("labels elapsed time as HH:MM:SS, clamped at zero", () => {
    expect(elapsedLabel(start, new Date("2026-10-07T15:00:08Z"))).toBe("00:00:08");
    expect(elapsedLabel(start, new Date("2026-10-07T16:02:30Z"))).toBe("01:02:30");
    expect(elapsedLabel(start, new Date("2026-10-07T14:59:00Z"))).toBe("00:00:00");
  });
  it("renders one trimmed line per utterance", () => {
    expect(transcriptLines(entries, start)).toEqual([
      "[00:00:08] Ada: Hello everyone.",
      "[01:02:30] Grace: Let's decide.",
      "[01:03:00] Ada: Agreed",
    ]);
  });
  it("lists speakers once, in order, and counts words", () => {
    expect(speakerNames(entries)).toEqual(["Ada", "Grace"]);
    expect(wordCount(entries)).toBe(5);
  });
});
