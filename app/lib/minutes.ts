/**
 * Publishing WG meeting minutes to the public GitHub minutes repository
 * (ADR-0003): `MINUTES_REPO` (e.g. "verana-labs/working-groups"), path
 * `<wg-slug>/minutes/YYYY-MM-DD.md`. The DB keeps the working copy and renders
 * the history pages; the commit is the immutable, citable public record.
 *
 * Idempotent: re-publishing the same path updates the file (the existing blob
 * sha is sent), so a retry after a partial failure converges.
 */

const API = "https://api.github.com";

function config() {
  const repo = process.env.MINUTES_REPO;
  const token = process.env.MINUTES_GITHUB_TOKEN;
  if (!repo || !token) return null;
  return { repo, token };
}

export function minutesConfigured(): boolean {
  return config() !== null;
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "veranafoundation.org",
  };
}

export type MinutesInput = {
  wgSlug: string;
  wgName: string;
  date: Date; // the session's occurrence date
  attendees: string[]; // display names, snapshotted
  recordedBy: string;
  markdown: string; // the notes body
};

export function minutesPath(wgSlug: string, date: Date): string {
  return `${wgSlug}/minutes/${date.toISOString().slice(0, 10)}.md`;
}

/** The committed file: YAML front matter + the notes. */
export function renderMinutes(input: MinutesInput): string {
  const day = input.date.toISOString().slice(0, 10);
  const quote = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
  return [
    "---",
    `working_group: ${quote(input.wgName)}`,
    `date: ${day}`,
    `recorded_by: ${quote(input.recordedBy)}`,
    "attendees:",
    ...input.attendees.map((a) => `  - ${quote(a)}`),
    "---",
    "",
    `# ${input.wgName} — ${day}`,
    "",
    input.markdown.trim(),
    "",
  ].join("\n");
}

/** Commit the minutes; returns the repo path and commit sha. Throws on failure. */
export async function publishMinutes(
  input: MinutesInput,
): Promise<{ path: string; commitSha: string }> {
  const cfg = config();
  if (!cfg) {
    throw new Error("Minutes repo is not configured (MINUTES_REPO / MINUTES_GITHUB_TOKEN).");
  }
  const path = minutesPath(input.wgSlug, input.date);
  const url = `${API}/repos/${cfg.repo}/contents/${path}`;

  // Existing file? Send its blob sha so the PUT is an update, not a conflict.
  let existingSha: string | undefined;
  const probe = await fetch(url, { headers: headers(cfg.token), cache: "no-store" });
  if (probe.ok) existingSha = ((await probe.json()) as { sha: string }).sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: headers(cfg.token),
    body: JSON.stringify({
      message: `minutes(${input.wgSlug}): ${input.date.toISOString().slice(0, 10)}`,
      content: Buffer.from(renderMinutes(input), "utf8").toString("base64"),
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub commit failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { commit: { sha: string } };
  return { path, commitSha: data.commit.sha };
}

/** Web URL of a published minutes file at its exact commit. */
export function minutesUrl(path: string, commitSha: string): string | null {
  const cfg = config();
  if (!cfg) return null;
  return `https://github.com/${cfg.repo}/blob/${commitSha}/${path}`;
}
