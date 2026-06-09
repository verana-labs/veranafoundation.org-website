// The whole authenticated area is per-request (auth + DB); never prerender it.
// Header + footer come from the root layout; this just constrains the content.
// Middleware already requires a session for /account, /admin and /apply.
export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      {children}
    </div>
  );
}
