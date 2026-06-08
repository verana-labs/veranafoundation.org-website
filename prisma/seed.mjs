// One-time bootstrap: seed the Foundation admin allowlist from
// ADMIN_BOOTSTRAP_EMAILS (comma-separated). Idempotent (upsert), but intended
// to be run manually once — NOT on every deploy, so removing an admin in
// /admin/admins isn't undone. Run: `npm run db:seed`.
import { PrismaClient } from "@prisma/client";

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

await db.$disconnect();
