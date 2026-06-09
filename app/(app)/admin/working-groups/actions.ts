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

/** Re-render the admin list and the ISR home board after any change. */
function revalidate() {
  revalidatePath("/admin/working-groups");
  revalidatePath("/"); // home page board (showOnHome) is ISR
}

// Create takes the access level (requiredClass); Edit does not change it.
const createSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  requiredClass: z.enum(["any", "associate"]),
  link: z.string().trim().url(),
  showOnHome: z.boolean(),
  state: z.enum(["enabled", "disabled"]).default("enabled"),
  priority: z.coerce.number().int().default(0),
});

const editSchema = createSchema.omit({ requiredClass: true });

export async function createWg(
  _prev: WgState,
  formData: FormData,
): Promise<WgState> {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) return { error: "Forbidden" };
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    requiredClass: formData.get("requiredClass"),
    link: formData.get("link"),
    showOnHome: formData.get("showOnHome") === "on",
    state: formData.get("state") ?? "enabled",
    priority: formData.get("priority") ?? 0,
  });
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
  revalidate();
  return { ok: true };
}

/** Edit a WG's content (not its access level). Throws on invalid input. */
export async function updateWg(formData: FormData) {
  const user = await assertAdmin();
  const id = String(formData.get("id"));
  const parsed = editSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    link: formData.get("link"),
    showOnHome: formData.get("showOnHome") === "on",
    state: formData.get("state") ?? "enabled",
    priority: formData.get("priority") ?? 0,
  });
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
  revalidate();
}

export async function toggleShowOnHome(id: string) {
  const user = await assertAdmin();
  const wg = await db.workingGroup.findUniqueOrThrow({ where: { id } });
  await db.workingGroup.update({ where: { id }, data: { showOnHome: !wg.showOnHome } });
  await db.adminAction.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email!,
      action: "wg.showOnHome",
      targetType: "WorkingGroup",
      targetId: id,
      after: { showOnHome: !wg.showOnHome },
    },
  });
  revalidate();
}

export async function toggleState(id: string) {
  const user = await assertAdmin();
  const wg = await db.workingGroup.findUniqueOrThrow({ where: { id } });
  const state = wg.state === "enabled" ? "disabled" : "enabled";
  await db.workingGroup.update({ where: { id }, data: { state } });
  await db.adminAction.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email!,
      action: "wg.state",
      targetType: "WorkingGroup",
      targetId: id,
      after: { state },
    },
  });
  revalidate();
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
  revalidate();
}
