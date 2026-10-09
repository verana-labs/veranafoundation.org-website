import { NextResponse } from "next/server";
import { readApplyDraft } from "@/app/lib/apply-draft-cookie";
import { draftLogoContentType, readDraftLogo } from "@/app/lib/apply-draft-logo";

// Preview of the logo stashed for the current /apply draft (apply-draft-logo.ts).
// Only the browser holding the draft cookie can reach its own stash: the token
// comes from the cookie, never from the URL. Same no-script CSP + nosniff as
// the public /logo route; private, uncached.
export async function GET() {
  const draft = await readApplyDraft();
  if (!draft?.logoToken || !draft.logoExt) {
    return new NextResponse("Not found", { status: 404 });
  }
  const bytes = await readDraftLogo(draft.logoToken, draft.logoExt);
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": draftLogoContentType(draft.logoExt),
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
