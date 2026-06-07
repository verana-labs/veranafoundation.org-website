/**
 * Live statistics for the `verana-labs` GitHub organization, fetched server-side
 * with ISR (revalidated daily). Used by the Home "living commons" section.
 *
 * Works unauthenticated (a few requests/day, well under the 60/hr anonymous
 * limit). Set `GITHUB_TOKEN` to raise the limit. All calls are wrapped so a
 * failure or rate-limit returns `null` and the page renders a static fallback —
 * the build and runtime never break on GitHub being unreachable.
 */

const ORG = "verana-labs";
const API = "https://api.github.com";
const REVALIDATE = 86400; // 1 day

type Repo = {
  name: string;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
  archived: boolean;
  fork: boolean;
};

type ContributorRaw = {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  type: string;
};

export type Contributor = {
  login: string;
  avatar_url: string;
  html_url: string;
};

export type OrgStats = {
  repoCount: number;
  stars: number;
  forks: number;
  lastActivity: string | null; // ISO timestamp
  lastActivityRepo: string | null;
  contributors: Contributor[];
};

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function getOrgStats(): Promise<OrgStats | null> {
  try {
    const res = await fetch(
      `${API}/orgs/${ORG}/repos?per_page=100&type=public&sort=pushed`,
      { headers: headers(), next: { revalidate: REVALIDATE } }
    );
    if (!res.ok) return null;

    const repos = (await res.json()) as Repo[];
    if (!Array.isArray(repos)) return null;

    const active = repos.filter((r) => !r.archived && !r.fork);
    const stars = active.reduce((s, r) => s + (r.stargazers_count || 0), 0);
    const forks = active.reduce((s, r) => s + (r.forks_count || 0), 0);

    const byPush = [...active].sort(
      (a, b) =>
        new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime()
    );
    const lastActivity = byPush[0]?.pushed_at ?? null;
    const lastActivityRepo = byPush[0]?.name ?? null;

    // Aggregate contributors across the most-starred repos (cap the number of
    // repos so we stay within rate limits).
    const topRepos = [...active]
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 8);

    const merged = new Map<string, ContributorRaw>();
    await Promise.all(
      topRepos.map(async (r) => {
        try {
          const cr = await fetch(
            `${API}/repos/${ORG}/${r.name}/contributors?per_page=30`,
            { headers: headers(), next: { revalidate: REVALIDATE } }
          );
          if (!cr.ok) return;
          const list = (await cr.json()) as ContributorRaw[];
          if (!Array.isArray(list)) return;
          for (const c of list) {
            if (!c.login || c.type === "Bot" || c.login.includes("[bot]"))
              continue;
            const existing = merged.get(c.login);
            if (existing) existing.contributions += c.contributions || 0;
            else merged.set(c.login, { ...c });
          }
        } catch {
          /* ignore a single repo's failure */
        }
      })
    );

    const contributors = [...merged.values()]
      .sort((a, b) => b.contributions - a.contributions)
      .slice(0, 14)
      .map(({ login, avatar_url, html_url }) => ({
        login,
        avatar_url,
        html_url,
      }));

    return {
      repoCount: active.length,
      stars,
      forks,
      lastActivity,
      lastActivityRepo,
      contributors,
    };
  } catch {
    return null;
  }
}

/** Compact count: 1234 -> "1.2k". */
export function formatCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return String(n);
}

/** Relative date: "today", "3 days ago", "2 months ago". */
export function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}
