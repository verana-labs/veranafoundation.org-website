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

## Not now

- **OAuth 2.1.** The claude.ai connectors require it (dynamic client registration, authorization code + PKCE). The token model is compatible: a later phase adds an authorization server issuing the same kind of tokens; `mcp-handler` already answers the protected-resource metadata challenge.
- **Resources / prompts.** Tools cover the use cases; MCP resources (e.g. `wg://<slug>/minutes/<date>`) can be added when a client benefits.

## Consequences

- One codebase, one authorization model, one audit log, whatever the channel.
- The service layer makes the group logic unit-testable without Next.js.
- A leaked token acts as its owner until revoked or expired: short expiries are the default in the form, and revocation is one click.
