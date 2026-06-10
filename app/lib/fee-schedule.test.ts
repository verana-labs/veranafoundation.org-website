import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { FEE_SCHEDULES, ACTIVE_FEE_SCHEDULE, AGREEMENT_FEE_SCHEDULE } from "./dues";

// The Fee Schedule is versioned data (dues.ts); each agreement template's
// Annex D embeds a snapshot of it. These tests fail the build when they
// diverge — the legal text and what we invoice must always agree.

const LEGAL_DIR = path.join(process.cwd(), "legal");

/** Extract Annex D's `| label | €amount |` rows from an agreement template. */
function annexDTiers(md: string): { label: string; amount: number }[] {
  const start = md.indexOf("The dues tiers are as follows");
  expect(start, "Annex D marker sentence not found").toBeGreaterThan(-1);
  const rows: { label: string; amount: number }[] = [];
  for (const line of md.slice(start).split("\n")) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*€\s*([\d,.]+)\s*\|/);
    if (m) {
      rows.push({
        label: m[1],
        amount: Number(m[2].replace(/[,.]/g, "")) * 100, // €1,500 → 150000 cents
      });
    } else if (rows.length && line.trim() === "") {
      break; // table ended
    }
  }
  return rows;
}

describe("fee schedules ⇄ agreement Annex D", () => {
  const templates = readdirSync(LEGAL_DIR).filter((f) =>
    /^membership-agreement-.*\.md$/.test(f),
  );

  it("every agreement template is mapped to a fee schedule", () => {
    for (const f of templates) {
      expect(
        AGREEMENT_FEE_SCHEDULE[f],
        `${f} has no entry in AGREEMENT_FEE_SCHEDULE (dues.ts)`,
      ).toBeTruthy();
    }
  });

  it("the active schedule exists", () => {
    expect(FEE_SCHEDULES[ACTIVE_FEE_SCHEDULE]).toBeTruthy();
  });

  for (const f of readdirSync(LEGAL_DIR).filter((x) =>
    /^membership-agreement-.*\.md$/.test(x),
  )) {
    it(`${f} Annex D matches schedule "${AGREEMENT_FEE_SCHEDULE[f]}"`, () => {
      const schedule = FEE_SCHEDULES[AGREEMENT_FEE_SCHEDULE[f]];
      expect(schedule, "mapped schedule missing from FEE_SCHEDULES").toBeTruthy();
      const md = readFileSync(path.join(LEGAL_DIR, f), "utf8");
      const annexD = annexDTiers(md);
      expect(annexD).toEqual(
        schedule.map((t) => ({ label: t.label, amount: t.amount })),
      );
    });
  }
});
