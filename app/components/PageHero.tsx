import Link from "next/link";

/**
 * Marketing-style page hero (tag/back-link + display title + accent line + lead),
 * matching the full-bleed, grey-rule-separated sections used across the site.
 * Used by /account/* and /admin/* pages so they share the marketing look.
 */
export function PageHero({
  tag,
  back,
  title,
  lead,
}: {
  tag?: string;
  back?: { href: string; label: string };
  title: string;
  lead?: React.ReactNode;
}) {
  return (
    <section className="border-b border-rule">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        {back ? (
          <p className="mb-4">
            <Link href={back.href} className="tag hover:text-purple transition-colors">
              ← {back.label}
            </Link>
          </p>
        ) : tag ? (
          <p className="tag mb-4">{tag}</p>
        ) : null}
        <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">{title}</h1>
        <div className="accent-line mt-6" />
        {lead && (
          <p className="mt-8 text-lg text-muted max-w-2xl leading-relaxed">{lead}</p>
        )}
      </div>
    </section>
  );
}

/** A full-bleed content section with the constrained inner container. */
export function Section({
  children,
  bordered = true,
  className = "",
}: {
  children: React.ReactNode;
  bordered?: boolean;
  className?: string;
}) {
  return (
    <section className={bordered ? "border-b border-rule" : ""}>
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 ${className}`}>
        {children}
      </div>
    </section>
  );
}
