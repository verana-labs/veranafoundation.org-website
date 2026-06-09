// Admin pages keep the constrained, padded container the (app) layout used to
// provide for everyone (full-bleed sections are only for /account*).
export default function AdminLayout({
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
