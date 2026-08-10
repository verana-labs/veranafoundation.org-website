import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, isAdmin } from "@/app/lib/authz";
import {
  type ContributorRow,
  type Insights,
  WINDOW_CHOICES,
  type WindowDays,
  formatDelta,
  formatDuration,
  getInsights,
} from "@/app/lib/github-insights";
import { PageHero, Section } from "@/app/components/PageHero";

// Unlisted admin page: not linked from the admin home, kept out of the index
// (robots.txt already disallows /admin/**; this is belt and braces).
export const metadata: Metadata = {
  title: "Contributor insights · Admin",
  robots: { index: false, follow: false },
};

// ── Sorting ──────────────────────────────────────────────────────────────────

type SortKey =
  | "commits"
  | "prsOpened"
  | "prsMerged"
  | "reviewsGiven"
  | "approvals"
  | "changesRequested"
  | "lines"
  | "merge"
  | "repos";

const SORT_VALUE: Record<SortKey, (r: ContributorRow) => number> = {
  commits: (r) => r.commits,
  prsOpened: (r) => r.prsOpened,
  prsMerged: (r) => r.prsMerged,
  reviewsGiven: (r) => r.reviewsGiven,
  approvals: (r) => r.approvals,
  changesRequested: (r) => r.changesRequested,
  lines: (r) => r.additions + r.deletions,
  merge: (r) => r.medianTimeToMergeMs ?? Number.MAX_SAFE_INTEGER,
  repos: (r) => r.reposTouched,
};

function sortRows(rows: ContributorRow[], sort: SortKey): ContributorRow[] {
  const value = SORT_VALUE[sort];
  // "merge" sorts ascending (fastest median merge first, no-merges last);
  // every other column sorts descending. Commits break ties.
  return [...rows].sort(
    (a, b) =>
      (sort === "merge" ? value(a) - value(b) : value(b) - value(a)) ||
      b.commits - a.commits
  );
}

// ── Small presentational pieces (all server-rendered) ────────────────────────

function Delta({ current, previous }: { current: number; previous: number }) {
  const d = current - previous;
  // Down periods are grey, not red: less activity isn't inherently bad.
  const tone = d > 0 ? "text-green" : "text-muted";
  return (
    <span className={`text-xs ${tone} whitespace-nowrap`} title="vs previous period">
      {formatDelta(current, previous)}
    </span>
  );
}

function StatTile({
  label,
  value,
  previous,
  windowDays,
}: {
  label: string;
  value: number;
  previous: number;
  windowDays: number;
}) {
  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <p className="display text-3xl mt-1">{value.toLocaleString("en-US")}</p>
      <p className="text-xs text-muted mt-1">
        <Delta current={value} previous={previous} /> vs previous {windowDays}d
      </p>
    </div>
  );
}

/**
 * Weekly-commit sparkline: one series per row, 2px line in the site purple
 * (auto-flips in dark mode), native <title> tooltips per weekly bucket as the
 * hover layer. The column header names the series; no legend needed.
 */
function Sparkline({ buckets, since }: { buckets: number[]; since: string }) {
  const W = 96;
  const H = 24;
  const PAD = 2;
  const max = Math.max(1, ...buckets);
  const step = buckets.length > 1 ? (W - 2 * PAD) / (buckets.length - 1) : 0;
  const x = (i: number) => (buckets.length > 1 ? PAD + i * step : W / 2);
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  const points = buckets.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const sinceMs = new Date(since).getTime();
  const weekLabel = (i: number) =>
    new Date(sinceMs + i * 7 * 86_400_000).toISOString().slice(0, 10);
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Weekly commits: ${buckets.join(", ")}`}
      className="shrink-0"
    >
      {buckets.length > 1 ? (
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-purple)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        // A single bucket (7-day window) has no line to draw — show a dot.
        <circle cx={x(0)} cy={y(buckets[0])} r="2.5" fill="var(--color-purple)" />
      )}
      {buckets.map((v, i) => (
        <rect
          key={`${i}-${v}`}
          x={buckets.length > 1 ? x(i) - step / 2 : 0}
          y={0}
          width={buckets.length > 1 ? step : W}
          height={H}
          fill="transparent"
        >
          <title>{`week of ${weekLabel(i)}: ${v} commit${v === 1 ? "" : "s"}`}</title>
        </rect>
      ))}
    </svg>
  );
}

/** Subtle magnitude bar under the active sort column's value. */
function MicroBar({ value, max }: { value: number; max: number }) {
  if (max <= 0) return null;
  return (
    <div className="mt-1 h-1 w-16 rounded-full bg-rule overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.max(2, Math.round((value / max) * 100))}%`,
          background: "var(--color-purple)",
        }}
      />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "commits", label: "Commits", title: "Commits on default branches" },
  { key: "prsOpened", label: "PRs", title: "Pull requests opened" },
  { key: "prsMerged", label: "Merged", title: "Pull requests merged" },
  { key: "reviewsGiven", label: "Reviews", title: "Reviews given (approve + request changes + comment)" },
  { key: "approvals", label: "Approvals", title: "PR approvals given" },
  { key: "changesRequested", label: "Req. changes", title: "Changes-requested reviews given" },
  { key: "lines", label: "Lines ±", title: "Lines added + removed (commits on default branches)" },
  { key: "merge", label: "Med. merge", title: "Median time from open to merge of their PRs (lower first)" },
  { key: "repos", label: "Repos", title: "Distinct repositories touched" },
];

function parseWindow(v: string | undefined): WindowDays {
  const n = Number(v);
  return (WINDOW_CHOICES as readonly number[]).includes(n) ? (n as WindowDays) : 30;
}

function parseSort(v: string | undefined): SortKey {
  return COLUMNS.some((c) => c.key === v) ? (v as SortKey) : "commits";
}

export default async function AdminContributorsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; sort?: string }>;
}) {
  const user = await currentUser();
  // Hide existence from non-admins (defence in depth on top of middleware).
  if (!user || !(await isAdmin(user.email))) notFound();

  const params = await searchParams;
  const windowDays = parseWindow(params.window);
  const sort = parseSort(params.sort);

  const insights: Insights | null = await getInsights(windowDays);

  return (
    <>
      <PageHero
        back={{ href: "/admin", label: "Admin" }}
        title="Contributor insights"
        lead={`GitHub activity across ${insights ? insights.orgs.join(" + ") : "the Verana organizations"}, compared per contributor. Activity signals, not performance grades — reviews and merge flow matter as much as commit counts.`}
      />
      <Section bordered={false}>
        {!insights ? (
          <div className="card">
            <p className="font-medium">GitHub statistics are unavailable.</p>
            <p className="text-sm text-muted mt-2">
              Set <code>INSIGHTS_GITHUB_TOKEN</code> (a token with read access to
              the organizations&apos; repositories), or retry later if GitHub is
              rate-limiting.
            </p>
          </div>
        ) : (
          <>
            {/* Window tabs */}
            <div className="flex flex-wrap items-center gap-2 mb-8">
              {WINDOW_CHOICES.map((w) => (
                <Link
                  key={w}
                  href={`?window=${w}&sort=${sort}`}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    w === windowDays
                      ? "border-purple text-purple font-medium"
                      : "border-rule text-muted hover:text-purple hover:border-purple"
                  }`}
                >
                  Last {w} days
                </Link>
              ))}
              <span className="text-xs text-muted ml-auto">
                {insights.repoCount} active repos · data as of{" "}
                {insights.fetchedAt.slice(0, 16).replace("T", " ")} UTC · refreshes hourly
              </span>
            </div>

            {/* Org-wide totals */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              <StatTile
                label="Commits"
                value={insights.totals.commits}
                previous={insights.previousTotals.commits}
                windowDays={windowDays}
              />
              <StatTile
                label="PRs merged"
                value={insights.totals.prsMerged}
                previous={insights.previousTotals.prsMerged}
                windowDays={windowDays}
              />
              <StatTile
                label="Reviews given"
                value={insights.totals.reviewsGiven}
                previous={insights.previousTotals.reviewsGiven}
                windowDays={windowDays}
              />
              <StatTile
                label="Active contributors"
                value={insights.totals.contributors}
                previous={insights.previousTotals.contributors}
                windowDays={windowDays}
              />
            </div>

            {/* Leaderboard */}
            {insights.rows.length === 0 ? (
              <p className="text-muted">No contributor activity in this window.</p>
            ) : (
              <LeaderboardTable insights={insights} sort={sort} windowDays={windowDays} />
            )}

            {/* Caveats */}
            <div className="mt-8 text-xs text-muted leading-relaxed max-w-3xl space-y-1">
              <p>
                Commits are counted on default branches; lines ± come from those
                commits. Reviews exclude self-reviews and bot accounts.
                {insights.unmappedCommits > 0 && (
                  <>
                    {" "}
                    {insights.unmappedCommits} commit
                    {insights.unmappedCommits === 1 ? "" : "s"} had no linked
                    GitHub account and {insights.unmappedCommits === 1 ? "is" : "are"} not attributed.
                  </>
                )}
              </p>
              {(insights.failedOrgs.length > 0 ||
                insights.failedRepos.length > 0 ||
                insights.truncated) && (
                <p>
                  Partial data:{" "}
                  {insights.failedOrgs.length > 0 &&
                    `organization(s) unreachable: ${insights.failedOrgs.join(", ")}. `}
                  {insights.failedRepos.length > 0 &&
                    `${insights.failedRepos.length} repo(s) failed to load. `}
                  {insights.truncated &&
                    "Very high-volume repositories were truncated at the pagination cap."}
                </p>
              )}
            </div>
          </>
        )}
      </Section>
    </>
  );
}

function LeaderboardTable({
  insights,
  sort,
  windowDays,
}: {
  insights: Insights;
  sort: SortKey;
  windowDays: WindowDays;
}) {
  const rows = sortRows(insights.rows, sort);
  const maxSortValue =
    sort === "merge" ? 0 : Math.max(0, ...rows.map((r) => SORT_VALUE[sort](r)));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm min-w-[960px]">
        <thead>
          <tr className="text-left text-muted">
            <th className="p-2 font-medium w-8">#</th>
            <th className="p-2 font-medium">Contributor</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className="p-2 font-medium text-right">
                <Link
                  href={`?window=${windowDays}&sort=${c.key}`}
                  title={c.title}
                  className={`whitespace-nowrap transition-colors hover:text-purple ${
                    c.key === sort ? "text-purple" : ""
                  }`}
                >
                  {c.label}
                  {c.key === sort ? " ↓" : ""}
                </Link>
              </th>
            ))}
            <th className="p-2 font-medium text-right">Activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.login} className="border-t border-rule align-top">
              <td className="p-2 text-muted">{i + 1}</td>
              <td className="p-2">
                <a
                  href={r.htmlUrl ?? `https://github.com/${r.login}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 hover:text-purple transition-colors"
                >
                  {r.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.avatarUrl}
                      alt=""
                      className="w-6 h-6 rounded-full shrink-0"
                    />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-rule inline-block shrink-0" />
                  )}
                  <span className="whitespace-nowrap">
                    {r.name || r.login}
                    {r.name && (
                      <span className="text-muted"> · {r.login}</span>
                    )}
                  </span>
                </a>
              </td>
              <Cell active={sort === "commits"} value={r.commits} max={maxSortValue}>
                {r.commits.toLocaleString("en-US")}{" "}
                <Delta current={r.commits} previous={r.previous.commits} />
              </Cell>
              <Cell active={sort === "prsOpened"} value={r.prsOpened} max={maxSortValue}>
                {r.prsOpened}{" "}
                <Delta current={r.prsOpened} previous={r.previous.prsOpened} />
              </Cell>
              <Cell active={sort === "prsMerged"} value={r.prsMerged} max={maxSortValue}>
                {r.prsMerged}{" "}
                <Delta current={r.prsMerged} previous={r.previous.prsMerged} />
              </Cell>
              <Cell active={sort === "reviewsGiven"} value={r.reviewsGiven} max={maxSortValue}>
                {r.reviewsGiven}{" "}
                <Delta current={r.reviewsGiven} previous={r.previous.reviewsGiven} />
              </Cell>
              <Cell active={sort === "approvals"} value={r.approvals} max={maxSortValue}>
                {r.approvals}
              </Cell>
              <Cell active={sort === "changesRequested"} value={r.changesRequested} max={maxSortValue}>
                {r.changesRequested}
              </Cell>
              <Cell
                active={sort === "lines"}
                value={r.additions + r.deletions}
                max={maxSortValue}
              >
                <span className="text-green">+{r.additions.toLocaleString("en-US")}</span>{" "}
                <span className="text-muted">
                  −{r.deletions.toLocaleString("en-US")}
                </span>
              </Cell>
              <td className="p-2 text-right whitespace-nowrap">
                {formatDuration(r.medianTimeToMergeMs)}
              </td>
              <Cell active={sort === "repos"} value={r.reposTouched} max={maxSortValue}>
                {r.reposTouched}
              </Cell>
              <td className="p-2 text-right">
                <Sparkline buckets={r.weeklyCommits} since={insights.since} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Numeric cell; shows the magnitude micro-bar when its column is the sort. */
function Cell({
  active,
  value,
  max,
  children,
}: {
  active: boolean;
  value: number;
  max: number;
  children: React.ReactNode;
}) {
  return (
    <td className="p-2 text-right whitespace-nowrap">
      {children}
      {active && (
        <div className="flex justify-end">
          <MicroBar value={value} max={max} />
        </div>
      )}
    </td>
  );
}
