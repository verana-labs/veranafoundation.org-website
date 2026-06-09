"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser } from "@/app/lib/authz";
import { getActiveAgreement } from "@/app/lib/agreement";
import { tierAmount } from "@/app/lib/dues";
import { createMembershipInvoice } from "@/app/lib/invoices";
import { sendExecutedAgreementEmail } from "@/app/lib/executed-agreement";
import { toAgreementContext } from "@/app/lib/agreement-context";
import { renderAgreementHtml } from "@/app/lib/agreement-html";
import { persistSignedAgreement } from "@/app/lib/signed-agreement";

export type ApplyState = { error?: string };

/** Best-effort: never block a successful signup on email delivery. */
async function emailExecutedCopy(d: Parameters<typeof sendExecutedAgreementEmail>[0]) {
  try {
    await sendExecutedAgreementEmail(d);
  } catch (e) {
    console.error("[apply] executed-agreement email failed", e);
  }
}

/**
 * Render the personalised agreement to HTML for the wizard's review step, from
 * the data entered so far. No persistence — the same mapping is used at signing,
 * so the preview matches the PDF that gets signed.
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
    return { html: await renderAgreementHtml(ctx) };
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
  payMethod: z.enum(["card", "bank_transfer"]),
});

export async function applyMember(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const user = await currentUser();
  if (!user?.email || !user.id) redirect("/login?callbackUrl=/apply");

  const agreement = await getActiveAgreement();
  if (!agreement) return { error: "No active Membership Agreement is configured." };

  const signedAt = new Date();
  const sig = {
    signerName: formData.get("signerName"),
    signerTitle: formData.get("signerTitle") || undefined,
    socialAnnouncementConsent: formData.get("socialAnnouncementConsent") === "on",
    accept: formData.get("accept") === "on",
  };
  const signatureBase = {
    agreementVersion: agreement.version,
    agreementUrl: agreement.url,
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
          memberships: {
            create: {
              class: "contributor",
              status: "active",
              provisional: true,
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
    try {
      ({ pdf } = await persistSignedAgreement({ memberId, signatureRecordId, ctx }));
    } catch (e) {
      console.error("[apply] persist signed agreement failed", e);
    }
    await emailExecutedCopy({
      to: user.email!,
      memberName: d.legalName,
      membershipClass: "Contributor",
      signerName: d.signerName,
      signedAt,
      agreementVersion: agreement.version,
      agreementUrl: agreement.url,
      agreementHash: agreement.hash,
      agreementPdf: pdf,
      agreement: pdf ? undefined : ctx,
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
      payMethod: formData.get("payMethod"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
    }
    const d = parsed.data;
    const net = tierAmount(d.tier);
    if (net == null) return { error: "Choose a valid dues tier." };
    if (d.payMethod === "card" && !process.env.STRIPE_SECRET_KEY) {
      return { error: "Card payments aren't available yet — choose bank transfer." };
    }

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
          memberships: {
            create: { class: "associate", tier: d.tier, status: "pending", provisional: true },
          },
          signatureRecords: {
            create: { ...signatureBase, signerName: d.signerName, signerTitle: d.signerTitle ?? null },
          },
          access: {
            create: { email: user.email!, role: "manager", status: "active", addedByUserId: user.id },
          },
        },
        include: { memberships: true, signatureRecords: true },
      });
      await tx.userMember.create({ data: { userId: user.id!, memberId: member.id, role: "manager" } });
      return {
        memberId: member.id,
        membershipId: member.memberships[0].id,
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
    try {
      ({ pdf } = await persistSignedAgreement({
        memberId: created.memberId,
        signatureRecordId: created.signatureRecordId,
        ctx,
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
      agreementVersion: agreement.version,
      agreementUrl: agreement.url,
      agreementHash: agreement.hash,
      agreementPdf: pdf,
      agreement: pdf ? undefined : ctx,
    });

    const { hostedPayUrl } = await createMembershipInvoice({
      membershipId: created.membershipId,
      member: { id: created.memberId, legalName: d.legalName, primaryEmail: user.email!, stripeCustomerId: null },
      net,
      country: d.country,
      hasVatNumber: !!d.vatNumber,
      payMethod: d.payMethod,
    });

    if (hostedPayUrl) redirect(hostedPayUrl);
    redirect("/account");
  }

  return { error: "Invalid membership class." };
}
