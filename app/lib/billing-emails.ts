// Transactional emails around Associate dues: the payment request (sent at
// signature, separate from the executed-agreement email) and the receipt
// (sent when the invoice is paid). Both best-effort at call sites.

import { sendEmail, escapeHtml } from "@/app/lib/email";
import { emailLayout } from "@/app/lib/email-layout";
import { formatEur } from "@/app/lib/dues";

const SITE_URL = process.env.AUTH_URL ?? "https://veranafoundation.org";

/** Multiline bank details from env (account holder, IBAN, BIC…), or null. */
function bankDetailsHtml(reference: string): string {
  const details = process.env.BANK_TRANSFER_DETAILS;
  if (!details) return "";
  return `
    <p style="margin:20px 0 6px;font-weight:600;">Prefer a direct bank transfer?</p>
    <p style="margin:0 0 8px;">Wire the amount to the account below, using
    <strong>${escapeHtml(reference)}</strong> as the payment reference:</p>
    <pre style="margin:0;padding:12px 14px;background:#fafafb;border:1px solid #e8e6e0;border-radius:8px;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(details)}</pre>`;
}

export async function sendPaymentRequestEmail(args: {
  to: string;
  memberName: string;
  invoiceNumber: string;
  amountDue: string; // preformatted, e.g. "€3,000"
  vatNote: string | null;
  dueDate: Date;
  payUrl: string | null;
}): Promise<void> {
  const due = args.dueDate.toISOString().slice(0, 10);
  await sendEmail({
    to: args.to,
    subject: `Membership dues — invoice ${args.invoiceNumber}`,
    html: emailLayout({
      heading: "Complete your Associate membership",
      bodyHtml: `
        <p style="margin:0 0 12px;">Thank you — the Membership Agreement for
        <strong>${escapeHtml(args.memberName)}</strong> is signed. Your Associate
        membership activates as soon as the annual dues are paid.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"
               style="margin:16px 0;width:100%;border:1px solid #e8e6e0;border-radius:8px;">
          <tr><td style="padding:14px 16px;font-size:14px;line-height:1.7;">
            Invoice <strong>${escapeHtml(args.invoiceNumber)}</strong><br>
            Amount due <strong>${escapeHtml(args.amountDue)}</strong><br>
            ${args.vatNote ? `${escapeHtml(args.vatNote)}<br>` : ""}
            Due by <strong>${due}</strong>
          </td></tr>
        </table>
        ${args.payUrl ? `<p style="margin:0;">Pay securely online:</p>` : ""}
        ${bankDetailsHtml(args.invoiceNumber)}`,
      button: args.payUrl
        ? { label: "Pay membership dues", href: args.payUrl }
        : undefined,
    }),
  });
}

export async function sendPaymentReceiptEmail(args: {
  to: string;
  memberName: string;
  invoiceNumber: string;
  amountPaid: number; // minor units
  periodEnd: Date;
}): Promise<void> {
  const until = args.periodEnd.toISOString().slice(0, 10);
  await sendEmail({
    to: args.to,
    subject: `Payment received — ${args.invoiceNumber}`,
    html: emailLayout({
      heading: "Welcome aboard — membership active",
      bodyHtml: `
        <p style="margin:0 0 12px;">We received your payment of
        <strong>${escapeHtml(formatEur(args.amountPaid))}</strong> for invoice
        <strong>${escapeHtml(args.invoiceNumber)}</strong>.</p>
        <p style="margin:0 0 12px;">The Associate membership of
        <strong>${escapeHtml(args.memberName)}</strong> is now active until
        <strong>${until}</strong>. Working-group access and member benefits are
        available from your account.</p>`,
      button: { label: "Go to your account", href: `${SITE_URL}/account` },
    }),
  });
}
