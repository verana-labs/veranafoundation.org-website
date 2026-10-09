import { cookies } from "next/headers";
import {
  APPLY_DRAFT_MAX_AGE,
  decodeDraft,
  encodeDraft,
  type ApplyDraft,
} from "@/app/lib/apply-draft";

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

export async function clearApplyDraft(): Promise<void> {
  const jar = await cookies();
  if (!jar.get(APPLY_DRAFT_COOKIE)) return;
  jar.set(APPLY_DRAFT_COOKIE, "", { path: COOKIE_PATH, maxAge: 0 });
}
