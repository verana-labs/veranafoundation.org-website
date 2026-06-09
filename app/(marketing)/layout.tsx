import Reveal from "@/app/components/Reveal";

// Nav + Footer now live in the root layout (shared by every page). Marketing
// pages just add the scroll-reveal animations.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Reveal />
    </>
  );
}
