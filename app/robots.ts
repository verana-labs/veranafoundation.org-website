import type { MetadataRoute } from "next";
import { SITE_URL } from "@/app/lib/site";

// Crawl directives. The public marketing site is fully indexable; the
// authenticated/transactional surfaces (account, admin, apply, sign-in) and the
// internal API/asset routes carry no SEO value and are kept out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/admin", "/apply", "/login", "/api/", "/logo/", "/pay/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
