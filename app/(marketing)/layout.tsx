import Nav from "@/app/components/Nav";
import Footer from "@/app/components/Footer";
import Reveal from "@/app/components/Reveal";

// Public marketing chrome (Nav + Footer). The authenticated (app) area uses its
// own shell — see app/(app)/layout.tsx.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      <main>{children}</main>
      <Footer />
      <Reveal />
    </>
  );
}
