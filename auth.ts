import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/app/lib/db";
import authConfig from "@/auth.config";

// Full Auth.js instance (Node runtime): edge-safe config + the Prisma adapter.
// JWT sessions (set in auth.config) keep middleware edge-compatible while the
// adapter still persists users/accounts and email verification tokens.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  ...authConfig,
});
