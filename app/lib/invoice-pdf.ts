import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/app/lib/db";
import { tierLabel } from "@/app/lib/dues";

// Renders a dues invoice to PDF with pdf-lib + standard Helvetica (same
// approach as agreement-pdf.ts: no headless browser, runs on node:alpine).
// Our DB is the invoicing system of record — this PDF is the member-facing
// document: seller/buyer blocks, the dues line, VAT treatment with the
// reverse-charge wording, totals, and how to pay.

const PAGE = { w: 595.28, h: 841.89 }; // A4 in points
const MARGIN = 56;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.8, 0.8, 0.8);

const SITE_URL = process.env.AUTH_URL ?? "https://veranafoundation.org";

function eur(cents: number): string {
  // pdf-lib's Helvetica has no narrow-no-break space; build "€1,500.00" by hand.
  const v = (cents / 100).toFixed(2);
  const [int, frac] = v.split(".");
  return `EUR ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

function vatLine(treatment: string, net: number, vatAmount: number): {
  label: string;
  note: string | null;
} {
  if (treatment === "reverse_charge") {
    return {
      label: "VAT (reverse charge) — 0%",
      note: "VAT reverse charged — Art. 196 of Council Directive 2006/112/EC. VAT to be accounted for by the recipient.",
    };
  }
  if (treatment === "outside_scope") {
    return { label: "VAT — not applicable", note: "Supply outside the scope of EU VAT." };
  }
  const rate = net > 0 ? Math.round((vatAmount / net) * 100) : 0;
  return { label: `VAT (Estonia) — ${rate}%`, note: null };
}

/** Render the invoice as a PDF. Throws if the invoice doesn't exist. */
export async function renderInvoicePdf(
  invoiceId: string,
): Promise<{ pdf: Buffer; filename: string }> {
  const inv = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { sellerEntity: true, membership: { include: { member: true } } },
  });
  if (!inv) throw new Error("Invoice not found");
  const member = inv.membership.member;
  const seller = inv.sellerEntity;
  const tier = tierLabel(inv.membership.tier, inv.feeScheduleVersion);

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE.w, PAGE.h]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE.h - MARGIN;
  const right = PAGE.w - MARGIN;
  const text = (
    s: string,
    opts: { x?: number; size?: number; font?: PDFFont; color?: typeof INK; alignRight?: boolean } = {},
  ) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    const x = opts.alignRight
      ? right - f.widthOfTextAtSize(s, size)
      : opts.x ?? MARGIN;
    page.drawText(s, { x, y, size, font: f, color: opts.color ?? INK });
  };
  const down = (n: number) => (y -= n);
  const hr = () => {
    page.drawLine({
      start: { x: MARGIN, y: y + 4 },
      end: { x: right, y: y + 4 },
      thickness: 0.5,
      color: RULE,
    });
  };

  // ── Header ────────────────────────────────────────────────────────────────
  text("INVOICE", { size: 20, font: bold });
  text(inv.number, { size: 13, font: bold, alignRight: true });
  down(18);
  if (inv.status === "paid" && inv.paidAt) {
    text(`PAID — ${inv.paidAt.toISOString().slice(0, 10)}`, {
      size: 10,
      font: bold,
      color: rgb(0.1, 0.5, 0.25),
      alignRight: true,
    });
  } else if (inv.status === "void") {
    text("VOID", { size: 10, font: bold, color: rgb(0.7, 0.2, 0.2), alignRight: true });
  } else if (inv.dueDate) {
    text(`Due ${inv.dueDate.toISOString().slice(0, 10)}`, { size: 10, color: MUTED, alignRight: true });
  }
  down(26);

  // ── Seller / buyer ────────────────────────────────────────────────────────
  const sellerLines = [
    seller.legalName,
    ...(seller.address ? seller.address.split("\n") : []),
    `Country: ${seller.country}`,
    ...(seller.vatNumber ? [`VAT: ${seller.vatNumber}`] : []),
  ];
  const buyerLines = [
    member.legalName,
    ...(member.registeredAddress ? member.registeredAddress.split("\n") : []),
    ...(member.jurisdiction ? [`Country: ${member.jurisdiction}`] : []),
    ...(member.vatNumber ? [`VAT: ${member.vatNumber}`] : []),
  ];
  text("From", { size: 8, color: MUTED });
  text("Billed to", { size: 8, color: MUTED, x: PAGE.w / 2 });
  down(14);
  const blockTop = y;
  for (const [i, l] of sellerLines.entries()) {
    text(l, { size: 10, font: i === 0 ? bold : font });
    down(14);
  }
  const afterSeller = y;
  y = blockTop;
  for (const [i, l] of buyerLines.entries()) {
    text(l, { size: 10, font: i === 0 ? bold : font, x: PAGE.w / 2 });
    down(14);
  }
  y = Math.min(afterSeller, y);
  down(8);
  text(`Issued: ${(inv.issuedAt ?? inv.createdAt).toISOString().slice(0, 10)}`, {
    size: 10,
    color: MUTED,
  });
  down(28);

  // ── Line items ────────────────────────────────────────────────────────────
  const vat = vatLine(inv.vatTreatment, inv.netAmount, inv.vatAmount);
  hr();
  down(14);
  text("Description", { size: 8, color: MUTED });
  text("Amount", { size: 8, color: MUTED, alignRight: true });
  down(16);
  text(
    `Associate membership dues — annual${tier ? ` (${tier})` : ""}`,
    { size: 10 },
  );
  text(eur(inv.netAmount), { size: 10, alignRight: true });
  down(16);
  text(vat.label, { size: 10 });
  text(eur(inv.vatAmount), { size: 10, alignRight: true });
  down(10);
  hr();
  down(14);
  text("Total due", { size: 11, font: bold });
  text(eur(inv.grossAmount), { size: 11, font: bold, alignRight: true });
  down(18);
  if (vat.note) {
    text(vat.note, { size: 8, color: MUTED });
    down(24);
  } else {
    down(10);
  }

  // ── Payment instructions ──────────────────────────────────────────────────
  if (inv.status === "issued") {
    text("How to pay", { size: 8, color: MUTED });
    down(14);
    if (process.env.STRIPE_SECRET_KEY) {
      text(`By card: ${SITE_URL}/pay/${inv.id}`, { size: 10 });
      down(14);
    }
    const bank = process.env.BANK_TRANSFER_DETAILS;
    if (bank) {
      text(`By bank transfer, using ${inv.number} as the payment reference:`, { size: 10 });
      down(14);
      for (const l of bank.split("\n")) {
        text(l, { size: 9, color: MUTED, x: MARGIN + 12 });
        down(12);
      }
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  y = MARGIN - 14;
  text(`${seller.legalName} — generated electronically, valid without signature.`, {
    size: 7.5,
    color: MUTED,
  });

  return {
    pdf: Buffer.from(await doc.save()),
    filename: `${inv.number}.pdf`,
  };
}
