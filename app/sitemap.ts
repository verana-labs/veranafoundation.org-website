import type { MetadataRoute } from "next";
import { SITE_URL } from "@/app/lib/site";

// Public marketing routes. The working-group detail pages (/working-groups/[slug])
// are intentionally omitted: they are force-dynamic and membership-gated, so they
// carry no value for anonymous crawlers and would require a DB read at build time.
// `changeFrequency`/`priority` are advisory hints only — modern crawlers largely
// ignore them, but they cost nothing and document intent.
const ROUTES: {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/ecosystem", changeFrequency: "monthly", priority: 0.8 },
  { path: "/members", changeFrequency: "weekly", priority: 0.7 },
  { path: "/working-groups", changeFrequency: "weekly", priority: 0.7 },
  { path: "/join", changeFrequency: "monthly", priority: 0.9 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/cookies", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
