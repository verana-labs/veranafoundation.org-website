import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/app/lib/db";
import { linkMemberAccess } from "@/app/lib/access";
import authConfig from "@/auth.config";

// Full Auth.js instance (Node runtime): edge-safe config + the Prisma adapter.
// JWT sessions (set in auth.config) keep middleware edge-compatible while the
// adapter still persists users/accounts and email verification tokens.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // SMTP magic-link provider lives here (Node runtime only), not in the
  // edge-shared auth.config. Registered only when EMAIL_SERVER is set.
  providers: [
    ...authConfig.providers,
    ...(process.env.EMAIL_SERVER
      ? [Nodemailer({ server: process.env.EMAIL_SERVER, from: process.env.EMAIL_FROM })]
      : []),
  ],
  adapter: PrismaAdapter(db),
  events: {
    // On every sign-in, link the user to any org that allowlisted their email.
    async signIn({ user }) {
      if (user.id && user.email) await linkMemberAccess(user.id, user.email);
    },
  },
});
