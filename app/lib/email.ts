import nodemailer from "nodemailer";

type Attachment = { filename: string; content: Buffer };

/**
 * Best-effort transactional email over SMTP (EMAIL_SERVER connection string,
 * e.g. a Gmail/Workspace account). No-ops (logs) when EMAIL_SERVER is absent,
 * so flows that send mail don't fail in environments without it.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
}): Promise<void> {
  const server = process.env.EMAIL_SERVER;
  if (!server) {
    console.warn(`[email] EMAIL_SERVER not set — skipping email to ${opts.to}`);
    return;
  }
  const transporter = nodemailer.createTransport(server);
  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? "no-reply@veranafoundation.org",
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments,
  });
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
