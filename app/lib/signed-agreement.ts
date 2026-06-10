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
 *
 * Persistence (volume + DB) is best-effort: a broken storage mount must not
 * cost the member their signed copy — the rendered bytes are still returned so
 * the executed-agreement email attaches them. `persisted: false` means the
 * /account download will 404 until the copy is re-persisted.
 */
export async function persistSignedAgreement(opts: {
  memberId: string;
  signatureRecordId: string;
  ctx: AgreementContext;
  template: string;
}): Promise<{ pdf: Buffer; hash: string; key: string; persisted: boolean }> {
  const pdf = await renderAgreementPdf(opts.ctx, opts.template);
  const hash = "sha384-" + crypto.createHash("sha384").update(pdf).digest("base64");
  const key = agreementKey(opts.memberId);
  let persisted = true;
  try {
    await putFile(key, pdf);
    await db.signatureRecord.update({
      where: { id: opts.signatureRecordId },
      data: { agreementPdfPath: key, agreementHash: hash },
    });
  } catch (e) {
    persisted = false;
    console.error(
      `[signed-agreement] persist failed for member ${opts.memberId} — the email still attaches the PDF, but the /account download will 404 until re-persisted`,
      e,
    );
  }
  return { pdf, hash, key, persisted };
}
