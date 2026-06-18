"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { GA_MEASUREMENT_ID } from "@/app/lib/site";

// Consent key written by the cookie banner in Footer.tsx. "all" = analytics
// allowed, "essential" = none. See app/(marketing)/cookies/page.tsx — the policy
// states analytics load ONLY after the visitor selects "Accept all".
const CONSENT_KEY = "vf-cookie-consent";

// Footer dispatches this on the window when the choice changes, so analytics can
// start within the same session without a reload.
export const CONSENT_EVENT = "vf-consent-change";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Google Analytics 4, gated on cookie consent.
 *
 * The gtag.js script is not injected at all until consent is "all"; choosing
 * "Essential only" (or making no choice) loads nothing. Once granted, we also
 * fire a page_view on client-side route changes, which gtag does not do
 * automatically in a single-page App Router navigation.
 */
export default function Analytics() {
  const [granted, setGranted] = useState(false);
  const pathname = usePathname();

  // Read the stored choice on mount and listen for changes from the banner.
  useEffect(() => {
    const read = () => setGranted(localStorage.getItem(CONSENT_KEY) === "all");
    read();
    window.addEventListener(CONSENT_EVENT, read);
    // Also catch changes made in another tab.
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(CONSENT_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  // SPA route-change pageviews (only once GA is live).
  useEffect(() => {
    if (!granted || !window.gtag) return;
    window.gtag("event", "page_view", {
      page_path: pathname,
      page_location: window.location.href,
    });
  }, [granted, pathname]);

  if (!granted || !GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        id="ga-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
