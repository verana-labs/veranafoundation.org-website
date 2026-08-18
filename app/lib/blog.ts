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
  authorAvatar: string | null; // validated image URL, or null
  authorSocial: string | null; // author's social profile URL (http/https), or null
};

export type Post = PostMeta & { bodyMarkdown: string };

/** A post enriched for the list page: a media preview and a text teaser. */
export type PostPreview = PostMeta & {
  media: { kind: "image" | "video"; url: string } | null;
  teaser: string; // first body paragraphs (plain-ish markdown, media stripped)
};

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
    // raw value here; resolveAvatar() validates it returns an image before use.
    authorAvatar: data.authoravatar?.trim() || null,
    authorSocial: sanitizeUrl(data.authorsocial),
  };
}

/** Accept only well-formed http(s) URLs (front matter is trusted-ish, but be safe). */
function sanitizeUrl(value: string | undefined): string | null {
  const v = value?.trim();
  return v && /^https?:\/\//i.test(v) ? v : null;
}

/**
 * Validate that a URL actually serves an image. Returns the URL if it responds
 * 200 with an `image/*` content-type, else null. Cached via ISR so it's one
 * cheap request per post per revalidation window. Any error → null (omit).
 */
async function resolveAvatar(url: string | null): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, {
      method: "GET",
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    return type.toLowerCase().startsWith("image/") ? url : null;
  } catch {
    return null;
  }
}

/** First media reference in the body: Markdown image, <img>, or <video>/<source>. */
function firstMedia(
  markdown: string,
): { kind: "image" | "video"; url: string } | null {
  // Markdown image: ![alt](url)
  const mdImg = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/.exec(markdown);
  // HTML <img src="...">
  const htmlImg = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(markdown);
  // HTML <video src="..."> or <video><source src="...">
  const htmlVideo =
    /<video\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(markdown) ??
    /<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(markdown);

  // Pick whichever appears earliest in the document.
  const candidates: { kind: "image" | "video"; url: string; at: number }[] = [];
  if (mdImg) candidates.push({ kind: "image", url: mdImg[1], at: mdImg.index });
  if (htmlImg) candidates.push({ kind: "image", url: htmlImg[1], at: htmlImg.index });
  if (htmlVideo) candidates.push({ kind: "video", url: htmlVideo[1], at: htmlVideo.index });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.at - b.at);
  const { kind, url } = candidates[0];
  return { kind, url };
}

/** First N body paragraphs as a teaser, with media/headings/HTML stripped. */
function teaserParagraphs(markdown: string, max = 3): string {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    // drop media-only blocks, headings, html tags, and hr
    .filter((b) => !/^!\[/.test(b))
    .filter((b) => !/^<(img|video|source|figure)/i.test(b))
    .filter((b) => !/^#{1,6}\s/.test(b))
    .filter((b) => b !== "---");
  return blocks.slice(0, max).join("\n\n");
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
    if (!res.ok) {
      console.error(`[blog] raw fetch failed: HTTP ${res.status} for ${downloadUrl}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error(`[blog] raw fetch threw for ${downloadUrl}:`, err);
    return null;
  }
}

type DirEntry = { name: string; type: string; download_url: string | null };

/**
 * Fetch the blog folder listing from GitHub. On failure the callers degrade
 * gracefully (Next serves the stale data-cache entry, or an empty list) — which
 * is invisible in production, so the cause must at least reach the pod logs.
 */
async function fetchListing(): Promise<DirEntry[] | null> {
  const url = `${API}/repos/${REPO}/contents/${PATH}?ref=${encodeURIComponent(BRANCH)}`;
  try {
    const res = await fetch(url, { headers: headers(), next: { revalidate: REVALIDATE } });
    if (!res.ok) {
      console.error(
        `[blog] GitHub listing failed: HTTP ${res.status} for ${url} (auth: ${TOKEN ? "token" : "anonymous"})`,
      );
      return null;
    }
    return (await res.json()) as DirEntry[];
  } catch (err) {
    console.error(`[blog] GitHub listing threw for ${url}:`, err);
    return null;
  }
}

/** List published posts (newest first). Returns [] if GitHub is unreachable. */
export async function listPosts(): Promise<PostMeta[]> {
  try {
    const entries = await fetchListing();
    if (!entries) return [];
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
    const entries = await fetchListing();
    if (!entries) return null;
    const file = entries.find(
      (e) => e.type === "file" && /\.md$/i.test(e.name) && slugFromFilename(e.name) === slug,
    );
    if (!file?.download_url) return null;

    const raw = await fetchRaw(file.download_url);
    if (raw == null) return null;
    const { data, body } = parseFrontMatter(raw);
    if (isDraft(data)) return null;
    const meta = toMeta(slug, data);
    const authorAvatar = await resolveAvatar(meta.authorAvatar);
    return { ...meta, authorAvatar, bodyMarkdown: body };
  } catch {
    return null;
  }
}

/**
 * Posts enriched for the list page: each with a validated avatar, the first
 * media in the body, and a short text teaser. Fetches each post's body (one
 * extra request per post, ISR-cached). Returns [] if GitHub is unreachable.
 */
export async function listPostsWithPreview(): Promise<PostPreview[]> {
  try {
    const entries = await fetchListing();
    if (!entries) return [];
    const files = entries.filter(
      (e) => e.type === "file" && /\.md$/i.test(e.name) && e.name.toLowerCase() !== "readme.md",
    );

    const posts = await Promise.all(
      files.map(async (f) => {
        if (!f.download_url) return null;
        const raw = await fetchRaw(f.download_url);
        if (raw == null) return null;
        const { data, body } = parseFrontMatter(raw);
        if (isDraft(data)) return null;
        const meta = toMeta(slugFromFilename(f.name), data);
        const authorAvatar = await resolveAvatar(meta.authorAvatar);
        return {
          ...meta,
          authorAvatar,
          media: firstMedia(body),
          teaser: teaserParagraphs(body),
        } satisfies PostPreview;
      }),
    );

    return posts
      .filter((p): p is PostPreview => p !== null)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  } catch {
    return [];
  }
}
