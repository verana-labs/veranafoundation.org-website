import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, listPosts } from "@/app/lib/blog";
import { Markdown } from "@/app/components/Markdown";
import { AuthorByline } from "@/app/components/AuthorByline";

// ISR: rebuild a post from the source repo at most once an hour.
export const revalidate = 3600;

export async function generateStaticParams() {
  const posts = await listPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return { title: "Blog" };
  return {
    title: `${post.title} · Blog`,
    description: post.excerpt,
    openGraph: { title: post.title, description: post.excerpt, type: "article" },
  };
}

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

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">
            {post.tag}
            {post.date ? ` · ${formatDate(post.date)}` : ""}
          </p>
          <h1 className="display text-4xl sm:text-5xl leading-tight">{post.title}</h1>
          <div className="accent-line mt-6" />
          <div className="mt-6">
            <AuthorByline
              author={post.author}
              avatar={post.authorAvatar}
              social={post.authorSocial}
            />
          </div>
        </div>
      </section>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Markdown source={post.bodyMarkdown} />

        <div className="mt-12 border-t border-rule pt-8">
          <Link href="/blog" className="text-sm text-muted hover:text-ink">
            ← Back to all posts
          </Link>
        </div>
      </article>
    </>
  );
}
