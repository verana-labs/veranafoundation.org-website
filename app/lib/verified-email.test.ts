import { describe, it, expect } from "vitest";
import { pickGithubVerifiedEmail, isGoogleEmailVerified } from "./verified-email";

describe("pickGithubVerifiedEmail", () => {
  it("prefers the primary verified email", () => {
    expect(
      pickGithubVerifiedEmail([
        { email: "secondary@x.com", primary: false, verified: true },
        { email: "primary@x.com", primary: true, verified: true },
      ]),
    ).toBe("primary@x.com");
  });

  it("falls back to any verified email when the primary is unverified", () => {
    expect(
      pickGithubVerifiedEmail([
        { email: "primary@x.com", primary: true, verified: false },
        { email: "verified@x.com", primary: false, verified: true },
      ]),
    ).toBe("verified@x.com");
  });

  // The safety-critical case: never key an account on an unverified email.
  it("returns null when no email is verified", () => {
    expect(
      pickGithubVerifiedEmail([
        { email: "a@x.com", primary: true, verified: false },
        { email: "b@x.com", primary: false, verified: false },
      ]),
    ).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(pickGithubVerifiedEmail([])).toBeNull();
  });
});

describe("isGoogleEmailVerified", () => {
  it("is true only when email_verified is true", () => {
    expect(isGoogleEmailVerified({ email_verified: true })).toBe(true);
    expect(isGoogleEmailVerified({ email_verified: false })).toBe(false);
    expect(isGoogleEmailVerified({})).toBe(false);
    expect(isGoogleEmailVerified(undefined)).toBe(false);
  });
});
