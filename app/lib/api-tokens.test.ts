import { describe, expect, it } from "vitest";
import { generateSecret, hashToken, TOKEN_PREFIX } from "./api-tokens";
import { rateLimitAllow, resetRateLimits } from "./rate-limit";

describe("api tokens", () => {
  it("generates prefixed, url-safe, unique secrets", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(a).toMatch(/^vf_[A-Za-z0-9_-]{40}$/);
    expect(a).not.toBe(b);
  });
  it("hashes deterministically with sha256", () => {
    expect(hashToken("vf_abc")).toBe(hashToken("vf_abc"));
    expect(hashToken("vf_abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("vf_abc")).not.toBe(hashToken("vf_abd"));
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window, then refuses until reset", () => {
    resetRateLimits();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimitAllow("k", 3, 1000, t0).allowed).toBe(true);
    expect(rateLimitAllow("k", 3, 1000, t0 + 10).allowed).toBe(false);
    expect(rateLimitAllow("k", 3, 1000, t0 + 1001).allowed).toBe(true);
    expect(rateLimitAllow("other", 3, 1000, t0 + 10).allowed).toBe(true);
  });
});
