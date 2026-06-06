import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Announcements and the public record of the Verana Foundation: new members, grant rounds, spec releases and working-group milestones, partnerships, and incorporation updates.",
};

const POSTS = [
  {
    date: "2026-Q2",
    tag: "Formation",
    title: "The Verana Foundation, in formation",
    excerpt:
      "2060 OÜ acts as organizer and steward while the Foundation is established. Founding members: 2060 OÜ, Mobiera, and Orchestrating Identity.",
  },
  {
    date: "2026-Q2",
    tag: "Specifications",
    title: "Verifiable Trust v4 and VPR v4 owned and hosted by the Foundation",
    excerpt:
      "The two specifications, authored in the open, are owned and hosted by the Foundation and maintained by their working groups.",
  },
  {
    date: "2026-Q2",
    tag: "Open source",
    title: "Reference implementations stewarded under Apache 2.0",
    excerpt:
      "VPR, Indexer, VS-Agent, and the reference Frontend are hosted and maintained in public; copyright held by contributors.",
  },
];

export default function BlogPage() {
  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Blog</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight">
            Announcements &amp; the public record
          </h1>
          <div className="accent-line mt-6" />
        </div>
      </section>

      <section>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {POSTS.map((p) => (
              <article key={p.title} className="card reveal">
                <p className="text-xs uppercase tracking-wider text-muted font-mono">
                  {p.tag} · {p.date}
                </p>
                <h3 className="mt-1">{p.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{p.excerpt}</p>
              </article>
            ))}
          </div>
          <p className="text-sm text-muted mt-10">
            More to come as the Foundation incorporates and the working groups
            publish their milestones.
          </p>
        </div>
      </section>
    </>
  );
}
