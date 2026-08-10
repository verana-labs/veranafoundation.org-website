import { describe, expect, it } from "vitest";
import {
  type ActivityData,
  type CommitRecord,
  type PrRecord,
  aggregate,
  formatDelta,
  formatDuration,
  isBotLogin,
  median,
  weeklyBuckets,
} from "./github-insights";

const DAY = 86_400_000;
// Fixed "now" so the tests are deterministic.
const UNTIL = Date.UTC(2026, 7, 1); // 2026-08-01T00:00:00Z
const iso = (daysAgo: number, offsetMs = 0) =>
  new Date(UNTIL - daysAgo * DAY + offsetMs).toISOString();

function commit(over: Partial<CommitRecord>): CommitRecord {
  return {
    repo: "verana-labs/repo-a",
    login: "alice",
    name: "Alice",
    avatarUrl: "https://a",
    htmlUrl: "https://github.com/alice",
    committedDate: iso(1),
    additions: 10,
    deletions: 2,
    ...over,
  };
}

function pr(over: Partial<PrRecord>): PrRecord {
  return {
    repo: "verana-labs/repo-a",
    number: 1,
    authorLogin: "alice",
    authorName: "Alice",
    authorAvatarUrl: "https://a",
    authorHtmlUrl: "https://github.com/alice",
    authorIsBot: false,
    createdAt: iso(2),
    mergedAt: null,
    additions: 0,
    deletions: 0,
    reviews: [],
    ...over,
  };
}

function data(over: Partial<ActivityData>): ActivityData {
  return {
    commits: [],
    prs: [],
    repoCount: 1,
    failedRepos: [],
    failedOrgs: [],
    truncated: false,
    ...over,
  };
}

describe("isBotLogin", () => {
  it("filters [bot] suffix and the denylist, case-insensitively", () => {
    expect(isBotLogin("release-please[bot]")).toBe(true);
    expect(isBotLogin("Dependabot")).toBe(true);
    expect(isBotLogin("github-actions")).toBe(true);
    expect(isBotLogin("fabrice")).toBe(false);
  });
});

describe("median", () => {
  it("handles empty, odd, and even inputs", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(3); // rounded mean of 2,3
  });
});

describe("weeklyBuckets", () => {
  it("buckets oldest→newest and clamps the boundary", () => {
    const since = UNTIL - 28 * DAY;
    const buckets = weeklyBuckets(
      [iso(27), iso(27), iso(10), iso(0.5)],
      since,
      UNTIL
    );
    expect(buckets).toEqual([2, 0, 1, 1]);
  });

  it("ignores dates outside the window", () => {
    const since = UNTIL - 7 * DAY;
    expect(weeklyBuckets([iso(10), iso(-1)], since, UNTIL)).toEqual([0]);
  });
});

describe("aggregate", () => {
  it("splits commits between current and previous windows", () => {
    const result = aggregate(
      data({
        commits: [
          commit({ committedDate: iso(1) }), // current
          commit({ committedDate: iso(3) }), // current
          commit({ committedDate: iso(10) }), // previous (7d window)
        ],
      }),
      7,
      UNTIL
    );
    expect(result.rows).toHaveLength(1);
    const alice = result.rows[0];
    expect(alice.commits).toBe(2);
    expect(alice.additions).toBe(20);
    expect(alice.previous.commits).toBe(1);
    expect(result.totals.commits).toBe(2);
    expect(result.previousTotals.commits).toBe(1);
    expect(result.totals.contributors).toBe(1);
  });

  it("counts unmapped commit authors separately and skips bots", () => {
    const result = aggregate(
      data({
        commits: [
          commit({ login: null, name: "No Account" }),
          commit({ login: "release-please[bot]" }),
        ],
      }),
      7,
      UNTIL
    );
    expect(result.rows).toHaveLength(0);
    expect(result.unmappedCommits).toBe(1);
  });

  it("attributes PRs opened/merged and computes median time-to-merge", () => {
    const result = aggregate(
      data({
        prs: [
          pr({ number: 1, createdAt: iso(3), mergedAt: iso(2) }), // 1 day to merge
          pr({ number: 2, createdAt: iso(6), mergedAt: iso(3) }), // 3 days to merge
          pr({ number: 3, createdAt: iso(20) }), // outside both windows entirely
        ],
      }),
      7,
      UNTIL
    );
    const alice = result.rows[0];
    expect(alice.prsOpened).toBe(2);
    expect(alice.prsMerged).toBe(2);
    expect(alice.medianTimeToMergeMs).toBe(2 * DAY);
  });

  it("counts a PR opened in the previous window but merged in the current one", () => {
    const result = aggregate(
      data({ prs: [pr({ createdAt: iso(10), mergedAt: iso(2) })] }),
      7,
      UNTIL
    );
    const alice = result.rows[0];
    expect(alice.prsOpened).toBe(0);
    expect(alice.previous.prsOpened).toBe(1);
    expect(alice.prsMerged).toBe(1);
  });

  it("credits reviews to the reviewer, excluding self-reviews and dismissals", () => {
    const reviews = [
      { login: "bob", name: "Bob", avatarUrl: null, htmlUrl: null, state: "APPROVED", submittedAt: iso(1) },
      { login: "bob", name: "Bob", avatarUrl: null, htmlUrl: null, state: "CHANGES_REQUESTED", submittedAt: iso(2) },
      { login: "bob", name: "Bob", avatarUrl: null, htmlUrl: null, state: "DISMISSED", submittedAt: iso(1) },
      { login: "alice", name: "Alice", avatarUrl: null, htmlUrl: null, state: "COMMENTED", submittedAt: iso(1) }, // self
      { login: "bob", name: "Bob", avatarUrl: null, htmlUrl: null, state: "APPROVED", submittedAt: iso(9) }, // previous
    ];
    const result = aggregate(data({ prs: [pr({ reviews })] }), 7, UNTIL);
    const bob = result.rows.find((r) => r.login === "bob");
    expect(bob).toBeDefined();
    expect(bob?.reviewsGiven).toBe(2);
    expect(bob?.approvals).toBe(1);
    expect(bob?.changesRequested).toBe(1);
    expect(bob?.previous.reviewsGiven).toBe(1);
    // Alice's self-review is not counted; the PR itself was opened in the
    // previous window so she still appears with previous.prsOpened = 1.
    const alice = result.rows.find((r) => r.login === "alice");
    expect(alice?.reviewsGiven ?? 0).toBe(0);
  });

  it("counts distinct repos touched across commits, PRs, and reviews", () => {
    const result = aggregate(
      data({
        commits: [commit({ repo: "verana-labs/repo-a" })],
        prs: [
          pr({ repo: "2060-io/repo-b", createdAt: iso(1) }),
          pr({
            repo: "2060-io/repo-c",
            authorLogin: "bob",
            authorName: "Bob",
            createdAt: iso(20),
            reviews: [
              { login: "alice", name: "Alice", avatarUrl: null, htmlUrl: null, state: "APPROVED", submittedAt: iso(1) },
            ],
          }),
        ],
      }),
      7,
      UNTIL
    );
    const alice = result.rows.find((r) => r.login === "alice");
    expect(alice?.reposTouched).toBe(3);
  });

  it("sorts rows by commits descending by default", () => {
    const result = aggregate(
      data({
        commits: [
          commit({ login: "bob", name: "Bob" }),
          commit({ login: "bob", name: "Bob", committedDate: iso(2) }),
          commit({ login: "alice" }),
        ],
      }),
      7,
      UNTIL
    );
    expect(result.rows.map((r) => r.login)).toEqual(["bob", "alice"]);
  });
});

describe("formatDuration", () => {
  it("renders minutes, hours, days", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(18 * 60_000)).toBe("18m");
    expect(formatDuration(5 * 3_600_000 + 12 * 60_000)).toBe("5h 12m");
    expect(formatDuration(3 * DAY + 4 * 3_600_000)).toBe("3d 4h");
  });
});

describe("formatDelta", () => {
  it("signs the difference", () => {
    expect(formatDelta(12, 0)).toBe("+12");
    expect(formatDelta(2, 5)).toBe("−3");
    expect(formatDelta(4, 4)).toBe("±0");
  });
});
