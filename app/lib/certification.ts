/**
 * Certification Program content, sourced from the public curriculum repository
 * (the source of truth, maintained by the Showcase and Certification Working
 * Group) and from the policy documents bundled under legal/certification/.
 *
 *   CERT_REPO    (default "verana-labs/certification"): owner/name
 *   CERT_BRANCH  (default "main")
 *
 * The repository publishes `program.json` (levels, modules, tracks and
 * organization designations), `certificators.json` (the directory) and one
 * `modules/<code>/README.md` per module, with flat front matter. Everything is
 * fetched server-side with ISR, the same way the blog is, and every call is
 * wrapped so an unreachable GitHub degrades to an empty state instead of
 * breaking a build or a request.
 *
 * Auth falls back to CERT_GITHUB_TOKEN -> BLOG_GITHUB_TOKEN -> MINUTES_GITHUB_TOKEN;
 * a token is optional for the public repository but lifts the rate limit.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { sha384 } from "./agreement-versions";

const RAW = "https://raw.githubusercontent.com";
const REVALIDATE = 3600; // 1 hour

const REPO = process.env.CERT_REPO ?? "verana-labs/certification";
const BRANCH = process.env.CERT_BRANCH ?? "main";
const TOKEN =
  process.env.CERT_GITHUB_TOKEN ??
  process.env.BLOG_GITHUB_TOKEN ??
  process.env.MINUTES_GITHUB_TOKEN;

/** Where the human-readable repository lives (links from the pages). */
export const CERT_REPO_URL = `https://github.com/${REPO}`;

// --- types (mirror program.json) --------------------------------------------

export type Level = {
  level: number;
  name: string;
  subtitle: string;
  how: string;
  validityYears: number;
};

export type ModuleMeta = {
  code: string;
  title: string;
  hours: number;
  assessment: string;
  status: "outline" | "published";
  group: "core" | "technical" | "business" | "instructor";
  summary: string;
};

export type Track = {
  slug: string;
  name: string;
  level: number;
  phase: number;
  core: string[];
  modules: string[];
  choice?: string[][];
  reduced?: string[];
  audience: string;
  summary: string;
};

export type Designation = {
  slug: string;
  name: string;
  for: string;
  membership: string;
  staff: { count: number; tracks: string[] }[];
  evidence: string[];
};

export type Program = {
  name: string;
  version: string;
  status: string;
  protocol: { verifiableTrust: string; verifiablePublicRegistry: string; network: string };
  policy: string;
  levels: Level[];
  modules: ModuleMeta[];
  tracks: Track[];
  trackRules?: Record<string, string>;
  designations: Designation[];
};

export type Certificator = {
  slug: string;
  name: string;
  status: "launch" | "accredited" | "suspended";
  website: string;
  contact?: string;
  country?: string;
  regions: string[];
  languages: string[];
  tracks: string[];
  about?: string;
};

export type ModuleDoc = ModuleMeta & { version: string; bodyMarkdown: string };

// --- GitHub fetch -----------------------------------------------------------

function headers(): HeadersInit {
  const h: Record<string, string> = { "User-Agent": "veranafoundation.org" };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function fetchText(file: string): Promise<string | null> {
  const url = `${RAW}/${REPO}/${encodeURIComponent(BRANCH)}/${file}`;
  try {
    const res = await fetch(url, { headers: headers(), next: { revalidate: REVALIDATE } });
    if (!res.ok) {
      // 404 for a module that is not published yet is expected; log the rest.
      if (res.status !== 404) {
        console.error(
          `[certification] fetch failed: HTTP ${res.status} for ${url} (auth: ${TOKEN ? "token" : "anonymous"})`,
        );
      }
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error(`[certification] fetch threw for ${url}:`, err);
    return null;
  }
}

async function fetchJson<T>(file: string): Promise<T | null> {
  const text = await fetchText(file);
  if (text == null) return null;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error(`[certification] invalid JSON in ${file}:`, err);
    return null;
  }
}

/** The program manifest, or null when unreachable. */
export async function getProgram(): Promise<Program | null> {
  const p = await fetchJson<Program>("program.json");
  if (!p || !Array.isArray(p.modules) || !Array.isArray(p.tracks)) return null;
  return p;
}

/** The certificator directory (empty when unreachable). */
export async function getCertificators(): Promise<Certificator[]> {
  const d = await fetchJson<{ certificators: Certificator[] }>("certificators.json");
  return Array.isArray(d?.certificators) ? d!.certificators : [];
}

/** One module's material, or null when the code is unknown or unreachable. */
export async function getModule(code: string): Promise<ModuleDoc | null> {
  if (!/^[A-Z][0-9]$/.test(code)) return null;
  const raw = await fetchText(`modules/${code}/README.md`);
  if (raw == null) return null;
  const { data, body } = parseFrontMatter(raw);
  if (data.code !== code) return null;
  return {
    code,
    title: data.title ?? code,
    hours: Number(data.hours ?? 0),
    assessment: data.assessment ?? "",
    status: data.status === "published" ? "published" : "outline",
    group: (["core", "technical", "business", "instructor"] as const).includes(
      data.group as ModuleMeta["group"],
    )
      ? (data.group as ModuleMeta["group"])
      : groupFromCode(code),
    summary: data.summary ?? "",
    version: data.version ?? "",
    bodyMarkdown: stripLeadingHeading(body),
  };
}

// --- pure helpers (unit-tested) ---------------------------------------------

type RawFrontMatter = Record<string, string>;

/** Minimal front-matter parser: flat `key: value` pairs between `---` fences. */
export function parseFrontMatter(raw: string): { data: RawFrontMatter; body: string } {
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

/** Drop a leading `# Title` line: the page renders its own title. */
export function stripLeadingHeading(body: string): string {
  return body.replace(/^\s*#\s[^\n]*\n+/, "");
}

export function groupFromCode(code: string): ModuleMeta["group"] {
  switch (code[0]) {
    case "C":
      return "core";
    case "T":
      return "technical";
    case "B":
      return "business";
    default:
      return "instructor";
  }
}

/** Every module code a track touches, in catalogue order of appearance. */
export function trackModuleCodes(track: Track): string[] {
  const codes = [
    ...track.core,
    ...track.modules,
    ...(track.choice ?? []).flat(),
    ...(track.reduced ?? []),
  ];
  return [...new Set(codes)];
}

/**
 * Class hours of a track. Choice groups contribute their shortest option to
 * `min` and their longest to `max`; reduced modules contribute nothing since
 * only their reading is required.
 */
export function trackHours(track: Track, modules: ModuleMeta[]): { min: number; max: number } {
  const hours = (code: string) => modules.find((m) => m.code === code)?.hours ?? 0;
  const fixed = [...track.core, ...track.modules].reduce((sum, c) => sum + hours(c), 0);
  let min = fixed;
  let max = fixed;
  for (const group of track.choice ?? []) {
    const hs = group.map(hours);
    if (hs.length === 0) continue;
    min += Math.min(...hs);
    max += Math.max(...hs);
  }
  return { min, max };
}

/** Tracks that include a module in any capacity. */
export function tracksWithModule(program: Program, code: string): Track[] {
  return program.tracks.filter((t) => trackModuleCodes(t).includes(code));
}

/**
 * Pick the highest `<prefix>-vN.md` in a list of file names (numeric compare on
 * N, dotted versions allowed), or null when none matches.
 */
export function pickLatestVersion(files: string[], prefix: string): string | null {
  const re = new RegExp(`^${prefix}-v(\\d+(?:\\.\\d+)*)\\.md$`);
  let best: { file: string; parts: number[] } | null = null;
  for (const file of files) {
    const m = re.exec(file);
    if (!m) continue;
    const parts = m[1].split(".").map(Number);
    if (!best || compareParts(parts, best.parts) > 0) best = { file, parts };
  }
  return best?.file ?? null;
}

function compareParts(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** "certification-policy-v1.md" -> "v1". */
export function documentVersionLabel(file: string): string {
  const m = /-(v\d+(?:\.\d+)*)\.md$/.exec(file);
  return m ? m[1] : file.replace(/\.md$/, "");
}

// --- bundled policy documents (legal/certification/) ------------------------

const CERT_LEGAL_DIR = path.join(process.cwd(), "legal", "certification");

export type CertificationDocument = {
  file: string;
  version: string; // "v1"
  markdown: string;
  sha384: string; // SRI form, the digest that gets anchored
};

/**
 * The latest version of a bundled Certification Program document
 * ("certification-policy", "candidate-terms"), or null when the folder or the
 * file is absent, so the page can say the document is being finalized.
 */
export async function getCertificationDocument(
  prefix: "certification-policy" | "candidate-terms",
): Promise<CertificationDocument | null> {
  try {
    const entries = await fs.readdir(CERT_LEGAL_DIR, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile()).map((e) => e.name);
    const file = pickLatestVersion(files, prefix);
    if (!file) return null;
    const markdown = await fs.readFile(path.join(CERT_LEGAL_DIR, file), "utf8");
    return { file, version: documentVersionLabel(file), markdown, sha384: sha384(markdown) };
  } catch {
    return null;
  }
}
