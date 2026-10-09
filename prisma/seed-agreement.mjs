// Membership Agreement activation for the seed (prisma/seed.mjs). Kept in its
// own module so the rule can be unit-tested with a fake db (app/lib/seed-agreement.test.ts).
//
// Rule: the seed runs on every deploy, so it must never undo a choice an admin
// made in /admin/settings.
//   - No explicit AGREEMENT_FILENAME: bootstrap only. If any version is already
//     active, keep it. Otherwise activate the default file.
//   - Explicit AGREEMENT_FILENAME: deliberate override — activate that file
//     (subject to the pinned-hash rule) even if another version is active.
// The pinned-hash rule is the same as activateVersion() in app/lib/agreement-versions.ts:
// a file that changed since it was pinned is never re-activated.
import { readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const DEFAULT_AGREEMENT_FILENAME = "membership-agreement-v1.md";

/**
 * @param {object} db Prisma client (or a fake exposing agreementDocument.findFirst/findUnique/updateMany/upsert)
 * @param {object} opts
 * @param {string} [opts.filename] file in legal/ to activate (defaults to DEFAULT_AGREEMENT_FILENAME)
 * @param {boolean} [opts.explicit] true when the filename was set explicitly (AGREEMENT_FILENAME)
 * @param {string} [opts.legalDir] directory holding the version files
 * @param {{log: Function, warn: Function}} [opts.logger]
 * @returns {Promise<{action: "kept"|"activated"|"skipped"|"error", filename: string}>}
 */
export async function seedAgreementVersion(db, opts = {}) {
  const filename = opts.filename || DEFAULT_AGREEMENT_FILENAME;
  const explicit = opts.explicit === true;
  const legalDir = opts.legalDir ?? path.join(process.cwd(), "legal");
  const logger = opts.logger ?? console;

  if (!explicit) {
    const active = await db.agreementDocument.findFirst({ where: { active: true } });
    if (active) {
      logger.log(
        `Membership Agreement ${active.version} (${active.filename}) is active; leaving it ` +
          `(set AGREEMENT_FILENAME to override).`,
      );
      return { action: "kept", filename: active.filename };
    }
  }

  try {
    const content = readFileSync(path.join(legalDir, filename), "utf8");
    const hash = "sha384-" + crypto.createHash("sha384").update(content, "utf8").digest("base64");
    const version = filename.replace(/\.md$/i, "").match(/v\d+[a-z0-9.]*/i)?.[0] ?? filename;
    const existing = await db.agreementDocument.findUnique({ where: { filename } });
    if (existing && existing.hash !== hash) {
      logger.warn(`Skipped activating ${filename}: file changed since it was pinned.`);
      return { action: "skipped", filename };
    }
    if (existing?.active) {
      logger.log(`Membership Agreement ${version} (${filename}) is already active.`);
      return { action: "kept", filename };
    }
    await db.agreementDocument.updateMany({ where: { active: true }, data: { active: false } });
    await db.agreementDocument.upsert({
      where: { filename },
      update: { active: true, effectiveFrom: new Date() },
      create: { filename, version, hash, active: true },
    });
    logger.log(`Activated Membership Agreement ${version} (${filename}).`);
    return { action: "activated", filename };
  } catch (e) {
    logger.warn(`Could not seed Membership Agreement from ${filename}:`, e.message);
    return { action: "error", filename };
  }
}
