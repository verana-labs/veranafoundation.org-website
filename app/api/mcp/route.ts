import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import pkg from "@/package.json";
import { verifyApiToken } from "@/app/lib/api-tokens";
import { rateLimitAllow } from "@/app/lib/rate-limit";
import { db } from "@/app/lib/db";
import { isAdmin } from "@/app/lib/authz";
import { listWorkingGroupsWithAccess, personName, userActiveClasses } from "@/app/lib/working-groups";
import { WG_REGION_CODES } from "@/app/lib/regions";
import * as wg from "@/app/lib/wg-service";

/**
 * The site's MCP server (ADR-0005): Streamable HTTP at /api/mcp, stateless,
 * authenticated with a personal access token created in /account/settings.
 * Every tool runs as the token's user through the same service layer and
 * authorization as the website (member / participant / lead / admin); `read`
 * tokens get the read tools only. Mutations are audited as made via the MCP.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 120, windowMs: 60_000 };

// The validated token travels on the HTTP part of the handler context.
type ToolCtx = { http?: { authInfo?: { clientId?: string; scopes?: string[]; extra?: Record<string, unknown> } } };
type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function actorOf(ctx: ToolCtx): wg.Actor {
  const userId = ctx.http?.authInfo?.extra?.userId;
  const email = ctx.http?.authInfo?.extra?.email;
  if (typeof userId !== "string" || typeof email !== "string") throw new wg.ForbiddenError("Not authenticated.");
  return { id: userId, email, via: "mcp" };
}

const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: `Error: ${message}` }], isError: true });

/** Runs a tool body with auth, scope, rate limit and error mapping. */
async function run(
  ctx: ToolCtx,
  write: boolean,
  body: (actor: wg.Actor) => Promise<unknown>,
): Promise<ToolResult> {
  try {
    const actor = actorOf(ctx);
    const rl = rateLimitAllow(`mcp:${ctx.http?.authInfo?.clientId ?? actor.id}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
    if (!rl.allowed) return fail(`Rate limit reached; try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`);
    if (write && !ctx.http?.authInfo?.scopes?.includes("write")) {
      return fail("This access token is read-only. Create a read-write token in /account/settings to change things.");
    }
    const res = await body(actor);
    if (res && typeof res === "object" && "error" in res && (res as { error?: string }).error) {
      return fail((res as { error: string }).error);
    }
    return ok(res ?? { ok: true });
  } catch (e) {
    if (e instanceof wg.ForbiddenError) return fail(`${e.message} You need to be a lead of this group (or a Foundation admin) for that.`);
    console.error("[mcp] tool failed:", e);
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function wgIdOrFail(slug: string): Promise<string> {
  const id = await wg.wgIdBySlug(slug);
  if (!id) throw new Error(`No working group with slug "${slug}". Use list_working_groups to see the slugs.`);
  return id;
}

function isoDate(value: string, what: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`${what} must be an ISO 8601 date-time (e.g. 2026-10-14T15:00:00Z).`);
  return d;
}

const slugArg = z.string().min(1).describe("The group's slug, as in /working-groups/<slug>");

const handler = createMcpHandler(
  (server) => {
    // ── Read tools ───────────────────────────────────────────────────────────
    server.registerTool(
      "get_my_profile",
      {
        title: "Who am I",
        description: "The user behind this token: name, email, membership classes, groups led and joined, token scope.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) =>
        run(ctx, false, async (actor) => {
          const [user, classes, leads, participations, admin] = await Promise.all([
            db.user.findUnique({ where: { id: actor.id } }),
            userActiveClasses(actor.id),
            db.wgLead.findMany({ where: { userId: actor.id }, include: { wg: { select: { slug: true, name: true } } } }),
            db.wgParticipant.findMany({ where: { userId: actor.id, leftAt: null }, include: { wg: { select: { slug: true, name: true } } } }),
            isAdmin(actor.email),
          ]);
          return {
            name: user ? personName(user) : actor.email,
            email: actor.email,
            membershipClasses: [...classes],
            foundationAdmin: admin,
            tokenScope: ctx.http?.authInfo?.scopes?.includes("write") ? "read-write" : "read",
            leads: leads.map((l) => l.wg),
            participates: participations.map((p) => p.wg),
          };
        }),
    );

    server.registerTool(
      "list_working_groups",
      {
        title: "List working groups",
        description: "All enabled working groups with region, language, visibility, next meeting (ISO) and your relationship to each (joined, lead, requested, accessible).",
        inputSchema: z.object({
          region: z.enum(WG_REGION_CODES).optional().describe("Filter by region"),
          language: z.string().optional().describe("Filter by working language code, e.g. es"),
        }),
      },
      async ({ region, language }, ctx) =>
        run(ctx, false, async (actor) => {
          const groups = await listWorkingGroupsWithAccess(actor.id);
          const admin = await isAdmin(actor.email);
          const leadOf = new Set((await db.wgLead.findMany({ where: { userId: actor.id }, select: { wgId: true } })).map((l) => l.wgId));
          return groups
            .filter((g) => (!region || g.region === region) && (!language || g.language === language))
            .map((g) => ({
              slug: g.slug,
              name: g.name,
              description: g.description,
              requiredClass: g.requiredClass,
              visibility: g.visibility,
              region: g.region,
              language: g.language,
              leads: g.leads.map((l) => l.name),
              participantCount: g.visibility === "private" && !g.joined && !leadOf.has(g.id) && !admin ? undefined : g.participantCount,
              nextMeeting: g.nextMeeting,
              you: { accessible: g.accessible, joined: g.joined, lead: leadOf.has(g.id), requested: g.requested },
            }));
        }),
    );

    server.registerTool(
      "get_working_group",
      {
        title: "Get a working group",
        description: "Details of one group: description, leads, schedule and upcoming meetings (ISO + timezone), Meet link and participants for members, sessions, and pending join requests for leads.",
        inputSchema: z.object({ slug: slugArg }),
      },
      async ({ slug }, ctx) =>
        run(ctx, false, async (actor) => (await wg.groupView(actor, slug)) ?? { error: `No working group with slug "${slug}".` }),
    );

    server.registerTool(
      "get_session",
      {
        title: "Get a session",
        description: "A meeting's record: attendees, minutes (Markdown), and for members the transcript entries; leads also see the AI's open questions.",
        inputSchema: z.object({ session_id: z.string().min(1) }),
      },
      async ({ session_id }, ctx) =>
        run(ctx, false, async (actor) => (await wg.sessionView(actor, session_id)) ?? { error: "Session not found or not visible to you." }),
    );

    // ── Member tools ─────────────────────────────────────────────────────────
    server.registerTool(
      "join_working_group",
      {
        title: "Join a working group",
        description: "Join a group your memberships allow. For a private group this sends a join request to the leads (optional message).",
        inputSchema: z.object({ slug: slugArg, message: z.string().max(1000).optional() }),
      },
      async ({ slug, message }, ctx) => run(ctx, true, async (actor) => wg.joinGroup(actor, await wgIdOrFail(slug), message)),
    );
    server.registerTool(
      "leave_working_group",
      { title: "Leave a working group", description: "Leave a group you participate in.", inputSchema: z.object({ slug: slugArg }) },
      async ({ slug }, ctx) => run(ctx, true, async (actor) => wg.leaveGroup(actor, await wgIdOrFail(slug))),
    );
    server.registerTool(
      "withdraw_join_request",
      { title: "Withdraw a join request", description: "Withdraw your pending request to join a private group.", inputSchema: z.object({ slug: slugArg }) },
      async ({ slug }, ctx) => run(ctx, true, async (actor) => wg.withdrawJoinRequest(actor, await wgIdOrFail(slug))),
    );

    // ── Lead tools: people ───────────────────────────────────────────────────
    server.registerTool(
      "approve_join_request",
      { title: "Approve a join request", description: "Lead: approve a pending request (see get_working_group → pendingJoinRequests).", inputSchema: z.object({ slug: slugArg, request_id: z.string().min(1) }) },
      async ({ slug, request_id }, ctx) => run(ctx, true, async (actor) => wg.approveJoinRequest(actor, await wgIdOrFail(slug), request_id)),
    );
    server.registerTool(
      "decline_join_request",
      { title: "Decline a join request", description: "Lead: decline a pending request; the member is told without a reason.", inputSchema: z.object({ slug: slugArg, request_id: z.string().min(1) }) },
      async ({ slug, request_id }, ctx) => run(ctx, true, async (actor) => wg.declineJoinRequest(actor, await wgIdOrFail(slug), request_id)),
    );
    server.registerTool(
      "invite_participant",
      { title: "Invite a participant", description: "Lead: add a qualifying member by email, or invite anyone else to join the Foundation and the group.", inputSchema: z.object({ slug: slugArg, email: z.string().email() }) },
      async ({ slug, email }, ctx) => run(ctx, true, async (actor) => wg.inviteParticipant(actor, await wgIdOrFail(slug), email)),
    );
    server.registerTool(
      "remove_participant",
      { title: "Remove a participant", description: "Lead: remove a participant (user id from get_working_group).", inputSchema: z.object({ slug: slugArg, user_id: z.string().min(1) }) },
      async ({ slug, user_id }, ctx) => run(ctx, true, async (actor) => wg.removeParticipant(actor, await wgIdOrFail(slug), user_id)),
    );
    server.registerTool(
      "add_lead",
      { title: "Add a lead", description: "Lead: make an account a lead by email (or invite it if there is no account yet).", inputSchema: z.object({ slug: slugArg, email: z.string().email() }) },
      async ({ slug, email }, ctx) => run(ctx, true, async (actor) => wg.addLead(actor, await wgIdOrFail(slug), email)),
    );
    server.registerTool(
      "remove_lead",
      { title: "Remove a lead", description: "Lead: remove a lead; a group always keeps at least one.", inputSchema: z.object({ slug: slugArg, user_id: z.string().min(1) }) },
      async ({ slug, user_id }, ctx) => run(ctx, true, async (actor) => wg.removeLead(actor, await wgIdOrFail(slug), user_id)),
    );

    // ── Lead tools: schedule & meetings ──────────────────────────────────────
    server.registerTool(
      "set_schedule",
      {
        title: "Set the meeting schedule",
        description: "Lead: create or replace the recurring meeting. first_at is wall time in `timezone` (YYYY-MM-DDTHH:mm). Replacing a schedule clears all cancellations and moves.",
        inputSchema: z.object({
          slug: slugArg,
          first_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
          timezone: z.string().min(1).describe("IANA timezone, e.g. Europe/Paris"),
          duration_min: z.number().int().min(15).max(480),
          frequency: z.enum(["weekly", "biweekly", "monthly"]),
        }),
      },
      async ({ slug, first_at, timezone, duration_min, frequency }, ctx) =>
        run(ctx, true, async (actor) =>
          wg.saveSchedule(actor, await wgIdOrFail(slug), { firstAt: first_at, timezone, durationMin: duration_min, frequency }),
        ),
    );
    server.registerTool(
      "delete_schedule",
      { title: "Remove the schedule", description: "Lead: remove the recurring meeting (cancelled for all attendees).", inputSchema: z.object({ slug: slugArg }) },
      async ({ slug }, ctx) => run(ctx, true, async (actor) => wg.deleteSchedule(actor, await wgIdOrFail(slug))),
    );
    server.registerTool(
      "cancel_meeting",
      {
        title: "Cancel one meeting",
        description: "Lead: cancel a single occurrence. `start` is the occurrence's series start (ISO, from get_working_group → schedule.upcoming[].originalStart).",
        inputSchema: z.object({ slug: slugArg, start: z.string(), note: z.string().max(200).optional() }),
      },
      async ({ slug, start, note }, ctx) =>
        run(ctx, true, async (actor) => wg.cancelMeeting(actor, await wgIdOrFail(slug), isoDate(start, "start"), note)),
    );
    server.registerTool(
      "move_meeting",
      {
        title: "Move one meeting",
        description: "Lead: move a single occurrence to another date/time (same duration). `start` is the series start (ISO); `new_start_local` is wall time in the schedule's timezone (YYYY-MM-DDTHH:mm).",
        inputSchema: z.object({
          slug: slugArg,
          start: z.string(),
          new_start_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
          note: z.string().max(200).optional(),
        }),
      },
      async ({ slug, start, new_start_local, note }, ctx) =>
        run(ctx, true, async (actor) => wg.moveMeeting(actor, await wgIdOrFail(slug), isoDate(start, "start"), new_start_local, note)),
    );
    server.registerTool(
      "restore_meeting",
      { title: "Restore one meeting", description: "Lead: undo a cancellation or a move; `start` is the series start (ISO).", inputSchema: z.object({ slug: slugArg, start: z.string() }) },
      async ({ slug, start }, ctx) => run(ctx, true, async (actor) => wg.restoreMeeting(actor, await wgIdOrFail(slug), isoDate(start, "start"))),
    );
    server.registerTool(
      "update_group_settings",
      {
        title: "Update group settings",
        description: "Lead: toggle automatic minutes (Meet transcription + AI draft) and/or set the working language.",
        inputSchema: z.object({
          slug: slugArg,
          auto_minutes: z.boolean().optional(),
          language: z.enum(wg.LANGUAGE_CODES as [string, ...string[]]).optional(),
        }),
      },
      async ({ slug, auto_minutes, language }, ctx) =>
        run(ctx, true, async (actor) => wg.updateSettings(actor, await wgIdOrFail(slug), { autoMinutes: auto_minutes, language })),
    );

    // ── Lead tools: sessions & minutes ───────────────────────────────────────
    server.registerTool(
      "open_session",
      {
        title: "Open a session",
        description: "Lead: open (or reopen) the session record of an occurrence; returns its id. `occurred_at` is the meeting's start (ISO, the actual time for a moved meeting).",
        inputSchema: z.object({ slug: slugArg, occurred_at: z.string() }),
      },
      async ({ slug, occurred_at }, ctx) =>
        run(ctx, true, async (actor) => wg.openSession(actor, await wgIdOrFail(slug), isoDate(occurred_at, "occurred_at"))),
    );
    const sessionFields = {
      session_id: z.string().min(1),
      notes_md: z.string().max(200_000).optional().describe("The minutes, Markdown"),
      attendee_user_ids: z.array(z.string()).optional().describe("User ids of the attendees (from get_working_group participants/leads)"),
      guests: z.array(z.string()).optional().describe("Free-text names of guests"),
      publish_transcript: z.boolean().optional().describe("Also publish the transcript next to the minutes (default false)"),
    };
    const toSessionInput = (a: { notes_md?: string; attendee_user_ids?: string[]; guests?: string[]; publish_transcript?: boolean }): wg.SessionInput => ({
      notesMd: a.notes_md,
      attendeeUserIds: a.attendee_user_ids,
      guests: a.guests,
      publishTranscript: a.publish_transcript,
    });
    server.registerTool(
      "save_session",
      { title: "Save a session", description: "Lead: save attendance and/or minutes of a session as a draft. Omitted fields are left as they are.", inputSchema: z.object(sessionFields) },
      async (args, ctx) => run(ctx, true, async (actor) => wg.saveSession(actor, args.session_id, toSessionInput(args))),
    );
    server.registerTool(
      "publish_session",
      {
        title: "Publish a session",
        description: "Lead: approve & publish the minutes (and, if opted in, the transcript) to the group's minutes repository. Saves the given fields first. This is a public record for public groups.",
        inputSchema: z.object(sessionFields),
      },
      async (args, ctx) => run(ctx, true, async (actor) => wg.publishSession(actor, args.session_id, toSessionInput(args))),
    );
    server.registerTool(
      "delete_session",
      { title: "Delete a draft session", description: "Lead: delete a draft session (and its transcript). Published sessions can't be deleted.", inputSchema: z.object({ session_id: z.string().min(1) }) },
      async ({ session_id }, ctx) => run(ctx, true, async (actor) => wg.deleteSession(actor, session_id)),
    );
    server.registerTool(
      "regenerate_ai_draft",
      { title: "Regenerate the AI draft", description: "Lead: re-run the AI minutes draft from the stored transcript (background; check the session again in a minute).", inputSchema: z.object({ session_id: z.string().min(1) }) },
      async ({ session_id }, ctx) => run(ctx, true, async (actor) => wg.regenerateDraft(actor, session_id)),
    );
    server.registerTool(
      "discard_ai_draft",
      { title: "Discard the AI draft", description: "Lead: drop the AI draft from the review queue; the transcript stays internal.", inputSchema: z.object({ session_id: z.string().min(1) }) },
      async ({ session_id }, ctx) => run(ctx, true, async (actor) => wg.discardDraft(actor, session_id)),
    );
    server.registerTool(
      "retry_transcript",
      { title: "Retry the transcript pipeline", description: "Lead: put a failed transcript back on its step (background).", inputSchema: z.object({ session_id: z.string().min(1) }) },
      async ({ session_id }, ctx) => run(ctx, true, async (actor) => wg.retryTranscript(actor, session_id)),
    );

    // ── Admin tools ──────────────────────────────────────────────────────────
    const groupFields = {
      name: z.string().min(1),
      description: z.string().optional(),
      link: z.string().url().describe("External space of the group (GitHub folder, chat, …)"),
      visibility: z.enum(["public", "private"]).optional(),
      region: z.enum(WG_REGION_CODES).optional(),
      language: z.enum(wg.LANGUAGE_CODES as [string, ...string[]]).optional(),
      auto_minutes: z.boolean().optional(),
      show_on_home: z.boolean().optional(),
      priority: z.number().int().optional(),
    };
    server.registerTool(
      "create_working_group",
      { title: "Create a working group", description: "Foundation admin: create a group (slug derived from the name).", inputSchema: z.object({ ...groupFields, required_class: z.enum(["any", "associate"]).optional() }) },
      async (args, ctx) =>
        run(ctx, true, async (actor) =>
          wg.createGroup(actor, {
            name: args.name,
            description: args.description,
            link: args.link,
            requiredClass: args.required_class,
            visibility: args.visibility,
            region: args.region,
            language: args.language,
            autoMinutes: args.auto_minutes,
            showOnHome: args.show_on_home,
            priority: args.priority,
          }),
        ),
    );
    server.registerTool(
      "update_working_group",
      {
        title: "Update a working group",
        description: "Foundation admin: change a group's content or settings (not its required membership class). Omitted fields are left as they are.",
        inputSchema: z.object({
          slug: slugArg,
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          link: z.string().url().optional(),
          visibility: z.enum(["public", "private"]).optional(),
          region: z.enum(WG_REGION_CODES).optional(),
          language: z.enum(wg.LANGUAGE_CODES as [string, ...string[]]).optional(),
          auto_minutes: z.boolean().optional(),
          show_on_home: z.boolean().optional(),
          state: z.enum(["enabled", "disabled"]).optional(),
          priority: z.number().int().optional(),
        }),
      },
      async (args, ctx) =>
        run(ctx, true, async (actor) =>
          wg.updateGroup(actor, await wgIdOrFail(args.slug), {
            name: args.name,
            description: args.description,
            link: args.link,
            visibility: args.visibility,
            region: args.region,
            language: args.language,
            autoMinutes: args.auto_minutes,
            showOnHome: args.show_on_home,
            state: args.state,
            priority: args.priority,
          }),
        ),
    );
  },
  {
    serverInfo: { name: "veranafoundation-org", version: pkg.version },
    instructions:
      "Working groups of the Verana Foundation. You act as the person who owns the access token, with their role in each group (member, participant, lead, admin). Dates are ISO 8601 in UTC unless a timezone is given; wall-clock inputs (first_at, new_start_local) are in the group's schedule timezone. Publishing minutes of a public group creates a public record: confirm with the user before publish_session.",
  },
);

const authed = withMcpAuth(
  handler,
  async (_req, bearer) => {
    if (!bearer) return undefined;
    const v = await verifyApiToken(bearer);
    if (!v) return undefined;
    return {
      token: bearer,
      clientId: v.tokenId,
      scopes: v.scope === "write" ? ["read", "write"] : ["read"],
      expiresAt: v.expiresAt ? Math.floor(v.expiresAt.getTime() / 1000) : undefined,
      extra: { userId: v.user.id, email: v.user.email },
    };
  },
  { required: true },
);

export { authed as GET, authed as POST, authed as DELETE };
