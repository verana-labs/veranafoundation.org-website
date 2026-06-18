// Single source of truth for site-wide identity used by metadata, the sitemap,
// robots, the web manifest and JSON-LD structured data. Keeping these here means
// the canonical URL, name and social links can never drift between, say, the
// OpenGraph tags in layout.tsx and the Organization schema.

export const SITE_URL = "https://veranafoundation.org";

export const SITE_NAME = "Verana Foundation";

export const SITE_DESCRIPTION =
  "The Verana Foundation is the non-profit that owns the Verifiable Trust and VPR specifications, stewards the open-source software, grows the ecosystem, and issues the VNA utility token it does not own. In formation, stewarded by 2060 OÜ.";

// Default OpenGraph / Twitter image (1200×630). Lives in public/.
export const OG_IMAGE = "/assets/img/og-default.jpg";

// Google Analytics 4 measurement ID. Shared with verana.io. Overridable via the
// NEXT_PUBLIC_GA_ID build-time env var so a staging/preview deploy can point at a
// separate property (or disable analytics entirely by leaving it empty).
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_ID ?? "G-9H5406F02W";

// Brand presence elsewhere — drives JSON-LD `sameAs` and is mirrored by the
// footer links. Keep in sync with app/components/Footer.tsx.
export const SOCIAL_LINKS = [
  "https://github.com/verana-labs",
  "https://www.linkedin.com/company/verana-foundation/",
  "https://x.com/Verana_io",
  "https://discord.gg/edjaFn252q",
  "https://verana.io",
] as const;
