"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faUsers,
  faShieldHalved,
  faIdCard,
  faGear,
  faRightFromBracket,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

export type MeUser = { name: string | null; email: string; image: string | null };
export type MeAction = { label: string; href: string; icon: string };

const ICONS: Record<string, IconDefinition> = {
  user: faUser,
  users: faUsers,
  "shield-halved": faShieldHalved,
  "id-card": faIdCard,
  gear: faGear,
};

/** Avatar label: name initials, else first-of-local + first-of-domain. */
export function avatarLabel(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1 && parts[0].length) return parts[0].slice(0, 2).toUpperCase();
  }
  const [local, domain] = email.split("@");
  return `${local?.[0] ?? ""}${domain?.[0] ?? ""}`.toUpperCase() || "?";
}

export default function UserMenu({
  user,
  actions,
}: {
  user: MeUser;
  actions: MeAction[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="block h-8 w-8 rounded-full overflow-hidden ring-1 ring-rule"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-8 w-8 object-cover" />
        ) : (
          <span className="grid h-8 w-8 place-items-center bg-purple text-white text-xs font-semibold">
            {avatarLabel(user.name, user.email)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-lg border border-rule bg-surface shadow-lg py-1 text-sm z-50"
        >
          <div className="px-3 py-2">
            <div className="text-xs text-muted">Signed in as</div>
            <div className="font-medium truncate">{user.email}</div>
          </div>
          <div className="border-t border-rule my-1" />
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-rule/30"
            >
              {ICONS[a.icon] && (
                <FontAwesomeIcon icon={ICONS[a.icon]} className="w-4 text-muted" />
              )}
              {a.label}
            </Link>
          ))}
          <div className="border-t border-rule my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-rule/30 text-left"
          >
            <FontAwesomeIcon icon={faRightFromBracket} className="w-4 text-muted" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
