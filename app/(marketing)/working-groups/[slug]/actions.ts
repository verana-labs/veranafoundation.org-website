"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser } from "@/app/lib/authz";
import * as wg from "@/app/lib/wg-service";
import { MINUTES_LANGUAGES } from "@/app/lib/languages";

/**
 * Server actions of the working-group pages: thin wrappers that resolve the
 * signed-in actor, call the shared service (lib/wg-service.ts — also used by
 * the MCP tools) and revalidate the pages. All authorization lives in the
 * service.
 */

export type ActionState = { error?: string; ok?: boolean; message?: string };

async function actor(): Promise<wg.Actor> {
  const user = await currentUser();
  if (!user?.id || !user.email) throw new Error("Not signed in.");
  return { id: user.id, email: user.email, via: "web" };
}

async function revalidateWg(wgId: string) {
  const group = await db.workingGroup.findUnique({ where: { id: wgId }, select: { slug: true } });
  if (group) revalidatePath(`/working-groups/${group.slug}`);
  revalidatePath("/working-groups");
  // The admin board reuses these actions (leads, invites) in its cards.
  revalidatePath("/admin/working-groups");
}

async function withRevalidate(wgId: string, run: (a: wg.Actor) => Promise<wg.Result>): Promise<ActionState> {
  const a = await actor();
  try {
    const res = await run(a);
    await revalidateWg(wgId);
    return res;
  } catch (e) {
    if (e instanceof wg.ForbiddenError) throw e; // surfaces as a Next error, as before
    throw e;
  }
}

// ── Participation ────────────────────────────────────────────────────────────

export async function joinWg(wgId: string, message?: string): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.joinGroup(a, wgId, message));
}

export async function leaveWg(wgId: string): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.leaveGroup(a, wgId));
}

export async function withdrawJoinRequest(wgId: string): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.withdrawJoinRequest(a, wgId));
}

export async function approveJoinRequest(wgId: string, requestId: string): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.approveJoinRequest(a, wgId, requestId));
}

export async function declineJoinRequest(wgId: string, requestId: string): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.declineJoinRequest(a, wgId, requestId));
}

export async function removeParticipant(wgId: string, userId: string): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.removeParticipant(a, wgId, userId));
}

// ── Leads & email invites ────────────────────────────────────────────────────

export async function addLead(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const wgId = String(formData.get("wgId"));
  return withRevalidate(wgId, (a) => wg.addLead(a, wgId, String(formData.get("email") ?? "")));
}

export async function inviteParticipant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const wgId = String(formData.get("wgId"));
  return withRevalidate(wgId, (a) => wg.inviteParticipant(a, wgId, String(formData.get("email") ?? "")));
}

export async function revokeInvite(wgId: string, inviteId: string): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.revokeInvite(a, wgId, inviteId));
}

export async function resendInvite(wgId: string, inviteId: string): Promise<ActionState> {
  const a = await actor();
  return wg.resendInvite(a, wgId, inviteId);
}

export async function removeLead(wgId: string, userId: string): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.removeLead(a, wgId, userId));
}

// ── Schedule ─────────────────────────────────────────────────────────────────

const scheduleSchema = z.object({
  wgId: z.string().min(1),
  // From <input type="datetime-local">: wall time in the chosen timezone.
  firstAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
  timezone: z.string().min(1),
  durationMin: z.coerce.number().int().min(15).max(480),
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
});

export async function saveSchedule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scheduleSchema.safeParse({
    wgId: formData.get("wgId"),
    firstAt: formData.get("firstAt"),
    timezone: formData.get("timezone"),
    durationMin: formData.get("durationMin"),
    frequency: formData.get("frequency"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid schedule." };
  }
  const { wgId, ...input } = parsed.data;
  return withRevalidate(wgId, (a) => wg.saveSchedule(a, wgId, input));
}

export async function retrySync(wgId: string): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.retrySync(a, wgId));
}

export async function deleteSchedule(wgId: string): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.deleteSchedule(a, wgId));
}

/** "Remove next week's session": exception in DB + cancelled Calendar instance. */
export async function cancelMeeting(wgId: string, startIso: string, note?: string): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.cancelMeeting(a, wgId, new Date(startIso), note));
}

/** Move one meeting; `newLocal` is a datetime-local value in the schedule's timezone. */
export async function moveMeeting(
  wgId: string,
  startIso: string,
  newLocal: string,
  note?: string,
): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.moveMeeting(a, wgId, new Date(startIso), newLocal, note));
}

/** Undo a cancellation or a move: the meeting is back on its series slot. */
export async function restoreMeeting(wgId: string, startIso: string): Promise<ActionState> {
  return withRevalidate(wgId, (a) => wg.restoreMeeting(a, wgId, new Date(startIso)));
}

// ── Automatic minutes settings (ADR-0004) ────────────────────────────────────

const settingsSchema = z.object({
  wgId: z.string().min(1),
  autoMinutes: z.boolean(),
  language: z.enum(MINUTES_LANGUAGES.map((l) => l.code) as [string, ...string[]]),
});

export async function updateWgSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = settingsSchema.safeParse({
    wgId: formData.get("wgId"),
    autoMinutes: formData.get("autoMinutes") === "on",
    language: formData.get("language") ?? "en",
  });
  if (!parsed.success) return { error: "Invalid settings." };
  const { wgId, ...input } = parsed.data;
  return withRevalidate(wgId, (a) => wg.updateSettings(a, wgId, input));
}

// ── Sessions & minutes (ADR-0004: leads write; participants read) ────────────

/** Open (or reopen) the session record for an occurrence and go edit it. */
export async function startSession(wgId: string, occurredAtIso: string) {
  const a = await actor();
  const res = await wg.openSession(a, wgId, new Date(occurredAtIso));
  if (!res.ok || !res.slug || !res.sessionId) throw new Error(res.error ?? "Could not open the session.");
  redirect(`/working-groups/${res.slug}/sessions/${res.sessionId}`);
}

const sessionFormSchema = z.object({
  sessionId: z.string().min(1),
  notesMd: z.string().max(200_000),
  attendeeUserIds: z.array(z.string()),
  guests: z.string().max(2000), // comma/newline-separated free-text names
  publishTranscript: z.boolean(),
});

function parseSessionForm(formData: FormData) {
  const parsed = sessionFormSchema.safeParse({
    sessionId: formData.get("sessionId"),
    notesMd: formData.get("notesMd") ?? "",
    attendeeUserIds: formData.getAll("attendeeUserIds").map(String),
    guests: formData.get("guests") ?? "",
    publishTranscript: formData.get("publishTranscript") === "on",
  });
  if (!parsed.success) return null;
  const { sessionId, guests, ...rest } = parsed.data;
  return {
    sessionId,
    input: { ...rest, guests: guests.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) },
  };
}

async function sessionWgId(sessionId: string): Promise<string | null> {
  const s = await db.wgSession.findUnique({ where: { id: sessionId }, select: { wgId: true } });
  return s?.wgId ?? null;
}

export async function saveSession(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseSessionForm(formData);
  if (!parsed) return { error: "Invalid input." };
  const a = await actor();
  return wg.saveSession(a, parsed.sessionId, parsed.input);
}

export async function publishSession(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseSessionForm(formData);
  if (!parsed) return { error: "Invalid input." };
  const a = await actor();
  const res = await wg.publishSession(a, parsed.sessionId, parsed.input);
  const wgId = await sessionWgId(parsed.sessionId);
  if (wgId) await revalidateWg(wgId);
  return res;
}

async function sessionAction(sessionId: string, run: (a: wg.Actor) => Promise<wg.Result>): Promise<ActionState> {
  const a = await actor();
  const wgId = await sessionWgId(sessionId);
  const res = await run(a);
  if (wgId) await revalidateWg(wgId);
  return res;
}

export async function deleteSession(sessionId: string): Promise<ActionState> {
  return sessionAction(sessionId, (a) => wg.deleteSession(a, sessionId));
}

export async function regenerateDraft(sessionId: string): Promise<ActionState> {
  return sessionAction(sessionId, (a) => wg.regenerateDraft(a, sessionId));
}

export async function discardDraft(sessionId: string): Promise<ActionState> {
  return sessionAction(sessionId, (a) => wg.discardDraft(a, sessionId));
}

export async function retryTranscript(sessionId: string): Promise<ActionState> {
  return sessionAction(sessionId, (a) => wg.retryTranscript(a, sessionId));
}
