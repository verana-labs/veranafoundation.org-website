import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { isAdmin } from "@/app/lib/authz";

// The whole authenticated area is per-request (auth + DB); never prerender it.
export const dynamic = "force-dynamic";

// Authenticated app shell for /account and /admin. Middleware already requires a
// session; this also resolves the admin link and renders the app chrome.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login?callbackUrl=/account");

  const admin = await isAdmin(user.email);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-rule">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <Link href="/account" className="display text-lg">
            Verana Foundation
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/account" className="hover:underline">
              Account
            </Link>
            {admin && (
              <Link href="/admin" className="hover:underline">
                Admin
              </Link>
            )}
            <span className="text-muted hidden sm:inline">{user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit" className="btn">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
