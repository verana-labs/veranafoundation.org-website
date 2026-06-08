import { defineConfig } from "prisma/config";

// Replaces the deprecated package.json#prisma key (removed in Prisma 7).
// The in-cluster migrate Job runs `prisma migrate deploy` directly and doesn't
// need this; it's only used by `prisma db seed` / `npm run db:seed`.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node prisma/seed.mjs",
  },
});
