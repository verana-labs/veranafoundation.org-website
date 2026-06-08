"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";

const schema = z.object({
  version: z.string().trim().min(1),
  url: z.string().trim().url(),
  hash: z.string().trim().optional(),
});

export type SettingsState = { error?: string; ok?: boolean };

export async function setAgreement(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) return { error: "Forbidden" };

  const parsed = schema.safeParse({
    version: formData.get("version"),
    url: formData.get("url"),
    hash: formData.get("hash") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  await db.$transaction([
    db.agreementDocument.updateMany({
      where: { active: true },
      data: { active: false },
    }),
    db.agreementDocument.create({
      data: {
        version: data.version,
        url: data.url,
        hash: data.hash ?? null,
        active: true,
      },
    }),
    db.adminAction.create({
      data: {
        actorUserId: user.id,
        actorEmail: user.email!,
        action: "agreement.update",
        targetType: "AgreementDocument",
        after: data,
      },
    }),
  ]);

  revalidatePath("/admin/settings");
  return { ok: true };
}
