// Org management pages use the same full-bleed, grey-rule-separated section
// pattern as the rest of /account (each page renders its own PageHero +
// Sections), so the layout is a pass-through.
export default function OrgLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
