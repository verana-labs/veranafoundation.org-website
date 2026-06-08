import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Resend from "next-auth/providers/resend";

// Edge-safe Auth.js config (no database adapter) shared by the route handler and
// middleware. The DB-backed adapter lives in auth.ts (Node runtime only).
export default {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [
    // Google emails are always verified.
    Google({ allowDangerousEmailAccountLinking: true }),
    GitHub({
      allowDangerousEmailAccountLinking: true,
      authorization: { params: { scope: "read:user user:email" } },
    }),
    // Magic link — verified by construction (they click a link to that address).
    Resend({ apiKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM }),
  ],
  callbacks: {
    // ADR-0002 safety rule: the identity key is a *verified* email. Account
    // auto-linking is only safe because every method here yields a verified one.
    async signIn({ user, account, profile }) {
      if (!account) return false;
      switch (account.provider) {
        case "google":
          return (profile as { email_verified?: boolean })?.email_verified === true;
        case "resend":
          return true;
        case "github": {
          // GitHub's profile email may be public/unverified — fetch the primary
          // verified email from the API and key the account on it.
          const res = await fetch("https://api.github.com/user/emails", {
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              "User-Agent": "veranafoundation.org",
              Accept: "application/vnd.github+json",
            },
          });
          if (!res.ok) return false;
          const emails = (await res.json()) as Array<{
            email: string;
            primary: boolean;
            verified: boolean;
          }>;
          const verified =
            emails.find((e) => e.primary && e.verified) ??
            emails.find((e) => e.verified);
          if (!verified) return false;
          user.email = verified.email;
          return true;
        }
        default:
          return false;
      }
    },
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isProtected =
        pathname.startsWith("/account") || pathname.startsWith("/admin");
      if (!isProtected) return true;
      // Coarse "is logged in?" gate; fine-grained role checks run server-side
      // in the (app) layouts/pages, which can hit the DB.
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
