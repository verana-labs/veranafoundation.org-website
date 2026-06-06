"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const CONSENT_KEY = "vf-cookie-consent";

export default function Footer() {
  const [showBanner, setShowBanner] = useState(false);
  const year = new Date().getFullYear();

  useEffect(() => {
    setShowBanner(localStorage.getItem(CONSENT_KEY) === null);
  }, []);

  function setConsent(value: "all" | "essential") {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {}
    setShowBanner(false);
  }

  return (
    <>
      <footer className="site-footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
            <div>
              <h3>Foundation</h3>
              <ul className="space-y-2">
                <li>
                  <Link href="/about">About</Link>
                </li>
                <li>
                  <Link href="/contribute">Contribute</Link>
                </li>
                <li>
                  <Link href="/ecosystem">Ecosystem</Link>
                </li>
                <li>
                  <Link href="/blog">Blog</Link>
                </li>
              </ul>
            </div>
            <div>
              <h3>Participate</h3>
              <ul className="space-y-2">
                <li>
                  <Link href="/join">Join the Foundation</Link>
                </li>
                <li>
                  <Link href="/contribute">Working groups</Link>
                </li>
                <li>
                  <Link href="/contact">Contact</Link>
                </li>
              </ul>
            </div>
            <div>
              <h3>Open source</h3>
              <ul className="space-y-2">
                <li>
                  <a href="https://github.com/verana-labs" rel="noopener">
                    GitHub ↗
                  </a>
                </li>
                <li>
                  <a
                    href="https://verana-labs.github.io/verifiable-trust-spec/"
                    rel="noopener"
                  >
                    Verifiable Trust spec ↗
                  </a>
                </li>
                <li>
                  <a
                    href="https://verana-labs.github.io/verifiable-trust-vpr-spec/"
                    rel="noopener"
                  >
                    VPR spec ↗
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3>Related sites</h3>
              <ul className="space-y-2">
                <li>
                  <a href="https://veranacouncil.org" rel="noopener">
                    Verana Council ↗
                  </a>
                </li>
                <li>
                  <a href="https://verana.io" rel="noopener">
                    Verana network ↗
                  </a>
                </li>
                <li>
                  <a href="https://docs.verana.io" rel="noopener">
                    Verana docs ↗
                  </a>
                </li>
                <li>
                  <a href="https://2060.io" rel="noopener">
                    2060 ↗
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-14 pt-8 border-t border-rule flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-muted">
            <p>© {year} Verana Foundation (in formation, stewarded by 2060 OÜ)</p>
            <ul className="flex flex-wrap gap-4">
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/terms">Terms</Link>
              </li>
              <li>
                <Link href="/cookies">Cookies</Link>
              </li>
            </ul>
          </div>
        </div>
      </footer>

      {showBanner && (
        <div
          className="cookie-banner"
          role="dialog"
          aria-live="polite"
          aria-label="Cookie consent"
        >
          <p className="mb-3 text-ink text-sm">
            We use essential cookies to run this site and, with your consent,
            analytics cookies to improve it. We do not sell data. See the{" "}
            <Link href="/privacy" className="text-purple underline">
              Privacy Policy
            </Link>
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setConsent("all")}
              className="btn btn-primary text-sm px-4 py-2"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => setConsent("essential")}
              className="btn btn-secondary text-sm px-4 py-2"
            >
              Essential only
            </button>
            <Link href="/cookies" className="btn btn-ghost text-sm">
              Preferences
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
