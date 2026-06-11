import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,

  // sharp is a native module (logo resizing) — keep it external so the
  // standalone tracer ships its prebuilt musl binaries instead of bundling.
  serverExternalPackages: ["sharp"],

  // Logo uploads ride server actions; the default body limit is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },

  // The Membership Agreement template is read from disk at runtime when a
  // member signs (app/lib/agreement-template.ts). `output: "standalone"` only
  // ships traced files, so include legal/ for the routes that render it.
  outputFileTracingIncludes: {
    "/apply": ["./legal/**"],
    "/account/**": ["./legal/**"],
    "/admin/**": ["./legal/**"],
  },

  // Lint and type-check are run separately in CI; don't fail the
  // production/container build on them.
  eslint: { ignoreDuringBuilds: true },

  // Old URLs of the working-groups board (pre-ADR-0003 restructure): the
  // public page replaced /contribute, and the signed-in copy at
  // /account/working-groups was retired. Keep bookmarks and inbound links alive.
  async redirects() {
    return [
      { source: "/contribute", destination: "/working-groups", permanent: true },
      {
        source: "/account/working-groups",
        destination: "/working-groups",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        // Brand assets, illustrations, favicons, og-image. Bounded
        // freshness with stale-while-revalidate so users never block on
        // a background refresh.
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
