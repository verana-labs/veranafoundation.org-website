"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import UserMenu, { type MeUser, type MeAction } from "@/app/components/UserMenu";

type Me = { user: MeUser | null; actions: MeAction[] };

const NAV_LINKS = [
  { href: "/about", label: "About" },
  { href: "/contribute", label: "Contribute" },
  { href: "/ecosystem", label: "Ecosystem" },
  { href: "/blog", label: "Blog" },
];

const ANNOUNCEMENT_KEY = "vf-announcement-dismissed";
const THEME_KEY = "vf-theme";

export default function Nav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [announcementVisible, setAnnouncementVisible] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [me, setMe] = useState<Me | undefined>(undefined);

  useEffect(() => {
    setAnnouncementVisible(localStorage.getItem(ANNOUNCEMENT_KEY) !== "true");
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ user: null, actions: [] }));
  }, [pathname]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  }

  function dismissAnnouncement() {
    setAnnouncementVisible(false);
    try {
      localStorage.setItem(ANNOUNCEMENT_KEY, "true");
    } catch {}
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      {announcementVisible && (
        <aside className="announcement">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-4 justify-center text-center">
            <span>
              ◆ The Verana Foundation is in formation, stewarded by 2060 OÜ.{" "}
              <Link href="/about" className="underline">
                About →
              </Link>
            </span>
            <button
              type="button"
              onClick={dismissAnnouncement}
              aria-label="Dismiss announcement"
              className="ml-auto text-white/80 hover:text-white flex-shrink-0"
            >
              ×
            </button>
          </div>
        </aside>
      )}

      <header className="site-header sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/"
              className="flex items-center gap-2.5 wordmark text-xl text-ink"
              aria-label="Verana Foundation home"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 54 52"
                aria-hidden="true"
              >
                <path
                  fill="#763EF0"
                  d="M26.9932 51.6972L5.805 11.0977L2.91263 16.2161L0 10.6048L5.98725 0L26.9932 40.2483L47.9993 0L54 10.6217L51.0773 16.2161L48.1849 11.0977L26.9932 51.6972Z"
                />
                <path
                  fill="#1FB57A"
                  d="M13.696 0L26.9935 25.4637L39.9367 0H13.696Z"
                />
              </svg>
              <span>
                Verana<span className="dot">Foundation</span>
              </span>
            </Link>

            <nav
              className="hidden md:flex items-center gap-8"
              aria-label="Primary"
            >
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="nav-link"
                  aria-current={isActive(link.href) ? "page" : undefined}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-3">
              {me === undefined ? null : me.user ? (
                <UserMenu user={me.user} actions={me.actions} />
              ) : (
                <Link href="/login" className="nav-link text-sm">
                  Log in
                </Link>
              )}
              <Link href="/join" className="btn btn-primary text-sm px-4 py-2">
                Join
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                className="theme-toggle"
                aria-label="Switch theme"
                aria-pressed={theme === "dark"}
              >
                <svg
                  className="icon-moon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <svg
                  className="icon-sun"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-1 md:hidden">
              <button
                type="button"
                onClick={toggleTheme}
                className="theme-toggle"
                aria-label="Switch theme"
                aria-pressed={theme === "dark"}
              >
                <svg
                  className="icon-moon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <svg
                  className="icon-sun"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                className="p-2 -mr-2 text-ink"
                aria-label="Open menu"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  aria-hidden="true"
                >
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>
            </div>
          </div>

          {menuOpen && (
            <div
              id="mobile-menu"
              className="md:hidden pb-4 flex flex-col items-start"
            >
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block w-full py-2 nav-link"
                  aria-current={isActive(link.href) ? "page" : undefined}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/join"
                className="block w-full py-2 nav-link font-medium text-purple"
              >
                Join →
              </Link>
              <div className="w-full border-t border-rule my-2" />
              {me?.user ? (
                <>
                  <span className="text-xs text-muted py-1 truncate w-full">
                    {me.user.email}
                  </span>
                  {me.actions.map((a) => (
                    <Link
                      key={a.href}
                      href={a.href}
                      className="block w-full py-2 nav-link"
                    >
                      {a.label}
                    </Link>
                  ))}
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="block w-full text-left py-2 nav-link"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link href="/login" className="block w-full py-2 nav-link">
                  Log in
                </Link>
              )}
            </div>
          )}
        </div>
      </header>
    </>
  );
}
