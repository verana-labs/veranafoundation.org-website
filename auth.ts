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
            // Branded magic-link email (Verana logo + themed button).
            async sendVerificationRequest({ identifier, url }) {
              await sendEmail({
                to: identifier,
                subject: "Sign in to the Verana Foundation",
                html: emailLayout({
                  heading: "Sign in to the Verana Foundation",
                  bodyHtml: `
                    <p style="margin:0 0 12px;">Use the button below to sign in.
                    This link expires shortly and can only be used once.</p>
                    <p style="margin:0;color:#5b5b5b;font-size:12px;">If you didn't
                    request this, you can safely ignore this email.</p>`,
                  button: { label: "Sign in", href: url },
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
