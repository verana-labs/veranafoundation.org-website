// Admin pages use the same full-bleed, grey-rule-separated section pattern as
// the marketing and /account pages (each page renders its own PageHero +
// Sections), so the layout is a pass-through.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
