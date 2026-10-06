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

// ── Personal access tokens for the MCP server (ADR-0005) ─────────────────────

import { createApiToken, revokeApiToken } from "@/app/lib/api-tokens";

export type TokenState = { error?: string; ok?: boolean; secret?: string; name?: string };

const tokenSchema = z.object({
  name: z.string().trim().min(1, "Give the token a name.").max(80),
  scope: z.enum(["read", "write"]),
  expiresInDays: z.enum(["30", "90", "365", "never"]),
});

export async function createToken(_prev: TokenState, formData: FormData): Promise<TokenState> {
  const user = await currentUser();
  if (!user?.id) return { error: "Not signed in." };
  const parsed = tokenSchema.safeParse({
    name: formData.get("name"),
    scope: formData.get("scope"),
    expiresInDays: formData.get("expiresInDays"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { secret, token } = await createApiToken(user.id, {
    name: parsed.data.name,
    scope: parsed.data.scope,
    expiresInDays: parsed.data.expiresInDays === "never" ? null : Number(parsed.data.expiresInDays),
  });
  await db.adminAction.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email ?? "",
      action: "token.create",
      targetType: "ApiToken",
      targetId: token.id,
      after: { name: token.name, scope: token.scope, expiresAt: token.expiresAt },
    },
  });
  revalidatePath("/account/settings");
  return { ok: true, secret, name: token.name };
}

export async function revokeToken(id: string): Promise<TokenState> {
  const user = await currentUser();
  if (!user?.id) return { error: "Not signed in." };
  const revoked = await revokeApiToken(user.id, id);
  if (!revoked) return { error: "Token not found." };
  await db.adminAction.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email ?? "",
      action: "token.revoke",
      targetType: "ApiToken",
      targetId: id,
    },
  });
  revalidatePath("/account/settings");
  return { ok: true };
}
