import { sendEmail, escapeHtml } from "@/app/lib/email";
import { emailLayout } from "@/app/lib/email-layout";

/**
 * Notifications for an organization's access list (ADR-0002 §"How access
 * works", the optional "you've been added" email). Best-effort by design:
 * access changes must never fail because SMTP did, so callers fire-and-forget
 * via `notify*` which logs instead of throwing.
 */

const SITE_URL = process.env.AUTH_URL ?? "https://veranafoundation.org";

function roleLabel(role: "manager" | "representative"): string {
  return role === "manager" ? "administrator" : "representative";
}

export async function sendAddedToOrgEmail(args: {
  to: string;
  orgName: string;
  role: "manager" | "representative";
  hasAccount: boolean; // already linked vs. needs to sign in once
}): Promise<void> {
  const org = `<strong>${escapeHtml(args.orgName)}</strong>`;
  const access = args.hasAccount
    ? `<p style="margin:0 0 12px;">Your account is linked already — ${org} is
       available in your account page right now.</p>`
    : `<p style="margin:0 0 12px;">Sign in once with this email address —
       Google, GitHub, or a one-time code, no password needed — and access is
       granted automatically.</p>`;
  await sendEmail({
    to: args.to,
    subject: `You've been added to ${args.orgName} on veranafoundation.org`,
    html: emailLayout({
      heading: `You've been added to ${escapeHtml(args.orgName)}`,
      bodyHtml: `
        <p style="margin:0 0 12px;">${org} has added <strong>${escapeHtml(args.to)}</strong>
        as ${args.role === "manager" ? "an" : "a"} <strong>${roleLabel(args.role)}</strong>
        on the Verana Foundation site. As ${args.role === "manager" ? "an administrator you can manage the organization's profile, billing and access list, and" : "a representative you"} can join the working groups the membership grants.</p>
        ${access}
        <p style="margin:0;">If you weren't expecting this, you can ignore this
        email or contact the organization's administrator.</p>`,
      // /account is the destination either way for an existing account: when
      // already signed in it opens directly; otherwise middleware bounces
      // through /login first. Only true newcomers get sent to /login itself.
      button: args.hasAccount
        ? { label: "Open your account", href: `${SITE_URL}/account` }
        : { label: "Sign in", href: `${SITE_URL}/login` },
    }),
  });
}

export async function sendPromotedToAdminEmail(args: {
  to: string;
  orgName: string;
}): Promise<void> {
  await sendEmail({
    to: args.to,
    subject: `You're now an administrator of ${args.orgName}`,
    html: emailLayout({
      heading: `You're now an administrator of ${escapeHtml(args.orgName)}`,
      bodyHtml: `
        <p style="margin:0;">An administrator of
        <strong>${escapeHtml(args.orgName)}</strong> gave you the administrator
        role: you can now manage the organization's profile, billing and
        invoices, and its access list (administrators and representatives).</p>`,
      button: { label: "Open your account", href: `${SITE_URL}/account` },
    }),
  });
}

/** Fire-and-forget wrapper: never let a notification break the mutation. */
export function notify(p: Promise<void>): void {
  p.catch((e) => console.warn("[access-email] failed:", e));
}
