import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/auth";
import { db } from "@/app/lib/db";

export const { GET } = handlers;

// Coarse magic-link throttle: cap the number of *active* (unexpired) sign-in
// links per email. Cheap, multi-replica-safe (DB-backed), and needs no schema
// change. A finer sliding-window limit (incl. per-IP) is a future improvement.
const MAX_ACTIVE_LINKS = 3;

export async function POST(req: NextRequest) {
  if (new URL(req.url).pathname.endsWith("/signin/nodemailer")) {
    try {
      const email = String((await req.clone().formData()).get("email") ?? "")
        .trim()
        .toLowerCase();
      if (email) {
        const active = await db.verificationToken.count({
          where: { identifier: email, expires: { gt: new Date() } },
        });
        if (active >= MAX_ACTIVE_LINKS) {
          return NextResponse.json(
            { error: "Too many sign-in attempts. Please try again later." },
            { status: 429 },
          );
        }
      }
    } catch {
      // On any parsing hiccup, fall through to normal handling.
    }
  }
  return handlers.POST(req);
}
