import { describe, it, expect } from "vitest";
import { decodeDraft, draftFromFormData, encodeDraft } from "./apply-draft";

// The /apply wizard keeps the typed details across the sign-in round trip in a
// cookie. These tests pin the codec and the form-data mapping.

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("apply draft", () => {
  it("round-trips an Associate application", () => {
    const draft = draftFromFormData(
      fd({
        class: "associate",
        legalName: " INTEXUS SAS ",
        country: "CO",
        registeredAddress: "Bogotá",
        vatNumber: "900123456-7",
        tier: "tier_2",
        signerName: "David Rojas",
        signerTitle: "CEO",
        socialAnnouncementConsent: "on",
        accept: "on",
      }),
    );
    expect(draft).toEqual({
      class: "associate",
      legalName: "INTEXUS SAS",
      country: "CO",
      registeredAddress: "Bogotá",
      vatNumber: "900123456-7",
      tier: "tier_2",
      signerName: "David Rojas",
      signerTitle: "CEO",
      socialAnnouncementConsent: true,
    });
    expect(decodeDraft(encodeDraft(draft))).toEqual(draft);
  });

  it("maps a contributor individual, drops empties, and records an unticked consent", () => {
    const draft = draftFromFormData(
      fd({ class: "contributor", type: "individual", legalName: "Ana Pérez", countryOfResidence: "CO", signerName: "" }),
    );
    expect(draft).toEqual({
      class: "contributor",
      type: "individual",
      legalName: "Ana Pérez",
      countryOfResidence: "CO",
      socialAnnouncementConsent: false,
    });
  });

  it("never throws on odd input and truncates long values", () => {
    const draft = draftFromFormData(
      fd({ class: "bogus", type: "robot", legalName: "x".repeat(1000), registeredAddress: "y".repeat(2000) }),
    );
    expect(draft.class).toBe("contributor");
    expect(draft.type).toBeUndefined();
    expect(draft.legalName).toHaveLength(300);
    expect(draft.registeredAddress).toHaveLength(500);
    expect(encodeDraft(draft).length).toBeLessThan(2000);
  });

  it("decodes nothing from a missing, malformed or off-schema cookie", () => {
    expect(decodeDraft(undefined)).toBeNull();
    expect(decodeDraft("")).toBeNull();
    expect(decodeDraft("not base64 json")).toBeNull();
    expect(decodeDraft(Buffer.from('{"class":"gold"}').toString("base64url"))).toBeNull();
    expect(decodeDraft(Buffer.from("[1,2]").toString("base64url"))).toBeNull();
  });
});
