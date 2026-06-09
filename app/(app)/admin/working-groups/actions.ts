"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";

export type WgState = { error?: string; ok?: boolean };

async function assertAdmin() {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) throw new Error("Forbidden");
  return user;
}

const wgSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  requiredClass: z.enum(["any", "associate"]),
  link: z.string().trim().url(),
  showOnHome: z.boolean(),
});

function parse(formData: FormData) {
  return wgSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    requiredClass: formData.get("requiredClass"),
    link: formData.get("link"),
    showOnHome: formData.get("showOnHome") === "on",
  });
}

export async function createWg(
  _prev: WgState,
  formData: FormData,
): Promise<WgState> {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) return { error: "Forbidden" };
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const wg = await db.workingGroup.create({
    data: { ...parsed.data, description: parsed.data.description ?? null },
  });
  await db.adminAction.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email!,
      action: "wg.create",
      targetType: "WorkingGroup",
      targetId: wg.id,
      after: parsed.data,
    },
  });
  revalidatePath("/admin/working-groups");
  revalidatePath("/"); // home page board (showOnHome) is ISR
  return { ok: true };
}

export async function updateWg(formData: FormData) {
  const user = await assertAdmin();
  const id = String(formData.get("id"));
  const parsed = parse(formData);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  await db.workingGroup.update({
    where: { id },
    data: { ...parsed.data, description: parsed.data.description ?? null },
  });
  await db.adminAction.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email!,
      action: "wg.update",
      targetType: "WorkingGroup",
      targetId: id,
      after: parsed.data,
    },
  });
  revalidatePath("/admin/working-groups");
  revalidatePath("/"); // home page board (showOnHome) is ISR
}

export async function deleteWg(formData: FormData) {
  const user = await assertAdmin();
  const id = String(formData.get("id"));
  await db.workingGroup.delete({ where: { id } });
  await db.adminAction.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email!,
      action: "wg.delete",
      targetType: "WorkingGroup",
      targetId: id,
    },
  });
  revalidatePath("/admin/working-groups");
  revalidatePath("/"); // home page board (showOnHome) is ISR
}
