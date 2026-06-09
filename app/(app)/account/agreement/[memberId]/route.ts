import { NextRequest, NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { db } from "@/app/lib/db";
import { getFile } from "@/app/lib/storage";

/** Stream a member's signed Membership Agreement PDF to anyone who may act for them. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const { memberId } = await params;
  const user = await currentUser();
  if (!user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const allowed =
    (await isAdmin(user.email)) ||
    !!(await db.userMember.findUnique({
      where: { userId_memberId: { userId: user.id, memberId } },
    }));
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const sig = await db.signatureRecord.findFirst({
    where: { memberId, agreementPdfPath: { not: null } },
    orderBy: { signedAt: "desc" },
    select: { agreementPdfPath: true, agreementVersion: true },
  });
  if (!sig?.agreementPdfPath) return new NextResponse("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await getFile(sig.agreementPdfPath);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const filename = `verana-membership-agreement-${sig.agreementVersion}.pdf`;
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
