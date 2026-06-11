"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { slugify } from "@/app/lib/working-groups";
import { deleteScheduleEvent } from "@/app/lib/google-calendar";

/** A slug from the name, suffixed on collision. Slugs are stable after create
 * (they name URLs and the minutes-repo folder), so renames don't touch them. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "wg";
  for (let i = 0; ; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await db.workingGroup.findUnique({ where: { slug } }))) return slug;
  }
}

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
    data: {
      ...parsed.data,
      slug: await uniqueSlug(parsed.data.name),
      description: parsed.data.description ?? null,
    },
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
  const current = await db.workingGroup.findUniqueOrThrow({ where: { id } });
  // Stamp disabledAt on the enabled→disabled transition; keep it while it stays
  // disabled; clear it when re-enabled.
  const disabledAt =
    parsed.data.state === "disabled"
      ? current.state === "disabled"
        ? current.disabledAt
        : new Date()
      : null;
  await db.workingGroup.update({
    where: { id },
    data: { ...parsed.data, description: parsed.data.description ?? null, disabledAt },
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
  await db.workingGroup.update({
    where: { id },
    data: { state, disabledAt: state === "disabled" ? new Date() : null },
  });
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
  // Cancel the Calendar series first (best effort — the WG goes away anyway).
  const schedule = await db.wgSchedule.findUnique({ where: { wgId: id } });
  if (schedule?.googleEventId) {
    try {
      await deleteScheduleEvent(schedule.googleEventId);
    } catch {
      /* attendees keep a stale event; acceptable on force-delete */
    }
  }
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
