import NextAuth from "next-auth";
import authConfig from "@/auth.config";

// Edge middleware uses the adapter-free config; the `authorized` callback
// redirects unauthenticated users away from /account and /admin.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/account/:path*", "/admin/:path*"],
};
