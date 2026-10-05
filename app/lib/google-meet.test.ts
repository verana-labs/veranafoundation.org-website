import { describe, expect, it } from "vitest";
import {
  meetingCodeFromLink,
  parseConferenceRecord,
  parseParticipant,
  parseSpace,
} from "./google-meet";

describe("meetingCodeFromLink", () => {
  it("extracts the code from a Meet link, with or without query", () => {
    expect(meetingCodeFromLink("https://meet.google.com/uim-zwqs-jtr")).toBe("uim-zwqs-jtr");
    expect(meetingCodeFromLink("https://meet.google.com/UIM-ZWQS-JTR?authuser=0")).toBe(
      "uim-zwqs-jtr",
    );
  });
  it("rejects anything else", () => {
    expect(meetingCodeFromLink(null)).toBeNull();
    expect(meetingCodeFromLink("https://zoom.us/j/123")).toBeNull();
    expect(meetingCodeFromLink("https://meet.google.com/abc")).toBeNull();
  });
});

describe("parseSpace", () => {
  it("maps ON/OFF to booleans and missing config to null", () => {
    expect(
      parseSpace(
        {
          name: "spaces/X",
          meetingCode: "abc-defg-hij",
          config: {
            artifactConfig: {
              recordingConfig: { autoRecordingGeneration: "OFF" },
              transcriptionConfig: { autoTranscriptionGeneration: "ON" },
            },
          },
        },
        "zzz-zzzz-zzz",
      ),
    ).toEqual({
      name: "spaces/X",
      meetingCode: "abc-defg-hij",
      autoTranscription: true,
      autoRecording: false,
    });
    expect(parseSpace({ name: "spaces/Y" }, "abc-defg-hij")).toEqual({
      name: "spaces/Y",
      meetingCode: "abc-defg-hij",
      autoTranscription: null,
      autoRecording: null,
    });
  });
});

describe("parseConferenceRecord / parseParticipant", () => {
  it("keeps ongoing conferences open-ended", () => {
    const r = parseConferenceRecord({
      name: "conferenceRecords/1",
      startTime: "2026-10-05T03:10:38.292981Z",
      space: "spaces/X",
    });
    expect(r.endedAt).toBeNull();
    expect(r.startedAt.toISOString()).toBe("2026-10-05T03:10:38.292Z");
  });
  it("classifies signed-in, anonymous and phone participants", () => {
    expect(
      parseParticipant({
        name: "conferenceRecords/1/participants/101",
        signedinUser: { user: "users/101", displayName: "Fabrice Rochette" },
        earliestStartTime: "2026-10-05T03:10:43Z",
        latestEndTime: "2026-10-05T03:11:03Z",
      }),
    ).toEqual({
      name: "conferenceRecords/1/participants/101",
      displayName: "Fabrice Rochette",
      kind: "signed_in",
      userId: "users/101",
      joinedAt: "2026-10-05T03:10:43Z",
      leftAt: "2026-10-05T03:11:03Z",
    });
    expect(parseParticipant({ name: "p", anonymousUser: { displayName: "Guest" } }).kind).toBe(
      "anonymous",
    );
    expect(parseParticipant({ name: "p", phoneUser: { displayName: "+33…" } }).kind).toBe("phone");
    expect(parseParticipant({ name: "p" }).displayName).toBe("Unknown participant");
  });
});
