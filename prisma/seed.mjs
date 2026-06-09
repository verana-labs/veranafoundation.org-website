// One-time bootstrap: seed the Foundation admin allowlist from
// ADMIN_BOOTSTRAP_EMAILS (comma-separated). Idempotent (upsert), but intended
// to be run manually once — NOT on every deploy, so removing an admin in
// /admin/admins isn't undone. Run: `npm run db:seed`.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Run directly via `node`, so load local env ourselves (the Prisma CLI loads it
// via prisma.config.ts, but `node prisma/seed.mjs` doesn't). In the cluster,
// env comes from the Job and these files are absent (no-op).
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file absent — ignore
  }
}

const db = new PrismaClient();

const emails = (process.env.ADMIN_BOOTSTRAP_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

for (const email of emails) {
  await db.adminAllowlistEntry.upsert({
    where: { email },
    update: {},
    create: { email },
  });
}

console.log(`Seeded ${emails.length} admin allowlist entr${emails.length === 1 ? "y" : "ies"}.`);

// Activate a Membership Agreement version file from legal/ (admins can switch
// versions in /admin/settings). Pins the file's sha384 on first activation;
// never re-pins a changed file (that would defeat the integrity guarantee).
const agreementFile = process.env.AGREEMENT_FILENAME ?? "membership-agreement-v1.md";
try {
  const content = readFileSync(path.join(process.cwd(), "legal", agreementFile), "utf8");
  const hash = "sha384-" + crypto.createHash("sha384").update(content, "utf8").digest("base64");
  const version = agreementFile.replace(/\.md$/i, "").match(/v\d+[a-z0-9.]*/i)?.[0] ?? agreementFile;
  const existing = await db.agreementDocument.findUnique({ where: { filename: agreementFile } });
  if (existing && existing.hash !== hash) {
    console.warn(`Skipped activating ${agreementFile}: file changed since it was pinned.`);
  } else {
    await db.agreementDocument.updateMany({ where: { active: true }, data: { active: false } });
    await db.agreementDocument.upsert({
      where: { filename: agreementFile },
      update: { active: true },
      create: { filename: agreementFile, version, hash, active: true },
    });
    console.log(`Activated Membership Agreement ${version} (${agreementFile}).`);
  }
} catch (e) {
  console.warn(`Could not seed Membership Agreement from ${agreementFile}:`, e.message);
}

await db.$disconnect();
