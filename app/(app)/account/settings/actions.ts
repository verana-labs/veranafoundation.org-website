"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser } from "@/app/lib/authz";

export type SettingsState = { error?: string; ok?: boolean };

const schema = z.object({
  // Empty clears the override (falls back to the provider-supplied name).
  displayName: z.string().trim().max(80, "Keep it under 80 characters."),
});

export async function updateDisplayName(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await currentUser();
  if (!user?.id) return { error: "Not signed in." };
  const parsed = schema.safeParse({ displayName: formData.get("displayName") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  await db.user.update({
    where: { id: user.id },
    data: { displayName: parsed.data.displayName || null },
  });
  revalidatePath("/account/settings");
  return { ok: true };
}
