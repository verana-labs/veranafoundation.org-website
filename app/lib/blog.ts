/**
 * Blog content, sourced from a public GitHub repository (the "source of truth"),
 * fetched server-side with ISR. The repo, path, and branch are configurable:
 *
 *   BLOG_REPO   (e.g. "verana-labs/social-posts") — owner/name
 *   BLOG_PATH   (e.g. "veranafoundation.org/blog") — folder holding the .md posts
 *   BLOG_BRANCH (e.g. "main")                    — optional, defaults to "main"
 *
 * Each post is a Markdown file `YYYY-MM-DD-slug.md` with YAML-ish front matter
 * (title, date, tag, excerpt, author, draft) followed by the Markdown body.
 *
 * Auth: reuses the minutes-repo PAT (MINUTES_GITHUB_TOKEN) if present — any valid
 * token lifts the GitHub limit from 60/hr (anonymous, shared per egress IP) to
 * 5,000/hr; a fine-grained PAT can always read public repos. Every call is wrapped
 * so a GitHub failure returns an empty/placeholder result — build and runtime
 * never break on GitHub.
 */

const API = "https://api.github.com";
const REVALIDATE = 3600; // 1 hour

const REPO = process.env.BLOG_REPO ?? "verana-labs/social-posts";
const PATH = process.env.BLOG_PATH ?? "veranafoundation.org/blog";
const BRANCH = process.env.BLOG_BRANCH ?? "main";
const TOKEN = process.env.BLOG_GITHUB_TOKEN ?? process.env.MINUTES_GITHUB_TOKEN;

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "veranafoundation.org",
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

export type PostMeta = {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  tag: string;
  excerpt: string;
  author: string;
};

export type Post = PostMeta & { bodyMarkdown: string };

type RawFrontMatter = Record<string, string>;

/** Minimal YAML front-matter parser: flat `key: value` pairs between `---` fences. */
function parseFrontMatter(raw: string): { data: RawFrontMatter; body: string } {
  const match = /^﻿?---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const data: RawFrontMatter = {};
  for (const line of match[1].split("\n")) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[m[1].toLowerCase()] = value;
  }
  return { data, body: match[2] };
}

/** Filename "2026-06-24-separation-of-powers.md" -> slug "separation-of-powers". */
function slugFromFilename(name: string): string {
  return name.replace(/\.md$/i, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function toMeta(slug: string, data: RawFrontMatter): PostMeta {
  return {
    slug,
    title: data.title ?? slug,
    date: data.date ?? "",
    tag: data.tag ?? "Blog",
    excerpt: data.excerpt ?? "",
    author: data.author ?? "Verana Foundation",
  };
}

function isDraft(data: RawFrontMatter): boolean {
  return String(data.draft ?? "").toLowerCase() === "true";
}

async function fetchRaw(downloadUrl: string): Promise<string | null> {
  try {
    const res = await fetch(downloadUrl, {
      headers: headers(),
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

type DirEntry = { name: string; type: string; download_url: string | null };

/** List published posts (newest first). Returns [] if GitHub is unreachable. */
export async function listPosts(): Promise<PostMeta[]> {
  try {
    const url = `${API}/repos/${REPO}/contents/${PATH}?ref=${encodeURIComponent(BRANCH)}`;
    const res = await fetch(url, { headers: headers(), next: { revalidate: REVALIDATE } });
    if (!res.ok) return [];
    const entries = (await res.json()) as DirEntry[];
    const files = entries.filter(
      (e) => e.type === "file" && /\.md$/i.test(e.name) && e.name.toLowerCase() !== "readme.md",
    );

    const posts = await Promise.all(
      files.map(async (f) => {
        if (!f.download_url) return null;
        const raw = await fetchRaw(f.download_url);
        if (raw == null) return null;
        const { data } = parseFrontMatter(raw);
        if (isDraft(data)) return null;
        return toMeta(slugFromFilename(f.name), data);
      }),
    );

    return posts
      .filter((p): p is PostMeta => p !== null)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  } catch {
    return [];
  }
}

/** Fetch a single post by slug. Returns null if not found / unreachable / draft. */
export async function getPost(slug: string): Promise<Post | null> {
  try {
    const url = `${API}/repos/${REPO}/contents/${PATH}?ref=${encodeURIComponent(BRANCH)}`;
    const res = await fetch(url, { headers: headers(), next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    const entries = (await res.json()) as DirEntry[];
    const file = entries.find(
      (e) => e.type === "file" && /\.md$/i.test(e.name) && slugFromFilename(e.name) === slug,
    );
    if (!file?.download_url) return null;

    const raw = await fetchRaw(file.download_url);
    if (raw == null) return null;
    const { data, body } = parseFrontMatter(raw);
    if (isDraft(data)) return null;
    return { ...toMeta(slug, data), bodyMarkdown: body };
  } catch {
    return null;
  }
}
