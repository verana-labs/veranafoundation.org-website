import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,

  // Lint and type-check are run separately in CI; don't fail the
  // production/container build on them.
  eslint: { ignoreDuringBuilds: true },

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
