"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { deleteScheduleEvent } from "@/app/lib/google-calendar";
import { setAutoTranscriptionByName } from "@/app/lib/google-meet";
import { MINUTES_LANGUAGES } from "@/app/lib/languages";
import { WG_REGION_CODES } from "@/app/lib/regions";
import * as wg from "@/app/lib/wg-service";

export type WgState = { error?: string; ok?: boolean };

async function adminActor(): Promise<wg.Actor> {
  const user = await currentUser();
  if (!user?.id || !user.email || !(await isAdmin(user.email))) throw new Error("Forbidden");
  return { id: user.id, email: user.email, via: "web" };
}

/** Re-render the admin list and the ISR home board after any change. */
function revalidate() {
  revalidatePath("/admin/working-groups");
  revalidatePath("/working-groups");
  revalidatePath("/"); // home page board (showOnHome) is ISR
}

// Create takes the access level (requiredClass); Edit does not change it.
const createSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  requiredClass: z.enum(["any", "associate"]),
  showOnHome: z.boolean(),
  state: z.enum(["enabled", "disabled"]).default("enabled"),
  priority: z.coerce.number().int().default(0),
  // ADR-0004: Meet transcription + AI-drafted minutes, and the working language.
  autoMinutes: z.boolean(),
  language: z.enum(MINUTES_LANGUAGES.map((l) => l.code) as [string, ...string[]]).default("en"),
  // Regional groups: scope badge + board filter.
  region: z.enum(WG_REGION_CODES).default("global"),
  // Private groups: members-only content, joining by a lead's approval.
  visibility: z.enum(["public", "private"]).default("public"),
});

const editSchema = createSchema.omit({ requiredClass: true });

function fields(formData: FormData) {
  return {
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    showOnHome: formData.get("showOnHome") === "on",
    state: formData.get("state") ?? "enabled",
    priority: formData.get("priority") ?? 0,
    autoMinutes: formData.get("autoMinutes") === "on",
    language: formData.get("language") ?? "en",
    region: formData.get("region") ?? "global",
    visibility: formData.get("visibility") ?? "public",
  };
}

export async function createWg(_prev: WgState, formData: FormData): Promise<WgState> {
  let actor: wg.Actor;
  try {
    actor = await adminActor();
  } catch {
    return { error: "Forbidden" };
  }
  const parsed = createSchema.safeParse({ ...fields(formData), requiredClass: formData.get("requiredClass") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const res = await wg.createGroup(actor, parsed.data);
  revalidate();
  return res.error ? { error: res.error } : { ok: true };
}

/** Edit a WG's content (not its access level). Throws on invalid input. */
export async function updateWg(formData: FormData) {
  const actor = await adminActor();
  const id = String(formData.get("id"));
  const parsed = editSchema.safeParse(fields(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  const res = await wg.updateGroup(actor, id, parsed.data);
  if (res.error) throw new Error(res.error);
  revalidate();
}

export async function toggleShowOnHome(id: string) {
  const actor = await adminActor();
  const current = await db.workingGroup.findUniqueOrThrow({ where: { id } });
  await wg.updateGroup(actor, id, { showOnHome: !current.showOnHome });
  revalidate();
}

export async function toggleState(id: string) {
  const actor = await adminActor();
  const current = await db.workingGroup.findUniqueOrThrow({ where: { id } });
  await wg.updateGroup(actor, id, { state: current.state === "enabled" ? "disabled" : "enabled" });
  revalidate();
}

export async function deleteWg(formData: FormData) {
  const actor = await adminActor();
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
  if (schedule?.meetSpaceName && schedule.meetAutoTranscribe) {
    await setAutoTranscriptionByName(schedule.meetSpaceName, false).catch(() => {});
  }
  await db.workingGroup.delete({ where: { id } });
  await db.adminAction.create({
    data: {
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: "wg.delete",
      targetType: "WorkingGroup",
      targetId: id,
    },
  });
  revalidate();
}
