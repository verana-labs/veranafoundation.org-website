// Seed: the Foundation admin allowlist from ADMIN_BOOTSTRAP_EMAILS
// (comma-separated) and the Membership Agreement bootstrap. CI runs it on
// every deploy (ci/seed-job.yaml), so everything here must be idempotent and
// must never undo an admin's later choice: the allowlist is upsert-only
// (removing an admin in /admin/admins is not undone), and the agreement step
// keeps whatever version an admin activated (see prisma/seed-agreement.mjs).
// Run locally: `npm run db:seed`.
import { PrismaClient } from "@prisma/client";
import { seedAgreementVersion } from "./seed-agreement.mjs";

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

// Membership Agreement: bootstrap-only unless AGREEMENT_FILENAME is set
// explicitly (admins switch versions in /admin/settings; a deploy must not
// reset their choice). Pins the file's sha384 on first activation; never
// re-pins a changed file (that would defeat the integrity guarantee).
const agreementFilename = process.env.AGREEMENT_FILENAME?.trim();
await seedAgreementVersion(db, {
  filename: agreementFilename || undefined,
  explicit: Boolean(agreementFilename),
});

await db.$disconnect();
