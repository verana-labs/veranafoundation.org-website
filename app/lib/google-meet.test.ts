import { describe, expect, it } from "vitest";
import {
  meetingCodeFromLink,
  parseConferenceRecord,
  parseMember,
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
      uri: "https://meet.google.com/abc-defg-hij",
      moderation: null,
      autoTranscription: true,
      autoRecording: false,
    });
    expect(parseSpace({ name: "spaces/Y" }, "abc-defg-hij")).toEqual({
      name: "spaces/Y",
      meetingCode: "abc-defg-hij",
      uri: "https://meet.google.com/abc-defg-hij",
      moderation: null,
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

describe("parseSpace (site-created spaces) / parseMember", () => {
  it("carries the meeting URI and host-management state", () => {
    const s = parseSpace(
      {
        name: "spaces/2qjeOwn4KUcB",
        meetingCode: "zne-gigu-ucu",
        meetingUri: "https://meet.google.com/zne-gigu-ucu",
        config: { moderation: "ON" },
      },
      "",
    );
    expect(s.uri).toBe("https://meet.google.com/zne-gigu-ucu");
    expect(s.moderation).toBe(true);
    expect(parseSpace({ name: "spaces/x" }, "abc-defg-hij").uri).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
  });
  it("lower-cases member emails and maps roles", () => {
    expect(
      parseMember({ name: "spaces/x/members/1", email: "F.Rochette@Mobiera.com", role: "COHOST" }),
    ).toEqual({ name: "spaces/x/members/1", email: "f.rochette@mobiera.com", role: "COHOST" });
    expect(parseMember({ name: "spaces/x/members/2" }).role).toBe("ROLE_UNSPECIFIED");
  });
});
