import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/app/lib/db";
import { linkMemberAccess } from "@/app/lib/access";
import { smtpServer, mailFrom } from "@/app/lib/smtp";
import authConfig from "@/auth.config";

const emailServer = smtpServer();

// Full Auth.js instance (Node runtime): edge-safe config + the Prisma adapter.
// JWT sessions (set in auth.config) keep middleware edge-compatible while the
// adapter still persists users/accounts and email verification tokens.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // SMTP magic-link provider lives here (Node runtime only), not in the
  // edge-shared auth.config. Registered only when SMTP (MAIL_*) is configured.
  providers: [
    ...authConfig.providers,
    ...(emailServer
      ? [Nodemailer({ server: emailServer, from: mailFrom() })]
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
