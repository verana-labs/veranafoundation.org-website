import { describe, it, expect } from "vitest";
import { stripTags, isSettledCredit } from "./payments/wise";
import { extractInvoiceNumbers } from "./wise-reconcile";

// Shapes below mirror live /v1/profiles/{id}/activities responses (2026-06).

const credit = {
  type: "TRANSFER",
  resource: { type: "TRANSFER", id: "2185225166" },
  title: "<strong>Fabrice Denis Didier Rochette</strong>",
  primaryAmount: "<positive>+ 10 EUR</positive>",
  status: "COMPLETED",
  createdOn: "2026-06-11T02:54:29.929Z",
};

describe("stripTags", () => {
  it("removes Wise's pseudo-HTML wrappers", () => {
    expect(stripTags(credit.title)).toBe("Fabrice Denis Didier Rochette");
    expect(stripTags(credit.primaryAmount)).toBe("+ 10 EUR");
  });
});

describe("isSettledCredit", () => {
  it("accepts a completed incoming transfer", () => {
    expect(isSettledCredit(credit)).toBe(true);
  });

  it("rejects outgoing transfers (no <positive> marker)", () => {
    expect(
      isSettledCredit({ ...credit, primaryAmount: "10 EUR" }),
    ).toBe(false);
  });

  it("rejects non-settled and non-transfer activities", () => {
    expect(isSettledCredit({ ...credit, status: "REQUIRES_ATTENTION" })).toBe(false);
    expect(
      isSettledCredit({ ...credit, resource: { type: "CARD_PAYMENT", id: "1" } }),
    ).toBe(false);
  });
});

describe("extractInvoiceNumbers — real-world wire references", () => {
  it("finds the invoice number despite SEPA scheme suffixes", () => {
    // Observed live: external banks append routing metadata to the reference.
    expect(
      extractInvoiceNumbers("VF-2026-0007/SCTINSTOUTfk+Ll357Rr+yvuQQbogTIA", "VF-"),
    ).toEqual(["VF-2026-0007"]);
  });

  it("finds nothing in an unrelated reference", () => {
    expect(
      extractInvoiceNumbers("Invoice-test-123/SCTINSTOUTfk+Ll357Rr", "VF-"),
    ).toEqual([]);
  });
});
