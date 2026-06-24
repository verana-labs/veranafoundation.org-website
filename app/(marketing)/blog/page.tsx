import type { Metadata } from "next";
import Link from "next/link";
import { listPostsWithPreview } from "@/app/lib/blog";
import { Markdown } from "@/app/components/Markdown";
import { AuthorByline } from "@/app/components/AuthorByline";

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
  const posts = await listPostsWithPreview();

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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {posts.length === 0 ? (
            <p className="text-sm text-muted">
              No posts yet. More to come as the Foundation incorporates and the
              working groups publish their milestones.
            </p>
          ) : (
            <div className="flex flex-col gap-10">
              {posts.map((p) => (
                <article key={p.slug} className="blog-card reveal">
                  {/* media preview */}
                  {p.media ? (
                    <Link href={`/blog/${p.slug}`} className="blog-card-media block">
                      {p.media.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.media.url} alt="" loading="lazy" />
                      ) : (
                        <video src={p.media.url} controls preload="metadata" />
                      )}
                    </Link>
                  ) : null}

                  <div className="blog-card-body">
                    {/* meta row: clickable author (avatar + name) and tag/date */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <AuthorByline
                        author={p.author}
                        avatar={p.authorAvatar}
                        social={p.authorSocial}
                        size={36}
                      />
                      <p className="text-xs uppercase tracking-wider text-muted font-mono">
                        {p.tag}
                        {p.date ? ` · ${formatDate(p.date)}` : ""}
                      </p>
                    </div>

                    <h2 className="display text-2xl sm:text-3xl leading-tight mt-3">
                      <Link href={`/blog/${p.slug}`} className="hover:underline">
                        {p.title}
                      </Link>
                    </h2>

                    {p.excerpt ? (
                      <p className="text-base text-muted leading-relaxed mt-3">
                        {p.excerpt}
                      </p>
                    ) : null}

                    {p.teaser ? (
                      <div className="blog-card-teaser mt-3">
                        <Markdown source={p.teaser} />
                      </div>
                    ) : null}

                    <div className="mt-5">
                      <Link href={`/blog/${p.slug}`} className="blog-readmore">
                        Read more →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
