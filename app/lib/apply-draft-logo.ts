import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { LogoError, processLogo } from "@/app/lib/logo";
import { deleteFile, getFile, putFile, storageRoot } from "@/app/lib/storage";
import { APPLY_DRAFT_MAX_AGE } from "@/app/lib/apply-draft";

/**
 * Server-side stash for the logo picked on /apply before the sign-in round
 * trip (see apply-draft.ts). A browser file input cannot be re-populated, so
 * the Sign action validates and normalises the upload exactly like a member
 * logo (processLogo) and keeps the result under a random token in the file
 * store; the draft cookie carries the token. After sign-in the review step
 * previews it via /apply/draft-logo and the application uses it unless the
 * user picks a new file. Stashes live as long as the draft (one hour); the
 * sweep below removes anything older on each new stash.
 */

const PREFIX = "apply-drafts";
const TOKEN_RE = /^[a-f0-9]{32}$/;

export type DraftLogoExt = "webp" | "svg";

export function draftLogoKey(token: string, ext: DraftLogoExt): string {
  if (!TOKEN_RE.test(token)) throw new Error("apply-draft-logo: invalid token");
  return `${PREFIX}/${token}.${ext}`;
}

export function draftLogoContentType(ext: DraftLogoExt): string {
  return ext === "svg" ? "image/svg+xml" : "image/webp";
}

/**
 * Validate + store an uploaded logo for the draft. Returns null (and logs) when
 * the file is rejected, so a bad logo never blocks the sign-in redirect — the
 * same best-effort rule as the application itself.
 */
export async function stashDraftLogo(
  file: File,
): Promise<{ token: string; ext: DraftLogoExt } | null> {
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { data, ext } = await processLogo(file, buf);
    const token = crypto.randomBytes(16).toString("hex");
    await putFile(draftLogoKey(token, ext), data);
    void sweepDraftLogos();
    return { token, ext };
  } catch (e) {
    if (e instanceof LogoError) console.warn("[apply] draft logo rejected:", e.message);
    else console.error("[apply] draft logo stash failed", e);
    return null;
  }
}

/** Bytes of a stashed logo, or null when the token is unknown or expired. */
export async function readDraftLogo(token: string, ext: DraftLogoExt): Promise<Buffer | null> {
  if (!TOKEN_RE.test(token)) return null;
  try {
    return await getFile(draftLogoKey(token, ext));
  } catch {
    return null;
  }
}

export async function deleteDraftLogo(token: string, ext: DraftLogoExt): Promise<void> {
  if (!TOKEN_RE.test(token)) return;
  await deleteFile(draftLogoKey(token, ext));
}

/** Remove stashes older than the draft lifetime (abandoned sign-ins). */
export async function sweepDraftLogos(): Promise<void> {
  const dir = path.join(storageRoot(), PREFIX);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return; // nothing stashed yet
  }
  const cutoff = Date.now() - APPLY_DRAFT_MAX_AGE * 1000;
  await Promise.all(
    names.map(async (name) => {
      const full = path.join(dir, name);
      try {
        const st = await fs.stat(full);
        if (st.mtimeMs < cutoff) await fs.rm(full, { force: true });
      } catch {
        /* raced with another sweep */
      }
    }),
  );
}
