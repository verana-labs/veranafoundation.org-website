/**
 * Contributor activity across the Verana GitHub organizations, aggregated
 * server-side for the unlisted /admin/contributors dashboard.
 *
 * Sources (GraphQL v4, one token — see INSIGHTS_GITHUB_TOKEN in .env.example):
 *   - default-branch commit history per repo (`history(since:)`)
 *   - pull requests per repo ordered by UPDATED_AT (so reviews given in the
 *     window on older PRs are still seen), with their reviews inline
 *
 * The contributor roster is derived from activity (commit authors, PR authors,
 * reviewers) rather than org membership: it captures outside collaborators and
 * needs no `read:org` scope. Bots are filtered.
 *
 * Everything is fetched for 2× the selected window so the previous period is
 * aggregated from the same dataset (deltas without a second fetch), then cached
 * for an hour via unstable_cache. Failures follow the site convention: any
 * error returns null and the page renders an "unavailable" state.
 */

import { unstable_cache } from "next/cache";

// ── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_ORGS = "verana-labs,2060-io";

export const WINDOW_CHOICES = [7, 30, 90] as const;
export type WindowDays = (typeof WINDOW_CHOICES)[number];

const GRAPHQL_API = "https://api.github.com/graphql";
const REVALIDATE_SECONDS = 3600; // 1 hour
const MAX_REPOS_PER_ORG = 100;
const MAX_COMMIT_PAGES_PER_REPO = 10; // 10 × 100 commits
const MAX_PR_PAGES_PER_REPO = 10; // 10 × 50 PRs
const CONCURRENT_REPO_FETCHES = 8;

/** Logins never counted, on top of the `[bot]` suffix rule. */
const EXCLUDED_LOGINS = new Set([
  "dependabot",
  "renovate",
  "github-actions",
  "release-please",
  "copilot",
  "web-flow",
]);

function insightsOrgs(): string[] {
  return (process.env.INSIGHTS_GITHUB_ORGS || DEFAULT_ORGS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function insightsToken(): string | undefined {
  return (
    process.env.INSIGHTS_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.MINUTES_GITHUB_TOKEN ||
    undefined
  );
}

// ── Raw activity records (normalized from GraphQL, JSON-friendly) ────────────

export type CommitRecord = {
  repo: string; // "org/name"
  login: string | null; // null when the commit author has no GitHub account link
  name: string | null;
  avatarUrl: string | null;
  htmlUrl: string | null;
  committedDate: string; // ISO
  additions: number;
  deletions: number;
};

export type ReviewRecord = {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  htmlUrl: string | null;
  state: string; // APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED | PENDING
  submittedAt: string | null;
};

export type PrRecord = {
  repo: string;
  number: number;
  authorLogin: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  authorHtmlUrl: string | null;
  authorIsBot: boolean;
  createdAt: string;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  reviews: ReviewRecord[];
};

export type ActivityData = {
  commits: CommitRecord[];
  prs: PrRecord[];
  repoCount: number;
  failedRepos: string[];
  failedOrgs: string[];
  truncated: boolean; // a pagination cap was hit somewhere
};

// ── Aggregated output ────────────────────────────────────────────────────────

export type PeriodStats = {
  commits: number;
  prsOpened: number;
  prsMerged: number;
  reviewsGiven: number;
};

export type ContributorRow = {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  htmlUrl: string | null;
  commits: number;
  additions: number;
  deletions: number;
  prsOpened: number;
  prsMerged: number;
  reviewsGiven: number; // approvals + changes requested + comment reviews
  approvals: number;
  changesRequested: number;
  medianTimeToMergeMs: number | null; // their PRs merged in the window
  reposTouched: number;
  weeklyCommits: number[]; // oldest → newest buckets over the window
  previous: PeriodStats;
};

export type InsightsTotals = PeriodStats & { contributors: number };

export type Insights = {
  windowDays: number;
  since: string;
  until: string;
  orgs: string[];
  repoCount: number;
  rows: ContributorRow[];
  totals: InsightsTotals;
  previousTotals: InsightsTotals;
  unmappedCommits: number; // commits whose author has no linked GitHub user
  failedRepos: string[];
  failedOrgs: string[];
  truncated: boolean;
  fetchedAt: string;
};

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

export function isBotLogin(login: string): boolean {
  const l = login.toLowerCase();
  if (l.endsWith("[bot]")) return true;
  return EXCLUDED_LOGINS.has(l);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function weeklyBuckets(
  dates: string[],
  sinceMs: number,
  untilMs: number
): number[] {
  const WEEK = 7 * 86_400_000;
  const buckets = new Array<number>(
    Math.max(1, Math.ceil((untilMs - sinceMs) / WEEK))
  ).fill(0);
  for (const iso of dates) {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t) || t < sinceMs || t >= untilMs) continue;
    const i = Math.min(buckets.length - 1, Math.floor((t - sinceMs) / WEEK));
    buckets[i]++;
  }
  return buckets;
}

type MutableRow = Omit<ContributorRow, "medianTimeToMergeMs" | "weeklyCommits"> & {
  mergeDurations: number[];
  commitDates: string[];
  repos: Set<string>;
};

function inWindow(iso: string | null, sinceMs: number, untilMs: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= sinceMs && t < untilMs;
}

/**
 * Aggregate raw activity into per-contributor rows for the current window
 * [until − windowDays, until), with the immediately preceding window of the
 * same length aggregated into each row's `previous` (and `previousTotals`).
 */
export function aggregate(
  data: ActivityData,
  windowDays: number,
  untilMs: number
): Omit<Insights, "orgs" | "fetchedAt"> {
  const sinceMs = untilMs - windowDays * 86_400_000;
  const prevSinceMs = sinceMs - windowDays * 86_400_000;

  const rows = new Map<string, MutableRow>();
  let unmappedCommits = 0;

  const rowFor = (
    login: string,
    name: string | null,
    avatarUrl: string | null,
    htmlUrl: string | null
  ): MutableRow => {
    let row = rows.get(login);
    if (!row) {
      row = {
        login,
        name: null,
        avatarUrl: null,
        htmlUrl: null,
        commits: 0,
        additions: 0,
        deletions: 0,
        prsOpened: 0,
        prsMerged: 0,
        reviewsGiven: 0,
        approvals: 0,
        changesRequested: 0,
        reposTouched: 0,
        previous: { commits: 0, prsOpened: 0, prsMerged: 0, reviewsGiven: 0 },
        mergeDurations: [],
        commitDates: [],
        repos: new Set(),
      };
      rows.set(login, row);
    }
    row.name ||= name;
    row.avatarUrl ||= avatarUrl;
    row.htmlUrl ||= htmlUrl;
    return row;
  };

  for (const c of data.commits) {
    if (!c.login) {
      if (inWindow(c.committedDate, sinceMs, untilMs)) unmappedCommits++;
      continue;
    }
    if (isBotLogin(c.login)) continue;
    const current = inWindow(c.committedDate, sinceMs, untilMs);
    const previous = inWindow(c.committedDate, prevSinceMs, sinceMs);
    if (!current && !previous) continue;
    const row = rowFor(c.login, c.name, c.avatarUrl, c.htmlUrl);
    if (current) {
      row.commits++;
      row.additions += c.additions;
      row.deletions += c.deletions;
      row.commitDates.push(c.committedDate);
      row.repos.add(c.repo);
    } else {
      row.previous.commits++;
    }
  }

  for (const pr of data.prs) {
    const author =
      pr.authorLogin && !pr.authorIsBot && !isBotLogin(pr.authorLogin)
        ? pr.authorLogin
        : null;

    if (author) {
      const openedCurrent = inWindow(pr.createdAt, sinceMs, untilMs);
      const openedPrev = inWindow(pr.createdAt, prevSinceMs, sinceMs);
      const mergedCurrent = inWindow(pr.mergedAt, sinceMs, untilMs);
      const mergedPrev = inWindow(pr.mergedAt, prevSinceMs, sinceMs);
      if (openedCurrent || openedPrev || mergedCurrent || mergedPrev) {
        const row = rowFor(
          author,
          pr.authorName,
          pr.authorAvatarUrl,
          pr.authorHtmlUrl
        );
        if (openedCurrent) {
          row.prsOpened++;
          row.repos.add(pr.repo);
        }
        if (openedPrev) row.previous.prsOpened++;
        if (mergedCurrent) {
          row.prsMerged++;
          row.repos.add(pr.repo);
          if (pr.mergedAt) {
            const d =
              new Date(pr.mergedAt).getTime() - new Date(pr.createdAt).getTime();
            if (d >= 0) row.mergeDurations.push(d);
          }
        }
        if (mergedPrev) row.previous.prsMerged++;
      }
    }

    for (const r of pr.reviews) {
      if (!r.login || isBotLogin(r.login)) continue;
      if (pr.authorLogin && r.login === pr.authorLogin) continue; // self-review
      if (r.state !== "APPROVED" && r.state !== "CHANGES_REQUESTED" && r.state !== "COMMENTED")
        continue;
      const current = inWindow(r.submittedAt, sinceMs, untilMs);
      const previous = inWindow(r.submittedAt, prevSinceMs, sinceMs);
      if (!current && !previous) continue;
      const row = rowFor(r.login, r.name, r.avatarUrl, r.htmlUrl);
      if (current) {
        row.reviewsGiven++;
        if (r.state === "APPROVED") row.approvals++;
        if (r.state === "CHANGES_REQUESTED") row.changesRequested++;
        row.repos.add(pr.repo);
      } else {
        row.previous.reviewsGiven++;
      }
    }
  }

  const finalRows: ContributorRow[] = [...rows.values()]
    .map(({ mergeDurations, commitDates, repos, ...row }) => ({
      ...row,
      reposTouched: repos.size,
      medianTimeToMergeMs: median(mergeDurations),
      weeklyCommits: weeklyBuckets(commitDates, sinceMs, untilMs),
    }))
    // Drop rows with no activity in either period (e.g. only DISMISSED reviews).
    .filter(
      (r) =>
        r.commits + r.prsOpened + r.prsMerged + r.reviewsGiven > 0 ||
        r.previous.commits +
          r.previous.prsOpened +
          r.previous.prsMerged +
          r.previous.reviewsGiven >
          0
    )
    .sort((a, b) => b.commits - a.commits);

  const activeNow = finalRows.filter(
    (r) => r.commits + r.prsOpened + r.prsMerged + r.reviewsGiven > 0
  );
  const activePrev = finalRows.filter(
    (r) =>
      r.previous.commits +
        r.previous.prsOpened +
        r.previous.prsMerged +
        r.previous.reviewsGiven >
      0
  );

  const sum = (f: (r: ContributorRow) => number) =>
    finalRows.reduce((s, r) => s + f(r), 0);

  return {
    windowDays,
    since: new Date(sinceMs).toISOString(),
    until: new Date(untilMs).toISOString(),
    repoCount: data.repoCount,
    rows: finalRows,
    totals: {
      commits: sum((r) => r.commits),
      prsOpened: sum((r) => r.prsOpened),
      prsMerged: sum((r) => r.prsMerged),
      reviewsGiven: sum((r) => r.reviewsGiven),
      contributors: activeNow.length,
    },
    previousTotals: {
      commits: sum((r) => r.previous.commits),
      prsOpened: sum((r) => r.previous.prsOpened),
      prsMerged: sum((r) => r.previous.prsMerged),
      reviewsGiven: sum((r) => r.previous.reviewsGiven),
      contributors: activePrev.length,
    },
    unmappedCommits,
    failedRepos: data.failedRepos,
    failedOrgs: data.failedOrgs,
    truncated: data.truncated,
  };
}

// ── GraphQL fetching ─────────────────────────────────────────────────────────

async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetch(GRAPHQL_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "veranafoundation.org",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store", // caching happens at the unstable_cache layer
  });
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  // Partial responses (data + errors) are common when a nested object is
  // forbidden; callers treat missing fields as empty, so only a fully missing
  // data payload is fatal.
  if (!json.data) {
    throw new Error(json.errors?.map((e) => e.message).join("; ") || "empty GraphQL response");
  }
  return json.data;
}

type RepoListResponse = {
  organization: {
    repositories: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: {
        name: string;
        isArchived: boolean;
        isFork: boolean;
        pushedAt: string | null;
        updatedAt: string;
      }[];
    };
  } | null;
};

const REPOS_QUERY = /* GraphQL */ `
  query ($org: String!, $cursor: String) {
    organization(login: $org) {
      repositories(first: 100, after: $cursor, orderBy: { field: PUSHED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes { name isArchived isFork pushedAt updatedAt }
      }
    }
  }
`;

async function listActiveRepos(
  token: string,
  org: string,
  sinceMs: number
): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | null = null;
  while (names.length < MAX_REPOS_PER_ORG) {
    const data: RepoListResponse = await graphql<RepoListResponse>(
      token,
      REPOS_QUERY,
      { org, cursor }
    );
    const conn = data.organization?.repositories;
    if (!conn) break;
    for (const r of conn.nodes) {
      if (r.isArchived || r.isFork) continue;
      const lastActivity = Math.max(
        r.pushedAt ? new Date(r.pushedAt).getTime() : 0,
        new Date(r.updatedAt).getTime()
      );
      if (lastActivity >= sinceMs) names.push(r.name);
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return names.slice(0, MAX_REPOS_PER_ORG);
}

type CommitHistoryResponse = {
  repository: {
    defaultBranchRef: {
      target: {
        history?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: {
            committedDate: string;
            additions: number;
            deletions: number;
            author: {
              name: string | null;
              user: {
                login: string;
                name: string | null;
                avatarUrl: string;
                url: string;
              } | null;
            } | null;
          }[];
        };
      } | null;
    } | null;
  } | null;
};

const COMMITS_QUERY = /* GraphQL */ `
  query ($owner: String!, $name: String!, $since: GitTimestamp!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        target {
          ... on Commit {
            history(since: $since, first: 100, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                committedDate
                additions
                deletions
                author {
                  name
                  user { login name avatarUrl url }
                }
              }
            }
          }
        }
      }
    }
  }
`;

type PrPageResponse = {
  repository: {
    pullRequests: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: {
        number: number;
        createdAt: string;
        updatedAt: string;
        mergedAt: string | null;
        additions: number;
        deletions: number;
        author: {
          login: string;
          __typename: string;
          name?: string | null;
          avatarUrl?: string;
          url?: string;
        } | null;
        reviews: {
          nodes: {
            state: string;
            submittedAt: string | null;
            author: {
              login: string;
              __typename: string;
              name?: string | null;
              avatarUrl?: string;
              url?: string;
            } | null;
          }[];
        } | null;
      }[];
    };
  } | null;
};

const PRS_QUERY = /* GraphQL */ `
  query ($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: 50, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }, states: [OPEN, CLOSED, MERGED]) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          createdAt
          updatedAt
          mergedAt
          additions
          deletions
          author {
            login
            __typename
            ... on User { name avatarUrl url }
          }
          reviews(first: 50) {
            nodes {
              state
              submittedAt
              author {
                login
                __typename
                ... on User { name avatarUrl url }
              }
            }
          }
        }
      }
    }
  }
`;

async function fetchRepoActivity(
  token: string,
  org: string,
  name: string,
  sinceMs: number
): Promise<{ commits: CommitRecord[]; prs: PrRecord[]; truncated: boolean }> {
  const repo = `${org}/${name}`;
  const sinceIso = new Date(sinceMs).toISOString();
  const commits: CommitRecord[] = [];
  const prs: PrRecord[] = [];
  let truncated = false;

  // Default-branch commit history, bounded by `since`.
  let cursor: string | null = null;
  for (let page = 0; page < MAX_COMMIT_PAGES_PER_REPO; page++) {
    const data: CommitHistoryResponse = await graphql<CommitHistoryResponse>(
      token,
      COMMITS_QUERY,
      { owner: org, name, since: sinceIso, cursor }
    );
    const history = data.repository?.defaultBranchRef?.target?.history;
    if (!history) break;
    for (const c of history.nodes) {
      commits.push({
        repo,
        login: c.author?.user?.login ?? null,
        name: c.author?.user?.name ?? c.author?.name ?? null,
        avatarUrl: c.author?.user?.avatarUrl ?? null,
        htmlUrl: c.author?.user?.url ?? null,
        committedDate: c.committedDate,
        additions: c.additions ?? 0,
        deletions: c.deletions ?? 0,
      });
    }
    if (!history.pageInfo.hasNextPage) break;
    if (page === MAX_COMMIT_PAGES_PER_REPO - 1) truncated = true;
    cursor = history.pageInfo.endCursor;
  }

  // PRs by last update, stopping once past the window start.
  cursor = null;
  for (let page = 0; page < MAX_PR_PAGES_PER_REPO; page++) {
    const data: PrPageResponse = await graphql<PrPageResponse>(token, PRS_QUERY, {
      owner: org,
      name,
      cursor,
    });
    const conn = data.repository?.pullRequests;
    if (!conn) break;
    let pastWindow = false;
    for (const pr of conn.nodes) {
      if (new Date(pr.updatedAt).getTime() < sinceMs) {
        pastWindow = true;
        break;
      }
      const isBot = pr.author?.__typename === "Bot";
      prs.push({
        repo,
        number: pr.number,
        authorLogin: pr.author?.login ?? null,
        authorName: pr.author?.name ?? null,
        authorAvatarUrl: pr.author?.avatarUrl ?? null,
        authorHtmlUrl: pr.author?.url ?? null,
        authorIsBot: isBot,
        createdAt: pr.createdAt,
        mergedAt: pr.mergedAt,
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
        reviews: (pr.reviews?.nodes ?? [])
          .filter((r) => r.author && r.author.__typename !== "Bot")
          .map((r) => ({
            login: r.author?.login ?? "",
            name: r.author?.name ?? null,
            avatarUrl: r.author?.avatarUrl ?? null,
            htmlUrl: r.author?.url ?? null,
            state: r.state,
            submittedAt: r.submittedAt,
          })),
      });
    }
    if (pastWindow || !conn.pageInfo.hasNextPage) break;
    if (page === MAX_PR_PAGES_PER_REPO - 1) truncated = true;
    cursor = conn.pageInfo.endCursor;
  }

  return { commits, prs, truncated };
}

/** Small concurrency pool — keeps us polite with the API and fast enough. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length))
    .fill(null)
    .map(async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    });
  await Promise.all(workers);
  return results;
}

async function fetchActivity(
  token: string,
  orgs: string[],
  sinceMs: number
): Promise<ActivityData> {
  const failedOrgs: string[] = [];
  const failedRepos: string[] = [];
  const repoRefs: { org: string; name: string }[] = [];

  for (const org of orgs) {
    try {
      const names = await listActiveRepos(token, org, sinceMs);
      for (const name of names) repoRefs.push({ org, name });
    } catch {
      failedOrgs.push(org);
    }
  }

  const commits: CommitRecord[] = [];
  const prs: PrRecord[] = [];
  let truncated = false;

  await mapPool(repoRefs, CONCURRENT_REPO_FETCHES, async ({ org, name }) => {
    try {
      const r = await fetchRepoActivity(token, org, name, sinceMs);
      commits.push(...r.commits);
      prs.push(...r.prs);
      truncated ||= r.truncated;
    } catch {
      failedRepos.push(`${org}/${name}`);
    }
  });

  return {
    commits,
    prs,
    repoCount: repoRefs.length - failedRepos.length,
    failedRepos,
    failedOrgs,
    truncated,
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────

/** Uncached compute path — exported for tests; pages use getInsights(). */
export async function computeInsights(windowDays: WindowDays): Promise<Insights | null> {
  const token = insightsToken();
  if (!token) return null;
  const orgs = insightsOrgs();
  try {
    const untilMs = Date.now();
    // Fetch 2× the window so the previous period comes from the same dataset.
    const fetchSinceMs = untilMs - 2 * windowDays * 86_400_000;
    const data = await fetchActivity(token, orgs, fetchSinceMs);
    if (data.repoCount === 0 && data.failedOrgs.length === orgs.length) return null;
    return {
      ...aggregate(data, windowDays, untilMs),
      orgs,
      fetchedAt: new Date(untilMs).toISOString(),
    };
  } catch {
    return null;
  }
}

/** Cache tag covering every window's entry — revalidated by the warm cron. */
export const INSIGHTS_CACHE_TAG = "github-insights";

/** Cached insights for a window; null when GitHub is unreachable / no token. */
export async function getInsights(windowDays: WindowDays): Promise<Insights | null> {
  const cached = unstable_cache(
    () => computeInsights(windowDays),
    ["github-insights", String(windowDays)],
    // The hourly warm cron (/api/cron/warm-insights) revalidates the tag and
    // recomputes all windows; the time-based revalidate stays as a safety net
    // so data still refreshes (stale-while-revalidate) if the cron stops.
    { revalidate: REVALIDATE_SECONDS, tags: [INSIGHTS_CACHE_TAG] }
  );
  return cached();
}

// ── Formatting helpers (used by the page; pure) ──────────────────────────────

/** "3d 4h", "5h 12m", "18m" — for median time-to-merge. */
export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** Signed compact delta vs the previous period: "+12", "−3", "±0". */
export function formatDelta(current: number, previous: number): string {
  const d = current - previous;
  if (d === 0) return "±0";
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}
