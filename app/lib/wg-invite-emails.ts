import { sendEmail, escapeHtml } from "@/app/lib/email";
import { emailLayout } from "@/app/lib/email-layout";

/**
 * Notifications for working-group email invites (companion to
 * access-emails.ts). Best-effort by design: invite mutations must never fail
 * because SMTP did, so callers fire-and-forget via `notify`.
 */

const SITE_URL = process.env.AUTH_URL ?? "https://veranafoundation.org";

export function wgRoleLabel(role: "lead" | "participant"): string {
  return role === "lead" ? "a lead" : "a participant";
}

/** The membership line of the invite email, by the group's access rule. */
export function wgInviteMembershipHtml(
  requiredClass: "any" | "associate",
): string {
  return requiredClass === "associate"
    ? `<p style="margin:0 0 12px;">This group is open to <strong>Associate
       members</strong> of the Verana Foundation. If your organization isn't a
       member yet, apply for an Associate membership (dues by organization
       size) to take part.</p>`
    : `<p style="margin:0 0 12px;">Taking part requires a Verana Foundation
       membership: join as a <strong>Contributor</strong> (free — for
       organizations and individuals doing technical and standards work) or as
       an <strong>Associate</strong> (dues by organization size).</p>`;
}

/** Invitation to a WG for someone without an active qualifying membership. */
export async function sendWgInviteEmail(args: {
  to: string;
  wgName: string;
  role: "lead" | "participant";
  requiredClass: "any" | "associate";
  invitedByName: string;
}): Promise<void> {
  const wg = `<strong>${escapeHtml(args.wgName)}</strong>`;
  await sendEmail({
    to: args.to,
    subject: `You're invited to the ${args.wgName} working group — Verana Foundation`,
    html: emailLayout({
      heading: `You're invited to the ${escapeHtml(args.wgName)} working group`,
      bodyHtml: `
        <p style="margin:0 0 12px;">${escapeHtml(args.invitedByName)} invited
        <strong>${escapeHtml(args.to)}</strong> to join the ${wg} working group
        as ${wgRoleLabel(args.role)} on the Verana Foundation site.</p>
        ${wgInviteMembershipHtml(args.requiredClass)}
        <p style="margin:0 0 12px;">Sign in with this email address (Google,
        GitHub, or a one-time code — no password needed) and complete the
        membership application. As soon as your membership is active you are
        added to the group automatically and its meeting invitations land in
        your calendar.</p>
        <p style="margin:0;">If you weren't expecting this, you can ignore this
        email.</p>`,
      button: { label: "Join the Foundation", href: `${SITE_URL}/join` },
    }),
  });
}

/** Confirmation when someone actually enters the group — either a direct add
 * of a qualifying user, or a pending invite converting on activation. */
export async function sendWgJoinedEmail(args: {
  to: string;
  wgName: string;
  wgSlug: string;
  role: "lead" | "participant";
}): Promise<void> {
  await sendEmail({
    to: args.to,
    subject: `You've joined the ${args.wgName} working group`,
    html: emailLayout({
      heading: `You've joined the ${escapeHtml(args.wgName)} working group`,
      bodyHtml: `
        <p style="margin:0;">You are now ${wgRoleLabel(args.role)} of the
        <strong>${escapeHtml(args.wgName)}</strong> working group on the Verana
        Foundation site, and the group's meeting invitations will arrive in
        your calendar.</p>`,
      button: {
        label: "Open the working group",
        href: `${SITE_URL}/working-groups/${args.wgSlug}`,
      },
    }),
  });
}
