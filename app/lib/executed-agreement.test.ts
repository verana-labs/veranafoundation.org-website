import { describe, it, expect } from "vitest";
import { buildExecutionCertificate } from "./executed-agreement";

describe("buildExecutionCertificate", () => {
  it("produces a valid PDF buffer", async () => {
    const buf = await buildExecutionCertificate({
      to: "a@b.com",
      memberName: "Acme OÜ",
      membershipClass: "Contributor",
      signerName: "Jane Doe",
      signedAt: new Date("2026-06-08T10:00:00Z"),
      agreementVersion: "v1",
      agreementSource: "membership-agreement-v1.md",
      versionHash: "sha384-template",
      documentHash: "sha384-pdf",
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(500);
  });
});
