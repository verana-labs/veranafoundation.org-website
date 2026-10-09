import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";
// @ts-expect-error — plain ESM module shared with prisma/seed.mjs (no types).
import { seedAgreementVersion, DEFAULT_AGREEMENT_FILENAME } from "../../prisma/seed-agreement.mjs";

// The seed runs on every deploy (ci/seed-job.yaml). These tests pin the rule
// that it must never undo a version an admin activated in /admin/settings:
// bootstrap only, unless AGREEMENT_FILENAME is set explicitly.

type Row = { filename: string; version: string; hash: string; active: boolean; effectiveFrom?: Date };

function sha384(s: string) {
  return "sha384-" + crypto.createHash("sha384").update(s, "utf8").digest("base64");
}

/** Minimal in-memory stand-in for db.agreementDocument. */
function fakeDb(rows: Row[]) {
  return {
    rows,
    agreementDocument: {
      findFirst: async ({ where }: { where: { active: boolean } }) =>
        rows.find((r) => r.active === where.active) ?? null,
      findUnique: async ({ where }: { where: { filename: string } }) =>
        rows.find((r) => r.filename === where.filename) ?? null,
      updateMany: async ({ where, data }: { where: { active: boolean }; data: { active: boolean } }) => {
        for (const r of rows) if (r.active === where.active) r.active = data.active;
      },
      upsert: async ({ where, update, create }: { where: { filename: string }; update: Partial<Row>; create: Row }) => {
        const r = rows.find((x) => x.filename === where.filename);
        if (r) Object.assign(r, update);
        else rows.push({ ...create });
      },
    },
  };
}

const silent = { log: () => {}, warn: () => {} };
const V1 = "# v1 text";
const V4 = "# v4 text";
const V5 = "# v5 text";

let legalDir: string;
beforeEach(() => {
  legalDir = mkdtempSync(path.join(tmpdir(), "legal-"));
  writeFileSync(path.join(legalDir, DEFAULT_AGREEMENT_FILENAME), V1);
  writeFileSync(path.join(legalDir, "membership-agreement-v4.md"), V4);
  writeFileSync(path.join(legalDir, "membership-agreement-v5.md"), V5);
});

describe("seedAgreementVersion", () => {
  it("bootstraps the default version when nothing is active", async () => {
    const db = fakeDb([]);
    const res = await seedAgreementVersion(db, { legalDir, logger: silent });
    expect(res).toEqual({ action: "activated", filename: DEFAULT_AGREEMENT_FILENAME });
    expect(db.rows).toEqual([
      { filename: DEFAULT_AGREEMENT_FILENAME, version: "v1", hash: sha384(V1), active: true },
    ]);
  });

  it("keeps the admin-activated version on a redeploy (no AGREEMENT_FILENAME)", async () => {
    const db = fakeDb([
      { filename: DEFAULT_AGREEMENT_FILENAME, version: "v1", hash: sha384(V1), active: false },
      { filename: "membership-agreement-v5.md", version: "v5", hash: sha384(V5), active: true },
    ]);
    const res = await seedAgreementVersion(db, { legalDir, logger: silent });
    expect(res).toEqual({ action: "kept", filename: "membership-agreement-v5.md" });
    expect(db.rows.filter((r) => r.active).map((r) => r.filename)).toEqual(["membership-agreement-v5.md"]);
  });

  it("activates an explicit AGREEMENT_FILENAME even if another version is active", async () => {
    const db = fakeDb([
      { filename: "membership-agreement-v5.md", version: "v5", hash: sha384(V5), active: true },
    ]);
    const res = await seedAgreementVersion(db, {
      filename: "membership-agreement-v4.md",
      explicit: true,
      legalDir,
      logger: silent,
    });
    expect(res).toEqual({ action: "activated", filename: "membership-agreement-v4.md" });
    expect(db.rows.filter((r) => r.active).map((r) => r.filename)).toEqual(["membership-agreement-v4.md"]);
    expect(db.rows.find((r) => r.filename === "membership-agreement-v4.md")?.hash).toBe(sha384(V4));
  });

  it("is a no-op when the explicit file is already active", async () => {
    const db = fakeDb([
      { filename: "membership-agreement-v5.md", version: "v5", hash: sha384(V5), active: true, effectiveFrom: new Date(0) },
    ]);
    const res = await seedAgreementVersion(db, {
      filename: "membership-agreement-v5.md",
      explicit: true,
      legalDir,
      logger: silent,
    });
    expect(res).toEqual({ action: "kept", filename: "membership-agreement-v5.md" });
    expect(db.rows[0].effectiveFrom).toEqual(new Date(0)); // not re-stamped
  });

  it("refuses to re-activate a file modified since it was pinned", async () => {
    const db = fakeDb([
      { filename: "membership-agreement-v4.md", version: "v4", hash: "sha384-stale", active: false },
      { filename: "membership-agreement-v5.md", version: "v5", hash: sha384(V5), active: true },
    ]);
    const res = await seedAgreementVersion(db, {
      filename: "membership-agreement-v4.md",
      explicit: true,
      legalDir,
      logger: silent,
    });
    expect(res).toEqual({ action: "skipped", filename: "membership-agreement-v4.md" });
    expect(db.rows.filter((r) => r.active).map((r) => r.filename)).toEqual(["membership-agreement-v5.md"]);
  });

  it("leaves the active version untouched when the explicit file is missing", async () => {
    const db = fakeDb([
      { filename: "membership-agreement-v5.md", version: "v5", hash: sha384(V5), active: true },
    ]);
    const res = await seedAgreementVersion(db, {
      filename: "membership-agreement-v9.md",
      explicit: true,
      legalDir,
      logger: silent,
    });
    expect(res).toEqual({ action: "error", filename: "membership-agreement-v9.md" });
    expect(db.rows.filter((r) => r.active).map((r) => r.filename)).toEqual(["membership-agreement-v5.md"]);
  });
});
