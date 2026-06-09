// The whole authenticated area is per-request (auth + DB); never prerender it.
// Header + footer come from the root layout. Width/padding is no longer applied
// here so /account and /account/working-groups can use the same full-bleed,
// grey-rule-separated section pattern as the marketing pages. The constrained
// container is provided by the nested layouts (admin/, account/org/) and by the
// /apply page itself. Middleware already requires a session for these routes.
export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
