import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdmin, effectiveMemberships } from "@/app/lib/authz";
import { db } from "@/app/lib/db";

export const dynamic = "force-dynamic";

// Lightweight "who am I + what can I do" for the header. Returns the current
// user (or null) and the role-based menu actions. Fetched client-side by the
// nav so marketing pages stay static.
export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user?.email) {
    return NextResponse.json({ user: null, actions: [], isMember: false });
  }

  const [admin, links, record] = await Promise.all([
    isAdmin(user.email),
    user.id ? effectiveMemberships(user.id) : Promise.resolve([]),
    user.id
      ? db.user.findUnique({ where: { id: user.id }, select: { displayName: true } })
      : Promise.resolve(null),
  ]);

  const actions: { label: string; href: string; icon: string }[] = [
    { label: "Account", href: "/account", icon: "user" },
    { label: "Settings", href: "/account/settings", icon: "gear" },
  ];
  if (links.length === 0) {
    actions.push({ label: "Join", href: "/apply", icon: "id-card" });
  }
  if (admin) {
    actions.push({ label: "Admin", href: "/admin", icon: "shield-halved" });
  }

  return NextResponse.json({
    user: {
      // The user-chosen display name wins everywhere (ADR-0003).
      name: record?.displayName ?? user.name ?? null,
      email: user.email,
      image: user.image ?? null,
    },
    actions,
    // Whether the user already belongs to / acts for any member — used to hide
    // the header "Join" button.
    isMember: links.length > 0,
  });
}
