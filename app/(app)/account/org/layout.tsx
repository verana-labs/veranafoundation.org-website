// Org management pages keep the constrained, padded container the (app) layout
// used to provide (the full-bleed section pattern is only for the top-level
// /account and /account/working-groups pages).
export default function OrgLayout({
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
