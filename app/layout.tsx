import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "./globals.css";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import Analytics from "./components/Analytics";
import JsonLd from "./components/JsonLd";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, OG_IMAGE } from "./lib/site";

// We import the Font Awesome CSS ourselves (above); stop it auto-injecting.
config.autoAddCss = false;

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const HOME_TITLE =
  "Verana Foundation: the non-profit steward of the open trust layer";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: HOME_TITLE,
    template: "%s · Verana Foundation",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Verana",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/assets/img/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/assets/img/foundation-logo.png" }],
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: HOME_TITLE,
    description:
      "Owns the specifications. Stewards the open-source software. Grows the ecosystem. Two membership classes: Associate and Contributor.",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: SITE_DESCRIPTION,
    site: "@Verana_io",
    images: [OG_IMAGE],
  },
};

// Browser UI tinting — matches the manifest theme_color (Verana purple), per
// light/dark scheme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#763ef0" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d11" },
  ],
};

// Set the theme before paint to avoid a flash of the wrong color scheme.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('vf-theme');
    var theme = stored
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      // The inline themeInitScript sets data-theme on <html> before React
      // hydrates, so the attribute intentionally differs from the server HTML.
      // Scope hydration-mismatch suppression to this element only.
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <JsonLd />
      </head>
      <body className="bg-surface text-ink">
        <Analytics />
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
