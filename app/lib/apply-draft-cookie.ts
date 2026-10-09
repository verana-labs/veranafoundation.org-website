import { cookies } from "next/headers";
import {
  APPLY_DRAFT_MAX_AGE,
  decodeDraft,
  encodeDraft,
  type ApplyDraft,
} from "@/app/lib/apply-draft";
import { deleteDraftLogo } from "@/app/lib/apply-draft-logo";

// Cookie I/O for the /apply draft (see apply-draft.ts). Scoped to /apply, httpOnly,
// one hour. Written and cleared by the apply server action; read by the apply page.

export const APPLY_DRAFT_COOKIE = "apply_draft";

const COOKIE_PATH = "/apply";

export async function saveApplyDraft(draft: ApplyDraft): Promise<void> {
  (await cookies()).set(APPLY_DRAFT_COOKIE, encodeDraft(draft), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: APPLY_DRAFT_MAX_AGE,
  });
}

export async function readApplyDraft(): Promise<ApplyDraft | null> {
  return decodeDraft((await cookies()).get(APPLY_DRAFT_COOKIE)?.value);
}

/** Drop the draft cookie and any logo stashed for it (after the application is in). */
export async function clearApplyDraft(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(APPLY_DRAFT_COOKIE)?.value;
  if (raw === undefined) return;
  const draft = decodeDraft(raw);
  if (draft?.logoToken && draft.logoExt) {
    try {
      await deleteDraftLogo(draft.logoToken, draft.logoExt);
    } catch (e) {
      console.error("[apply] draft logo cleanup failed", e);
    }
  }
  jar.set(APPLY_DRAFT_COOKIE, "", { path: COOKIE_PATH, maxAge: 0 });
}
