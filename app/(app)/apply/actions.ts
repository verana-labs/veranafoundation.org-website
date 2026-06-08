"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser } from "@/app/lib/authz";
import { getActiveAgreement } from "@/app/lib/agreement";

const schema = z
  .object({
    type: z.enum(["individual", "organization"]),
    legalName: z.string().trim().min(1, "Required"),
    entityType: z.string().trim().optional(),
    jurisdiction: z.string().trim().optional(),
    registeredAddress: z.string().trim().optional(),
    countryOfResidence: z.string().trim().optional(),
    signerName: z.string().trim().min(1, "Required"),
    signerTitle: z.string().trim().optional(),
    socialAnnouncementConsent: z.boolean(),
    accept: z.literal(true),
  })
  .refine((d) => d.type !== "individual" || !!d.countryOfResidence, {
    message: "Country of residence is required",
    path: ["countryOfResidence"],
  });

export type ApplyState = { error?: string };

/**
 * Create a free Contributor membership for the signed-in user. The signer is
 * the first `manager`. Associate (paid) membership is Phase 3.
 */
export async function applyContributor(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const user = await currentUser();
  if (!user?.email || !user.id) redirect("/login?callbackUrl=/apply");

  const parsed = schema.safeParse({
    type: formData.get("type"),
    legalName: formData.get("legalName"),
    entityType: formData.get("entityType") || undefined,
    jurisdiction: formData.get("jurisdiction") || undefined,
    registeredAddress: formData.get("registeredAddress") || undefined,
    countryOfResidence: formData.get("countryOfResidence") || undefined,
    signerName: formData.get("signerName"),
    signerTitle: formData.get("signerTitle") || undefined,
    socialAnnouncementConsent: formData.get("socialAnnouncementConsent") === "on",
    accept: formData.get("accept") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  const agreement = await getActiveAgreement();
  if (!agreement) return { error: "No active Membership Agreement is configured." };

  const isOrg = data.type === "organization";

  await db.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        type: data.type,
        legalName: data.legalName,
        entityType: isOrg ? data.entityType ?? null : null,
        jurisdiction: isOrg ? data.jurisdiction ?? null : null,
        registeredAddress: isOrg ? data.registeredAddress ?? null : null,
        countryOfResidence: isOrg ? null : data.countryOfResidence ?? null,
        primaryEmail: user.email!,
        socialAnnouncementConsent: data.socialAnnouncementConsent,
        memberships: {
          create: {
            class: "contributor",
            status: "active",
            provisional: true, // Foundation in formation (Agreement §2.4(c))
            periodStart: new Date(),
          },
        },
        signatureRecords: {
          create: {
            signerName: data.signerName,
            signerTitle: data.signerTitle ?? null,
            emailVerified: true,
            agreementVersion: agreement.version,
            agreementUrl: agreement.url,
            agreementHash: agreement.hash,
          },
        },
        access: {
          create: {
            email: user.email!,
            role: "manager",
            status: "active",
            addedByUserId: user.id,
          },
        },
      },
    });
    await tx.userMember.create({
      data: { userId: user.id!, memberId: member.id, role: "manager" },
    });
  });

  // TODO(phase-2): emit entitlement.changed event.
  // TODO(phase-4): email the executed agreement PDF.
  redirect("/account");
}
