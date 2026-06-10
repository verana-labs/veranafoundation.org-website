import sharp from "sharp";
import { db } from "@/app/lib/db";
import { putFile, deleteFile } from "@/app/lib/storage";

// Organization logo pipeline. Rasters (png/jpeg/webp) are validated and
// re-encoded by sharp — downscaled to ≤512px WebP, which also strips EXIF
// (phone JPEGs can carry GPS) and defuses decompression bombs. SVGs are kept
// as uploaded but rejected when they contain active content; they are only
// ever rendered via <img> and served with a no-script CSP (see /logo route).

export const LOGO_MAX_BYTES = 1024 * 1024; // 1 MB upload cap
const RASTER_MAX_EDGE = 512; // stored size (longest side)
const RASTER_MIN_EDGE = 64;
const RASTER_SOURCE_MAX_EDGE = 4096;

export class LogoError extends Error {}

/** Storage key for a member's logo. */
export function logoKey(memberId: string, ext: "webp" | "svg"): string {
  return `logos/${memberId}.${ext}`;
}

/** Active content that must never appear in an uploaded SVG. */
const SVG_BLOCKLIST = [
  /<\s*script/i,
  /\son\w+\s*=/i, // onload=, onclick=, …
  /javascript:/i,
  /<\s*foreignObject/i,
  // External fetches (SSRF/tracking): any protocol-qualified href.
  /(?:xlink:)?href\s*=\s*["']\s*(?:https?:)?\/\//i,
];

function validateSvg(buf: Buffer): void {
  const text = buf.toString("utf8");
  const head = text.slice(0, 1000);
  if (!/<svg[\s>]/i.test(head)) throw new LogoError("Not a valid SVG file.");
  for (const re of SVG_BLOCKLIST) {
    if (re.test(text)) {
      throw new LogoError("SVG contains scripts or external references — please upload a plain vector logo.");
    }
  }
}

/**
 * Validate + normalize an upload. Returns the bytes to store and the
 * extension. Rasters come back as ≤512px WebP; SVGs verbatim.
 */
export async function processLogo(
  file: { name?: string; type?: string },
  buf: Buffer,
): Promise<{ data: Buffer; ext: "webp" | "svg"; contentType: string }> {
  if (buf.length === 0) throw new LogoError("The file is empty.");
  if (buf.length > LOGO_MAX_BYTES) {
    throw new LogoError("The logo must be 1 MB or smaller.");
  }

  // SVG: detect by content, not extension/MIME (both are client-controlled —
  // we check content either way; this just routes to the right validator).
  const sniff = buf.subarray(0, 256).toString("utf8");
  if (/^\s*(?:<\?xml|<!doctype svg|<svg)/i.test(sniff)) {
    validateSvg(buf);
    return { data: buf, ext: "svg", contentType: "image/svg+xml" };
  }

  // Raster: let sharp identify it (magic bytes, not headers) and re-encode.
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buf, { limitInputPixels: 4096 * 4096 }).metadata();
  } catch {
    throw new LogoError("Unsupported image — use SVG, PNG, WebP or JPG.");
  }
  if (!meta.format || !["png", "jpeg", "webp"].includes(meta.format)) {
    throw new LogoError("Unsupported image — use SVG, PNG, WebP or JPG.");
  }
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < RASTER_MIN_EDGE || h < RASTER_MIN_EDGE) {
    throw new LogoError(`The image is too small — at least ${RASTER_MIN_EDGE}px on each side.`);
  }
  if (w > RASTER_SOURCE_MAX_EDGE || h > RASTER_SOURCE_MAX_EDGE) {
    throw new LogoError(`The image is too large — at most ${RASTER_SOURCE_MAX_EDGE}px on each side.`);
  }

  const data = await sharp(buf)
    .resize(RASTER_MAX_EDGE, RASTER_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 90 })
    .toBuffer();
  return { data, ext: "webp", contentType: "image/webp" };
}

/**
 * Validate, store and record a member's logo (+ display consent). Best
 * called from authz-checked actions; throws LogoError with a user-safe
 * message on rejection.
 */
export async function saveMemberLogo(args: {
  memberId: string;
  file: File;
  displayConsent: boolean;
  actor: { userId?: string | null; email: string };
}): Promise<void> {
  const buf = Buffer.from(await args.file.arrayBuffer());
  const { data, ext } = await processLogo(args.file, buf);
  const key = logoKey(args.memberId, ext);
  const other = logoKey(args.memberId, ext === "svg" ? "webp" : "svg");

  await putFile(key, data);
  await deleteFile(other); // a replace may switch formats — keep one file
  await db.$transaction([
    db.member.update({
      where: { id: args.memberId },
      data: { logoUri: key, logoDisplayConsent: args.displayConsent },
    }),
    db.adminAction.create({
      data: {
        actorUserId: args.actor.userId ?? null,
        actorEmail: args.actor.email,
        action: "member.logo_upload",
        targetType: "Member",
        targetId: args.memberId,
        after: { key, displayConsent: args.displayConsent, bytes: data.length },
      },
    }),
  ]);
}

/** Remove a member's logo (file + record). */
export async function removeMemberLogo(args: {
  memberId: string;
  actor: { userId?: string | null; email: string };
}): Promise<void> {
  const member = await db.member.findUnique({ where: { id: args.memberId } });
  if (!member?.logoUri) return;
  await deleteFile(member.logoUri);
  await db.$transaction([
    db.member.update({
      where: { id: args.memberId },
      data: { logoUri: null, logoDisplayConsent: false },
    }),
    db.adminAction.create({
      data: {
        actorUserId: args.actor.userId ?? null,
        actorEmail: args.actor.email,
        action: "member.logo_remove",
        targetType: "Member",
        targetId: args.memberId,
        before: { key: member.logoUri },
      },
    }),
  ]);
}
