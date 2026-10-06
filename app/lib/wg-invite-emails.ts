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

/** A member asked to join a private group: tell a lead (one email per lead). */
export async function sendJoinRequestEmail(args: {
  to: string;
  wgName: string;
  wgSlug: string;
  requesterName: string;
  requesterEmail: string;
  message: string | null;
}): Promise<void> {
  await sendEmail({
    to: args.to,
    subject: `${args.requesterName} asks to join the ${args.wgName} working group`,
    html: emailLayout({
      heading: `Join request for ${escapeHtml(args.wgName)}`,
      bodyHtml: `
        <p style="margin:0 0 12px;"><strong>${escapeHtml(args.requesterName)}</strong>
        (${escapeHtml(args.requesterEmail)}) asks to join the private
        <strong>${escapeHtml(args.wgName)}</strong> working group.</p>
        ${
          args.message
            ? `<p style="margin:0 0 12px;padding:10px 14px;border-left:3px solid #e8e6e0;color:#5b5b5b;">${escapeHtml(args.message)}</p>`
            : ""
        }
        <p style="margin:0;">Approve or decline the request from the lead console
        on the group page. Approved members are invited to the meetings and see
        the group's sessions, minutes and transcripts.</p>`,
      button: {
        label: "Review the request",
        href: `${SITE_URL}/working-groups/${args.wgSlug}#lead-console`,
      },
    }),
  });
}

/** The lead declined: tell the requester, without a reason by design. */
export async function sendJoinDeclinedEmail(args: {
  to: string;
  wgName: string;
  wgSlug: string;
}): Promise<void> {
  await sendEmail({
    to: args.to,
    subject: `Your request to join the ${args.wgName} working group`,
    html: emailLayout({
      heading: `Request to join ${escapeHtml(args.wgName)}`,
      bodyHtml: `
        <p style="margin:0 0 12px;">A lead of the <strong>${escapeHtml(args.wgName)}</strong>
        working group has reviewed your request and did not approve it at this
        time.</p>
        <p style="margin:0;">You can get in touch with the group's leads from
        its page if you would like to discuss it.</p>`,
      button: {
        label: "Open the working group",
        href: `${SITE_URL}/working-groups/${args.wgSlug}`,
      },
    }),
  });
}
