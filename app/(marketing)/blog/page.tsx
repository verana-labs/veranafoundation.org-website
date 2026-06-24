import type { Metadata } from "next";
import Link from "next/link";
import { listPosts } from "@/app/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Announcements and the public record of the Verana Foundation: new members, grant rounds, spec releases and working-group milestones, partnerships, and incorporation updates.",
};

// ISR: rebuild from the source repo at most once an hour.
export const revalidate = 3600;

function formatDate(date: string): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function BlogPage() {
  const posts = await listPosts();

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
          {posts.length === 0 ? (
            <p className="text-sm text-muted">
              No posts yet. More to come as the Foundation incorporates and the
              working groups publish their milestones.
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="card reveal block">
                  <p className="text-xs uppercase tracking-wider text-muted font-mono">
                    {p.tag}
                    {p.date ? ` · ${formatDate(p.date)}` : ""}
                  </p>
                  <h3 className="mt-1">{p.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{p.excerpt}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
