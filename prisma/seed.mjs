// One-time bootstrap: seed the Foundation admin allowlist from
// ADMIN_BOOTSTRAP_EMAILS (comma-separated). Idempotent (upsert), but intended
// to be run manually once — NOT on every deploy, so removing an admin in
// /admin/admins isn't undone. Run: `npm run db:seed`.
import { PrismaClient } from "@prisma/client";

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

// Optional: seed the active Membership Agreement from env (admins can also set
// it in /admin/settings). Only creates a version that doesn't already exist.
const agreementUrl = process.env.AGREEMENT_PDF_URL;
if (agreementUrl) {
  const version = process.env.AGREEMENT_VERSION ?? "v1";
  const existing = await db.agreementDocument.findFirst({ where: { version } });
  if (!existing) {
    await db.agreementDocument.updateMany({
      where: { active: true },
      data: { active: false },
    });
    await db.agreementDocument.create({
      data: { version, url: agreementUrl, active: true },
    });
    console.log(`Seeded active Membership Agreement ${version}.`);
  }
}

await db.$disconnect();
