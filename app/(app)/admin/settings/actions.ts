"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { activateVersion } from "@/app/lib/agreement-versions";

export type SettingsState = { error?: string; ok?: boolean };

/** Make the chosen legal/ version file the active Membership Agreement. */
export async function activateAgreementVersion(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) return { error: "Forbidden" };

  const filename = String(formData.get("filename") ?? "").trim();
  if (!filename) return { error: "Choose a version." };

  const res = await activateVersion(filename);
  if (!res.ok) return { error: res.error };

  await db.adminAction.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email!,
      action: "agreement.activate",
      targetType: "AgreementDocument",
      after: { filename },
    },
  });

  revalidatePath("/admin/settings");
  return { ok: true };
}
