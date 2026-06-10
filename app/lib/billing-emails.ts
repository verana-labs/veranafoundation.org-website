// Transactional emails around Associate dues: the payment request (sent at
// signature or on renewal), dunning reminders, the expiry notice, and the
// receipt (sent when the invoice is paid). All best-effort at call sites.

import { sendEmail, escapeHtml } from "@/app/lib/email";
import { emailLayout } from "@/app/lib/email-layout";
import { formatEur } from "@/app/lib/dues";
import { renderInvoicePdf } from "@/app/lib/invoice-pdf";

const SITE_URL = process.env.AUTH_URL ?? "https://veranafoundation.org";
const PURPLE = "#763ef0";

/**
 * "How would you like to pay?" — card link + wire instructions, shared by the
 * payment-request and reminder emails.
 */
function payOptionsHtml(payUrl: string | null, reference: string): string {
  const details = process.env.BANK_TRANSFER_DETAILS;
  const card = payUrl
    ? `<p style="margin:0 0 6px;"><strong>By card</strong>:
       <a href="${payUrl}" style="color:${PURPLE};">pay securely online here</a>.</p>`
    : "";
  const bank = details
    ? `<p style="margin:20px 0 6px;font-weight:600;">Prefer a direct bank transfer?</p>
       <p style="margin:0 0 8px;">Wire the amount to the account below, using
       <strong>${escapeHtml(reference)}</strong> as the payment reference:</p>
       <pre style="margin:0;padding:12px 14px;background:#fafafb;border:1px solid #e8e6e0;border-radius:8px;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(details)}</pre>`
    : "";
  if (!card && !bank) return "";
  return `<p style="margin:18px 0 10px;font-weight:600;">How would you like to pay?</p>${card}${bank}`;
}

/** The invoice PDF as an email attachment — best-effort, never blocks the send. */
async function invoiceAttachment(
  invoiceId: string | undefined,
): Promise<{ filename: string; content: Buffer }[] | undefined> {
  if (!invoiceId) return undefined;
  try {
    const { pdf, filename } = await renderInvoicePdf(invoiceId);
    return [{ filename, content: pdf }];
  } catch (e) {
    console.error("[billing-emails] invoice PDF render failed", e);
    return undefined;
  }
}

/** The boxed invoice summary shared by the request and reminder emails. */
function invoiceBoxHtml(args: {
  invoiceNumber: string;
  amountDue: string;
  vatNote: string | null;
  dueDate: Date;
}): string {
  const due = args.dueDate.toISOString().slice(0, 10);
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"
               style="margin:16px 0;width:100%;border:1px solid #e8e6e0;border-radius:8px;">
          <tr><td style="padding:14px 16px;font-size:14px;line-height:1.7;">
            Invoice <strong>${escapeHtml(args.invoiceNumber)}</strong><br>
            Amount due <strong>${escapeHtml(args.amountDue)}</strong><br>
            ${args.vatNote ? `${escapeHtml(args.vatNote)}<br>` : ""}
            Due by <strong>${due}</strong>
          </td></tr>
        </table>`;
}

export async function sendPaymentRequestEmail(args: {
  to: string;
  memberName: string;
  invoiceNumber: string;
  amountDue: string; // preformatted, e.g. "€3,000"
  vatNote: string | null;
  dueDate: Date;
  payUrl: string | null;
  /** Attach the rendered invoice PDF (best-effort). */
  invoiceId?: string;
  /** Renewal of an active membership (vs the initial application). */
  renewal?: boolean;
}): Promise<void> {
  const intro = args.renewal
    ? `<p style="margin:0 0 12px;">The annual Associate membership of
        <strong>${escapeHtml(args.memberName)}</strong> is up for renewal. Your
        membership and working-group access continue uninterrupted once the
        dues below are paid.</p>`
    : `<p style="margin:0 0 12px;">Thank you — the Membership Agreement for
        <strong>${escapeHtml(args.memberName)}</strong> is signed. Your Associate
        membership activates as soon as the annual dues are paid.</p>`;
  const attachments = await invoiceAttachment(args.invoiceId);
  await sendEmail({
    to: args.to,
    subject: args.renewal
      ? `Membership renewal — invoice ${args.invoiceNumber}`
      : `Membership dues — invoice ${args.invoiceNumber}`,
    html: emailLayout({
      heading: args.renewal
        ? "Renew your Associate membership"
        : "Complete your Associate membership",
      bodyHtml: `
        ${intro}
        ${invoiceBoxHtml(args)}
        ${payOptionsHtml(args.payUrl, args.invoiceNumber)}
        ${attachments ? `<p style="margin:18px 0 0;font-size:12px;color:#5b5b5b;">Your invoice is attached as a PDF.</p>` : ""}`,
    }),
    attachments,
  });
}

export async function sendPaymentReminderEmail(args: {
  to: string;
  memberName: string;
  invoiceNumber: string;
  amountDue: string;
  vatNote: string | null;
  dueDate: Date;
  payUrl: string | null;
  /** Which reminder this is, in days since the invoice was issued (7/14/21/28). */
  reminderDay: number;
  /** Day (since issue) the invoice is voided and the membership expires. */
  expireDay: number;
  /** Attach the rendered invoice PDF (best-effort). */
  invoiceId?: string;
  renewal?: boolean;
}): Promise<void> {
  const daysLeft = args.expireDay - args.reminderDay;
  const consequence = args.renewal
    ? "your membership and working-group access will expire"
    : "your application will expire and the invoice will be cancelled";
  const attachments = await invoiceAttachment(args.invoiceId);
  await sendEmail({
    to: args.to,
    subject: `Reminder — membership dues, invoice ${args.invoiceNumber}`,
    html: emailLayout({
      heading: "Your membership dues are still unpaid",
      bodyHtml: `
        <p style="margin:0 0 12px;">A friendly reminder that the Associate dues
        for <strong>${escapeHtml(args.memberName)}</strong> are still
        outstanding. If we don't receive payment within
        <strong>${daysLeft} days</strong>, ${consequence} — you can of course
        rejoin later.</p>
        ${invoiceBoxHtml(args)}
        ${payOptionsHtml(args.payUrl, args.invoiceNumber)}
        ${attachments ? `<p style="margin:18px 0 0;font-size:12px;color:#5b5b5b;">Your invoice is attached as a PDF.</p>` : ""}`,
    }),
    attachments,
  });
}

export async function sendMembershipExpiredEmail(args: {
  to: string;
  memberName: string;
  invoiceNumber: string;
  renewal?: boolean;
}): Promise<void> {
  await sendEmail({
    to: args.to,
    subject: args.renewal
      ? "Your Associate membership has expired"
      : "Your Associate application has expired",
    html: emailLayout({
      heading: args.renewal ? "Membership expired" : "Application expired",
      bodyHtml: `
        <p style="margin:0 0 12px;">The dues for
        <strong>${escapeHtml(args.memberName)}</strong> (invoice
        ${escapeHtml(args.invoiceNumber)}) were not received in time, so the
        invoice has been cancelled and the ${args.renewal ? "membership has" : "application has"}
        expired.</p>
        <p style="margin:0;">You're welcome back any time — reply to this email
        or contact us and we'll issue a fresh invoice; the new membership year
        starts on the day of payment.</p>`,
      button: { label: "Go to your account", href: `${SITE_URL}/account` },
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
