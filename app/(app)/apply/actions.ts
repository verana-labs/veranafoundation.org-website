"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser } from "@/app/lib/authz";
import { tierAmount, formatEur } from "@/app/lib/dues";
import { createMembershipInvoice } from "@/app/lib/invoices";
import { sendPaymentRequestEmail } from "@/app/lib/billing-emails";
import { sendExecutedAgreementEmail } from "@/app/lib/executed-agreement";
import { toAgreementContext } from "@/app/lib/agreement-context";
import { renderAgreementHtml } from "@/app/lib/agreement-html";
import { persistSignedAgreement } from "@/app/lib/signed-agreement";
import { loadActiveAgreement, type ActiveAgreement } from "@/app/lib/agreement-versions";
import { sendEmail, escapeHtml } from "@/app/lib/email";
import { emailLayout } from "@/app/lib/email-layout";

const SITE_URL = process.env.AUTH_URL ?? "https://veranafoundation.org";

/** Shown on the apply wizard's payment step after an Associate signs. */
export type AssociateSuccess = {
  memberName: string;
  invoiceNumber: string;
  amountDue: string; // preformatted, e.g. "€3,000"
  vatNote: string | null;
  dueDate: string; // YYYY-MM-DD
  payUrl: string | null; // null when Stripe isn't configured (bank transfer only)
};

export type ApplyState = { error?: string; success?: AssociateSuccess };

/** Best-effort: never block a successful signup on email delivery. */
async function emailExecutedCopy(d: Parameters<typeof sendExecutedAgreementEmail>[0]) {
  try {
    await sendExecutedAgreementEmail(d);
  } catch (e) {
    console.error("[apply] executed-agreement email failed", e);
  }
}

/** Alert the admin allowlist that the active agreement file failed its hash check. */
async function notifyAdminsIntegrityFailure(active: ActiveAgreement) {
  try {
    const admins = await db.adminAllowlistEntry.findMany({ select: { email: true } });
    const to = admins.map((a) => a.email).join(",");
    if (!to) return;
    await sendEmail({
      to,
      subject: "⚠ Membership Agreement integrity check failed — signing blocked",
      html: emailLayout({
        heading: "Agreement integrity check failed",
        bodyHtml: `
        <p style="margin:0 0 12px;">The active Membership Agreement file no longer
        matches the hash it was published with, so new signatures are blocked
        until it is resolved.</p>
        <ul style="margin:0 0 12px;padding-left:18px;">
          <li>Version: ${escapeHtml(active.version)}</li>
          <li>File: ${escapeHtml(active.filename)}</li>
          <li>Expected: ${escapeHtml(active.pinnedHash)}</li>
          <li>Found: ${escapeHtml(active.currentHash ?? "(file missing)")}</li>
        </ul>
        <p style="margin:0;">Restore the original file, or publish a new version
        in Settings.</p>`,
        button: { label: "Open Settings", href: `${SITE_URL}/admin/settings` },
      }),
    });
  } catch (e) {
    console.error("[apply] admin integrity alert failed", e);
  }
}

/**
 * Render the personalised agreement to HTML for the wizard's review step, from
 * the data entered so far + the active version. Blocks if the active file failed
 * its integrity check (the signing step would block anyway).
 */
export async function previewAgreement(input: {
  class?: string;
  type?: string;
  legalName?: string;
  entityType?: string;
  jurisdiction?: string;
  registeredAddress?: string;
  countryOfResidence?: string;
  country?: string;
  signerName?: string;
  signerTitle?: string;
}): Promise<{ html?: string; error?: string }> {
  const active = await loadActiveAgreement();
  if (!active) return { error: "No active Membership Agreement is configured." };
  if (!active.intact) {
    return { error: "The Membership Agreement is temporarily unavailable. Please try again later." };
  }
  const user = await currentUser();
  const ctx = toAgreementContext({
    class: input.class === "associate" ? "associate" : "contributor",
    type: input.type === "organization" ? "organization" : "individual",
    legalName: input.legalName,
    entityType: input.entityType,
    jurisdiction: input.jurisdiction,
    registeredAddress: input.registeredAddress,
    countryOfResidence: input.countryOfResidence,
    country: input.country,
    signerName: input.signerName,
    signerTitle: input.signerTitle,
    email: user?.email,
    effectiveDate: new Date(),
  });
  try {
    return { html: renderAgreementHtml(ctx, active.content) };
  } catch (e) {
    console.error("[apply] preview render failed", e);
    return { error: "Could not render the agreement preview." };
  }
}

const base = {
  legalName: z.string().trim().min(1, "Required"),
  signerName: z.string().trim().min(1, "Required"),
  signerTitle: z.string().trim().optional(),
  socialAnnouncementConsent: z.boolean(),
  accept: z.literal(true),
};

const contributorSchema = z
  .object({
    ...base,
    type: z.enum(["individual", "organization"]),
    entityType: z.string().trim().optional(),
    jurisdiction: z.string().trim().optional(),
    registeredAddress: z.string().trim().optional(),
    countryOfResidence: z.string().trim().optional(),
  })
  .refine((d) => d.type !== "individual" || !!d.countryOfResidence, {
    message: "Country of residence is required",
  });

const associateSchema = z.object({
  ...base,
  country: z.string().trim().length(2, "Use a 2-letter country code"),
  registeredAddress: z.string().trim().optional(),
  vatNumber: z.string().trim().optional(),
  tier: z.string().trim().min(1, "Choose a tier"),
});

export async function applyMember(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const user = await currentUser();
  if (!user?.email || !user.id) redirect("/login?callbackUrl=/apply");

  const active = await loadActiveAgreement();
  if (!active) return { error: "No active Membership Agreement is configured." };
  if (!active.intact) {
    await notifyAdminsIntegrityFailure(active);
    return { error: "The Membership Agreement is temporarily unavailable. Please try again later." };
  }

  const signedAt = new Date();
  const sig = {
    signerName: formData.get("signerName"),
    signerTitle: formData.get("signerTitle") || undefined,
    socialAnnouncementConsent: formData.get("socialAnnouncementConsent") === "on",
    accept: formData.get("accept") === "on",
  };
  const signatureBase = {
    agreementVersion: active.version,
    agreementUrl: active.filename, // the version file that was signed
    emailVerified: true,
  };

  const cls = formData.get("class");

  // ── Contributor (free) ────────────────────────────────────────────────────
  if (cls === "contributor") {
    const parsed = contributorSchema.safeParse({
      ...sig,
      legalName: formData.get("legalName"),
      type: formData.get("type"),
      entityType: formData.get("entityType") || undefined,
      jurisdiction: formData.get("jurisdiction") || undefined,
      registeredAddress: formData.get("registeredAddress") || undefined,
      countryOfResidence: formData.get("countryOfResidence") || undefined,
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
    }
    const d = parsed.data;
    const isOrg = d.type === "organization";
    // A user may hold at most one individual membership.
    if (d.type === "individual") {
      const existingIndividual = await db.userMember.findFirst({
        where: { userId: user.id, member: { type: "individual" } },
        select: { id: true },
      });
      if (existingIndividual) {
        return { error: "You already have an individual membership." };
      }
    }
    const { memberId, signatureRecordId } = await db.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: {
          type: d.type,
          legalName: d.legalName,
          entityType: isOrg ? d.entityType ?? null : null,
          jurisdiction: isOrg ? d.jurisdiction ?? null : null,
          registeredAddress: isOrg ? d.registeredAddress ?? null : null,
          countryOfResidence: isOrg ? null : d.countryOfResidence ?? null,
          primaryEmail: user.email!,
          socialAnnouncementConsent: d.socialAnnouncementConsent,
          membership: {
            create: {
              class: "contributor",
              status: "active",
              periodStart: signedAt,
            },
          },
          signatureRecords: {
            create: { ...signatureBase, signerName: d.signerName, signerTitle: d.signerTitle ?? null },
          },
          access: {
            create: { email: user.email!, role: "manager", status: "active", addedByUserId: user.id },
          },
        },
        include: { signatureRecords: true },
      });
      await tx.userMember.create({ data: { userId: user.id!, memberId: member.id, role: "manager" } });
      return { memberId: member.id, signatureRecordId: member.signatureRecords[0].id };
    });

    const ctx = toAgreementContext({
      class: "contributor",
      type: d.type,
      legalName: d.legalName,
      entityType: d.entityType,
      jurisdiction: d.jurisdiction,
      registeredAddress: d.registeredAddress,
      countryOfResidence: d.countryOfResidence,
      signerName: d.signerName,
      signerTitle: d.signerTitle,
      email: user.email,
      effectiveDate: signedAt,
    });
    let pdf: Buffer | undefined;
    let documentHash: string | undefined;
    try {
      ({ pdf, hash: documentHash } = await persistSignedAgreement({
        memberId,
        signatureRecordId,
        ctx,
        template: active.content,
      }));
    } catch (e) {
      console.error("[apply] persist signed agreement failed", e);
    }
    await emailExecutedCopy({
      to: user.email!,
      memberName: d.legalName,
      membershipClass: "Contributor",
      signerName: d.signerName,
      signedAt,
      agreementVersion: active.version,
      agreementSource: active.filename,
      versionHash: active.pinnedHash,
      documentHash: documentHash ?? null,
      agreementPdf: pdf,
    });
    redirect("/account");
  }

  // ── Associate (paid; organizations) ─────────────────────────────────────────
  if (cls === "associate") {
    const parsed = associateSchema.safeParse({
      ...sig,
      legalName: formData.get("legalName"),
      country: formData.get("country"),
      registeredAddress: formData.get("registeredAddress") || undefined,
      vatNumber: formData.get("vatNumber") || undefined,
      tier: formData.get("tier"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
    }
    const d = parsed.data;
    const net = tierAmount(d.tier);
    if (net == null) return { error: "Choose a valid dues tier." };

    const created = await db.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: {
          type: "organization",
          legalName: d.legalName,
          jurisdiction: d.country.toUpperCase(),
          registeredAddress: d.registeredAddress ?? null,
          vatNumber: d.vatNumber ?? null,
          primaryEmail: user.email!,
          socialAnnouncementConsent: d.socialAnnouncementConsent,
          membership: {
            create: { class: "associate", tier: d.tier, status: "pending" },
          },
          signatureRecords: {
            create: { ...signatureBase, signerName: d.signerName, signerTitle: d.signerTitle ?? null },
          },
          access: {
            create: { email: user.email!, role: "manager", status: "active", addedByUserId: user.id },
          },
        },
        include: { membership: true, signatureRecords: true },
      });
      await tx.userMember.create({ data: { userId: user.id!, memberId: member.id, role: "manager" } });
      return {
        memberId: member.id,
        membershipId: member.membership!.id,
        signatureRecordId: member.signatureRecords[0].id,
      };
    });

    const ctx = toAgreementContext({
      class: "associate",
      legalName: d.legalName,
      country: d.country,
      registeredAddress: d.registeredAddress,
      signerName: d.signerName,
      signerTitle: d.signerTitle,
      email: user.email,
      effectiveDate: signedAt,
    });
    let pdf: Buffer | undefined;
    let documentHash: string | undefined;
    try {
      ({ pdf, hash: documentHash } = await persistSignedAgreement({
        memberId: created.memberId,
        signatureRecordId: created.signatureRecordId,
        ctx,
        template: active.content,
      }));
    } catch (e) {
      console.error("[apply] persist signed agreement failed", e);
    }
    await emailExecutedCopy({
      to: user.email!,
      memberName: d.legalName,
      membershipClass: "Associate",
      signerName: d.signerName,
      signedAt,
      agreementVersion: active.version,
      agreementSource: active.filename,
      versionHash: active.pinnedHash,
      documentHash: documentHash ?? null,
      agreementPdf: pdf,
    });

    const inv = await createMembershipInvoice({
      membershipId: created.membershipId,
      net,
      country: d.country,
      hasVatNumber: !!d.vatNumber,
    });

    const vatNote =
      inv.vat.treatment === "reverse_charge"
        ? "VAT reverse-charged (Art. 196 EU VAT Directive)"
        : inv.vat.vatAmount > 0
          ? `Includes ${formatEur(inv.vat.vatAmount)} VAT`
          : null;

    // Separate from the executed-agreement email: this one requests payment.
    try {
      await sendPaymentRequestEmail({
        to: user.email!,
        memberName: d.legalName,
        invoiceNumber: inv.number,
        amountDue: formatEur(inv.grossAmount),
        vatNote,
        dueDate: inv.dueDate,
        payUrl: inv.payUrl,
      });
    } catch (e) {
      console.error("[apply] payment-request email failed", e);
    }

    return {
      success: {
        memberName: d.legalName,
        invoiceNumber: inv.number,
        amountDue: formatEur(inv.grossAmount),
        vatNote,
        dueDate: inv.dueDate.toISOString().slice(0, 10),
        payUrl: inv.payUrl,
      },
    };
  }

  return { error: "Invalid membership class." };
}
