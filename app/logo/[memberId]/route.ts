import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { getFile } from "@/app/lib/storage";

// Public logo endpoint (member logos will appear on marketing pages).
// Deliberately outside the auth middleware. The no-script CSP + nosniff make
// even a hostile SVG inert — and uploads are validated against active
// content anyway (app/lib/logo.ts).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const { memberId } = await params;
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { logoUri: true },
  });
  if (!member?.logoUri) return new NextResponse("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await getFile(member.logoUri);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const contentType = member.logoUri.endsWith(".svg")
    ? "image/svg+xml"
    : "image/webp";
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
