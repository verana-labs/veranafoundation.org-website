import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sendEmail, escapeHtml } from "@/app/lib/email";

export type ExecutionDetails = {
  to: string;
  memberName: string;
  membershipClass: string;
  signerName: string;
  signedAt: Date;
  agreementVersion: string;
  /** The version file that was signed, e.g. "membership-agreement-v1.md". */
  agreementSource: string;
  /** sha384 of the template version that was signed. */
  versionHash: string | null;
  /** sha384 of the exact signed PDF. */
  documentHash: string | null;
  /** The signed agreement PDF to attach (already rendered by the caller). */
  agreementPdf?: Buffer;
};

/** A one-page "Certificate of Execution" capturing who signed what, when. */
export async function buildExecutionCertificate(d: ExecutionDetails): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 790;
  const line = (text: string, size = 11, f = font) => {
    page.drawText(text, { x: 50, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= size + 8;
  };

  line("Verana Foundation — Membership Agreement", 16, bold);
  line("Certificate of Execution", 13, bold);
  y -= 10;
  line(`Member: ${d.memberName}`);
  line(`Membership class: ${d.membershipClass}`);
  line(`Signed by: ${d.signerName}`);
  line(`Date: ${d.signedAt.toISOString()}`);
  line(`Agreement version: ${d.agreementVersion}`);
  line(`Source: ${d.agreementSource}`, 9);
  if (d.versionHash) line(`Template hash (sha384): ${d.versionHash}`, 8);
  if (d.documentHash) line(`Signed document hash (sha384): ${d.documentHash}`, 8);
  y -= 10;
  line("The signed Membership Agreement is attached to this email.", 10);

  return Buffer.from(await pdf.save());
}

/** Email the signer a confirmation + the execution certificate PDF. */
export async function sendExecutedAgreementEmail(d: ExecutionDetails): Promise<void> {
  const certificate = await buildExecutionCertificate(d);
  const attachments = [
    { filename: `verana-membership-certificate-${d.agreementVersion}.pdf`, content: certificate },
  ];
  if (d.agreementPdf) {
    attachments.unshift({
      filename: `verana-membership-agreement-${d.agreementVersion}.pdf`,
      content: d.agreementPdf,
    });
  }
  const html = `
    <p>Thank you for joining the Verana Foundation.</p>
    <p>This confirms that <strong>${escapeHtml(d.signerName)}</strong> signed the
    Membership Agreement (version ${escapeHtml(d.agreementVersion)}) for
    <strong>${escapeHtml(d.memberName)}</strong> as a
    ${escapeHtml(d.membershipClass)} member on
    ${d.signedAt.toISOString().slice(0, 10)}.</p>
    <p>Your signed agreement and a certificate of execution are attached. You can
    also download the agreement any time from your account.</p>
  `;
  await sendEmail({
    to: d.to,
    subject: "Your Verana Foundation membership — executed agreement",
    html,
    attachments,
  });
}
