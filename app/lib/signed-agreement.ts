import crypto from "node:crypto";
import { db } from "@/app/lib/db";
import { putFile } from "@/app/lib/storage";
import { AgreementContext } from "@/app/lib/agreement-template";
import { renderAgreementPdf } from "@/app/lib/agreement-pdf";

/** Storage key for a member's signed agreement PDF. One signed copy per member. */
export function agreementKey(memberId: string): string {
  return `agreements/${memberId}.pdf`;
}

/**
 * Render the personalised agreement PDF, write it to the storage volume, and
 * record its path + sha384 (SRI form) on the SignatureRecord. Returns the bytes
 * and that hash so the caller can attach the PDF and report it without re-render.
 */
export async function persistSignedAgreement(opts: {
  memberId: string;
  signatureRecordId: string;
  ctx: AgreementContext;
  template: string;
}): Promise<{ pdf: Buffer; hash: string; key: string }> {
  const pdf = await renderAgreementPdf(opts.ctx, opts.template);
  const hash = "sha384-" + crypto.createHash("sha384").update(pdf).digest("base64");
  const key = agreementKey(opts.memberId);
  await putFile(key, pdf);
  await db.signatureRecord.update({
    where: { id: opts.signatureRecordId },
    data: { agreementPdfPath: key, agreementHash: hash },
  });
  return { pdf, hash, key };
}
