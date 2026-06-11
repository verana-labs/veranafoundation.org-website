import crypto from "node:crypto";
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/app/lib/db";
import { linkMemberAccess } from "@/app/lib/access";
import { smtpServer, mailFrom } from "@/app/lib/smtp";
import { sendEmail } from "@/app/lib/email";
import { emailLayout } from "@/app/lib/email-layout";
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
      ? [
          Nodemailer({
            server: emailServer,
            from: mailFrom(),
            // One-time code instead of a magic link: the user types the code
            // into /login, which verifies it via the provider callback —
            // hashing, single-use and expiry stay Auth.js-managed.
            maxAge: 10 * 60, // code valid 10 minutes
            generateVerificationToken: () =>
              String(crypto.randomInt(100000, 1000000)),
            async sendVerificationRequest({ identifier, token }) {
              await sendEmail({
                to: identifier,
                subject: `${token} is your Verana Foundation sign-in code`,
                html: emailLayout({
                  heading: "Your sign-in code",
                  bodyHtml: `
                    <p style="margin:0 0 16px;">Enter this code on the sign-in
                    page to continue:</p>
                    <p style="margin:0 0 16px;text-align:center;font-family:ui-monospace,Menlo,monospace;
                       font-size:32px;font-weight:700;letter-spacing:0.3em;color:#111111;">${token}</p>
                    <p style="margin:0 0 4px;color:#5b5b5b;font-size:12px;">The code
                    expires in 10 minutes and can only be used once.</p>
                    <p style="margin:0;color:#5b5b5b;font-size:12px;">If you didn't
                    request this, you can safely ignore this email.</p>`,
                }),
              });
            },
          }),
        ]
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
