import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

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

const SITE_URL = "https://veranafoundation.org";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Verana Foundation: the non-profit steward of the open trust layer",
    template: "%s · Verana Foundation",
  },
  description:
    "The Verana Foundation is the non-profit that owns the Verifiable Trust and VPR specifications, stewards the open-source software, grows the ecosystem, and issues the VNA utility token it does not own. In formation, stewarded by 2060 OÜ.",
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/assets/img/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: "Verana Foundation: the non-profit steward of the open trust layer",
    description:
      "Owns the specifications. Stewards the open-source software. Grows the ecosystem. Two membership classes: Associate and Contributor.",
    images: [
      {
        url: "/assets/img/og-default.jpg",
        width: 1200,
        height: 630,
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/assets/img/og-default.jpg"],
  },
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
      </head>
      <body className="bg-surface text-ink">{children}</body>
    </html>
  );
}
