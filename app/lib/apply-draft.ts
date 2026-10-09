import { z } from "zod";

/**
 * Application draft kept across the sign-in round trip of the /apply wizard.
 *
 * Anyone can fill in the application and review the personalised agreement
 * before signing in; the signature itself needs a verified email, so the Sign
 * action sends an anonymous user to /login. Without a draft the user came back
 * to an empty form and had to start over. The Sign action now stores the typed
 * details in a short-lived cookie (apply-draft-cookie.ts) and the apply page
 * reads it back after sign-in to prefill the form and reopen the review step.
 *
 * Text fields only: a picked logo file cannot be carried over (the review step
 * says so). Fields are truncated so the whole cookie stays well under 4 KB.
 */

const LIMITS = {
  legalName: 300,
  entityType: 100,
  jurisdiction: 8,
  registeredAddress: 500,
  countryOfResidence: 8,
  country: 8,
  vatNumber: 40,
  tier: 20,
  signerName: 300,
  signerTitle: 200,
} as const;

type TextKey = keyof typeof LIMITS;

const text = (k: TextKey) => z.string().trim().min(1).max(LIMITS[k]).optional();

export const applyDraftSchema = z.object({
  class: z.enum(["contributor", "associate"]),
  type: z.enum(["individual", "organization"]).optional(),
  legalName: text("legalName"),
  entityType: text("entityType"),
  jurisdiction: text("jurisdiction"),
  registeredAddress: text("registeredAddress"),
  countryOfResidence: text("countryOfResidence"),
  country: text("country"),
  vatNumber: text("vatNumber"),
  tier: text("tier"),
  signerName: text("signerName"),
  signerTitle: text("signerTitle"),
  socialAnnouncementConsent: z.boolean().optional(),
});

export type ApplyDraft = z.infer<typeof applyDraftSchema>;

/** Lifetime of a draft: long enough for an email-code sign-in, short enough to not linger. */
export const APPLY_DRAFT_MAX_AGE = 60 * 60; // seconds

/** Build a draft from the wizard's submitted form data (never throws on odd input). */
export function draftFromFormData(fd: FormData): ApplyDraft {
  const str = (k: TextKey): string | undefined => {
    const v = fd.get(k);
    if (typeof v !== "string") return undefined;
    const t = v.trim().slice(0, LIMITS[k]);
    return t.length ? t : undefined;
  };
  const type = fd.get("type");
  return applyDraftSchema.parse({
    class: fd.get("class") === "associate" ? "associate" : "contributor",
    type: type === "organization" || type === "individual" ? type : undefined,
    legalName: str("legalName"),
    entityType: str("entityType"),
    jurisdiction: str("jurisdiction"),
    registeredAddress: str("registeredAddress"),
    countryOfResidence: str("countryOfResidence"),
    country: str("country"),
    vatNumber: str("vatNumber"),
    tier: str("tier"),
    signerName: str("signerName"),
    signerTitle: str("signerTitle"),
    socialAnnouncementConsent: fd.get("socialAnnouncementConsent") === "on",
  });
}

/** Cookie-safe serialisation (base64url JSON). */
export function encodeDraft(d: ApplyDraft): string {
  return Buffer.from(JSON.stringify(d), "utf8").toString("base64url");
}

/** Inverse of encodeDraft; null for anything missing, malformed or off-schema. */
export function decodeDraft(raw: string | null | undefined): ApplyDraft | null {
  if (!raw) return null;
  try {
    const parsed = applyDraftSchema.safeParse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
