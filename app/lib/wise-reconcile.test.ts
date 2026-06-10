import { describe, it, expect } from "vitest";
import { extractInvoiceNumbers } from "./wise-reconcile";

describe("extractInvoiceNumbers", () => {
  it("finds an invoice number in a payment reference", () => {
    expect(extractInvoiceNumbers("VF-2026-0001", "VF-")).toEqual(["VF-2026-0001"]);
  });

  it("finds it inside surrounding wire text, case-insensitively", () => {
    expect(
      extractInvoiceNumbers("Membership dues vf-2026-0042 / ACME OU", "VF-"),
    ).toEqual(["VF-2026-0042"]);
  });

  it("dedupes and finds multiple distinct numbers", () => {
    expect(
      extractInvoiceNumbers("VF-2026-0001 and VF-2026-0002, VF-2026-0001 again", "VF-"),
    ).toEqual(["VF-2026-0001", "VF-2026-0002"]);
  });

  it("ignores text without the prefix or with the wrong shape", () => {
    expect(extractInvoiceNumbers("invoice 2026-0001, XX-2026-0001, VF-26-01", "VF-")).toEqual([]);
  });

  it("escapes regex specials in the prefix", () => {
    expect(extractInvoiceNumbers("A.B-2026-0007", "A.B-")).toEqual(["A.B-2026-0007"]);
    expect(extractInvoiceNumbers("AXB-2026-0007", "A.B-")).toEqual([]);
  });
});
