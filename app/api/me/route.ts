import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdmin, effectiveMemberships } from "@/app/lib/authz";

export const dynamic = "force-dynamic";

// Lightweight "who am I + what can I do" for the header. Returns the current
// user (or null) and the role-based menu actions. Fetched client-side by the
// nav so marketing pages stay static.
export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user?.email) {
    return NextResponse.json({ user: null, actions: [] });
  }

  const [admin, links] = await Promise.all([
    isAdmin(user.email),
    user.id ? effectiveMemberships(user.id) : Promise.resolve([]),
  ]);

  const actions: { label: string; href: string; icon: string }[] = [
    { label: "Account", href: "/account", icon: "user" },
    { label: "Working groups", href: "/account/working-groups", icon: "users" },
  ];
  if (links.length === 0) {
    actions.push({ label: "Join", href: "/apply", icon: "id-card" });
  }
  if (admin) {
    actions.push({ label: "Admin", href: "/admin", icon: "shield-halved" });
  }

  return NextResponse.json({
    user: {
      name: user.name ?? null,
      email: user.email,
      image: user.image ?? null,
    },
    actions,
  });
}
