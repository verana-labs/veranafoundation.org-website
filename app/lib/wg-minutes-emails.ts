import { sendEmail, escapeHtml } from "@/app/lib/email";
import { emailLayout } from "@/app/lib/email-layout";

/**
 * Lead notifications for the transcript pipeline (ADR-0004 §2 Notify): the
 * AI draft inline plus a Review button to the session page (sign-in required,
 * like every CTA on the site). Best-effort like every other email.
 */

const SITE_URL = process.env.AUTH_URL ?? "https://veranafoundation.org";

/**
 * Minimal Markdown → email HTML for the drafted minutes: headings, bullet and
 * checkbox lists, bold, paragraphs. Everything is HTML-escaped first; the
 * result is meant for the branded email shell, not for the website.
 */
export function markdownToEmailHtml(md: string): string {
  const inline = (s: string) =>
    escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => {
    if (list.length) out.push(`<ul style="margin:0 0 12px;padding-left:20px;">${list.join("")}</ul>`);
    list = [];
  };
  const flushPara = () => {
    if (para.length) out.push(`<p style="margin:0 0 12px;">${para.join(" ")}</p>`);
    para = [];
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = /^\s*[-*]\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(line);
    if (heading) {
      flushList(); flushPara();
      const size = heading[1].length === 1 ? 18 : 15;
      out.push(`<h3 style="margin:18px 0 8px;font-size:${size}px;line-height:1.3;">${inline(heading[2])}</h3>`);
    } else if (item) {
      flushPara();
      const box = item[1] === undefined ? "" : item[1] === " " ? "&#9744; " : "&#9745; ";
      list.push(`<li style="margin:0 0 4px;">${box}${inline(item[2])}</li>`);
    } else if (line.trim() === "") {
      flushList(); flushPara();
    } else {
      flushList();
      para.push(inline(line.trim()));
    }
  }
  flushList(); flushPara();
  return out.join("\n");
}

export async function sendMinutesReviewEmail(args: {
  to: string;
  wgName: string;
  wgSlug: string;
  sessionId: string;
  meetingLabel: string; // e.g. "Wednesday 7 October 2026, 17:00 (Europe/Paris)"
  attendees: string[];
  summaryMd: string | null; // null when the AI step is not configured
  openQuestions: string[];
  reminder: boolean;
}): Promise<void> {
  const wg = escapeHtml(args.wgName);
  const reviewUrl = `${SITE_URL}/working-groups/${args.wgSlug}/sessions/${args.sessionId}`;
  const heading = args.reminder
    ? `Reminder: minutes of the ${wg} meeting await your review`
    : args.summaryMd
      ? `Draft minutes of the ${wg} meeting are ready for review`
      : `The transcript of the ${wg} meeting is ready`;
  const intro = args.summaryMd
    ? `<p style="margin:0 0 12px;">The meeting of <strong>${escapeHtml(args.meetingLabel)}</strong>
       was transcribed and an AI assistant drafted the minutes below. Nothing is
       published yet: as a lead, please review and edit the draft, confirm the
       attendance, then publish it from the session page.</p>`
    : `<p style="margin:0 0 12px;">The meeting of <strong>${escapeHtml(args.meetingLabel)}</strong>
       was transcribed. Automatic drafting is not available on this server, so
       the minutes need to be written from the transcript on the session page.</p>`;
  const attendees = args.attendees.length
    ? `<p style="margin:0 0 12px;"><strong>Attendance recorded:</strong> ${escapeHtml(args.attendees.join(", "))}</p>`
    : `<p style="margin:0 0 12px;"><strong>Attendance:</strong> nobody was ticked during the meeting; the session page shows who Google Meet saw.</p>`;
  const questions = args.openQuestions.length
    ? `<p style="margin:12px 0 4px;"><strong>Open questions from the assistant:</strong></p>
       <ul style="margin:0 0 12px;padding-left:20px;">${args.openQuestions
         .map((q) => `<li style="margin:0 0 4px;">${escapeHtml(q)}</li>`)
         .join("")}</ul>`
    : "";
  const draft = args.summaryMd
    ? `<div style="margin:16px 0;padding:14px 16px;border:1px solid #e8e6e0;border-radius:8px;background:#fafafb;">
         ${markdownToEmailHtml(args.summaryMd)}
       </div>`
    : "";

  await sendEmail({
    to: args.to,
    subject: `${args.reminder ? "Reminder: " : ""}${args.wgName} — minutes to review (${args.meetingLabel})`,
    html: emailLayout({
      heading,
      bodyHtml: `${intro}${attendees}${questions}${draft}
        <p style="margin:0;">The transcript stays internal to the group unless
        you choose to publish it alongside the minutes.</p>`,
      button: { label: "Review the minutes", href: reviewUrl },
    }),
  });
}
