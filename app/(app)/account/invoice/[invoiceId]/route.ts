import { NextRequest, NextResponse } from "next/server";
import { currentUser, isAdmin, isManagerOf } from "@/app/lib/authz";
import { db } from "@/app/lib/db";
import { renderInvoicePdf } from "@/app/lib/invoice-pdf";

// Download a dues invoice as PDF (rendered on demand — the DB is the system
// of record, so no file is stored). Access mirrors the signed-agreement
// download: Foundation admins, or a manager of the invoiced member.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;
  const user = await currentUser();
  if (!user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { membership: { select: { memberId: true } } },
  });
  if (!invoice) return new NextResponse("Not found", { status: 404 });

  const allowed =
    (await isAdmin(user.email)) ||
    (await isManagerOf(user.id, invoice.membership.memberId));
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const { pdf, filename } = await renderInvoicePdf(invoiceId);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
