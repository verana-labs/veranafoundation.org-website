# ADR-0005 — MCP server for the working groups

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** Fabrice (Verana / 2060)
- **Depends on:** the working-group model and roles of [ADR-0003](./adr-0003-working-groups.md) and the automatic minutes of [ADR-0004](./adr-0004-automatic-minutes.md).

## Context

Leads and participants increasingly work through AI assistants (Claude Code, Cursor, …). They should be able to ask their assistant what a group decided last week, who attends, when the next meeting is, or — as a lead — approve a join request, move a meeting or publish the minutes, without leaving their tool. Everything must happen **as the person**, with exactly the rights they have on the site.

## Decision

1. **A Model Context Protocol server inside the site**, Streamable HTTP at `/api/mcp`, stateless, built on the official TypeScript SDK through the `mcp-handler` adapter (Next.js route handler; serves the current protocol and the 2025 Streamable HTTP clients). No separate service to deploy.
2. **Personal access tokens** created in `/account/settings`: a name, a scope (`read` or `write`), an optional expiry. The secret (`vf_…`) is shown once; only its SHA-256 is stored (`ApiToken`), with last-used tracking and revocation as a timestamp. The MCP client sends it as `Authorization: Bearer …`; an invalid or missing token gets the spec's 401 challenge. Creation and revocation are audited.
3. **One service layer for the web and the MCP.** The group operations moved from the server actions into `lib/wg-service.ts`, as functions taking an `Actor` (user id, email, channel). Both the server actions (session cookie) and the MCP tools (token) call them; every function checks authorization itself (member / participant / lead / admin), audits what it changes — MCP-made changes carry `via: "mcp"` — and knows nothing about the HTTP request.
4. **Role-aware tools.** Read tools (`get_my_profile`, `list_working_groups`, `get_working_group`, `get_session`) return what the person may see: private-group content and transcripts for members, pending join requests and AI notes for leads. Write tools need a `write` token and the role the site would require: members join / leave / request; leads manage people, schedule, single meetings, settings, sessions (open, save, publish, regenerate / discard / retry the AI draft); admins create and update groups. Dates are ISO 8601 UTC; wall-clock inputs are in the schedule's timezone, as on the site.
5. **Safeguards.** 120 requests per minute per token (in-memory, single replica), scope check before the role check, server instructions telling the assistant to confirm with the user before publishing minutes of a public group.

## Amendment 2026-10-06 — OAuth 2.1 for the connectors

The claude.ai connectors (web, desktop) authenticate with OAuth, not with a pasted token. The site is now also the **authorization server**:

- **Discovery:** `/.well-known/oauth-protected-resource` (RFC 9728, pointing at this site) and `/.well-known/oauth-authorization-server` (RFC 8414). The MCP endpoint's 401 challenge advertises the former.
- **Dynamic client registration** (RFC 7591) at `/api/oauth/register`, **open to any client** — the consent screen is what protects the user. Redirect URIs must be https, or http on a loopback host; public clients rely on PKCE, confidential ones get a secret. Rate-limited per IP.
- **Authorization** at `/oauth/authorize`: the client and redirect URI are validated before anything is shown, the user signs in with the usual methods, then approves or denies a consent screen stating the scope (`read`, or `read write`) and that the app acts with the user's own role. Approval mints a single-use code (10 min) bound to client, redirect URI, PKCE challenge (S256 only), scope and resource.
- **Tokens** at `/api/oauth/token`: the code is exchanged for an **access token (1 h)** and a **refresh token (90 days)**. Both are `ApiToken` rows (`kind` access / refresh, `clientId`, `grantId`, `resource`), hashed like personal tokens, so the MCP route verifies them unchanged; refresh tokens are never accepted as bearers. Refresh **rotates** both tokens; a replayed refresh token **revokes the whole grant**. A replayed code is rejected. Tokens carry the resource indicator (RFC 8707) and the MCP route rejects one minted for another audience. Revocation at `/api/oauth/revoke` (RFC 7009) revokes the grant.
- **Settings:** a *Connected applications* list (one row per grant: app, scope, connected, last used) with Disconnect, which revokes every token of the grant. Grants and disconnections are audited (`oauth.grant`, `oauth.revoke`).
- Expired codes and long-expired OAuth tokens are purged by the cron.

## Not now

- **Resources / prompts.** Tools cover the use cases; MCP resources (e.g. `wg://<slug>/minutes/<date>`) can be added when a client benefits.

## Consequences

- One codebase, one authorization model, one audit log, whatever the channel.
- The service layer makes the group logic unit-testable without Next.js.
- A leaked token acts as its owner until revoked or expired: short expiries are the default in the form, and revocation is one click.
