# ADR-0003 — Working Groups: leads, schedule, sessions & minutes

- **Status:** Proposed
- **Date:** 2026-06-11
- **Deciders:** Fabrice (Verana / 2060)
- **Depends on / blocks:** builds on the auth/roles model and the `WorkingGroup` entity of [ADR-0002](./adr-0002-authentication.md); uses the Verana Google Workspace (Calendar/Meet), the existing SMTP transport (`app/lib/email.ts`) and the `AdminAction` audit pattern.

## Context

Working Groups today are placeholders: an admin-managed card (name, description, required membership class, external link) whose only behaviour is "click out if your membership qualifies" ([ADR-0002 § Working Group access](./adr-0002-authentication.md#working-group-access)). For WGs to be where the work actually happens, each one needs:

- **Leads** — accountable people, visible on the card, who run the group.
- **A schedule** — a recurring meeting that lands in participants' own calendars (Google, Microsoft, Apple) with a Meet link, and that leads can amend at will (e.g. cancel next week's occurrence).
- **Session records** — per-meeting attendance and minutes, written by a participant, preserved as a public record in a GitHub repository and browsable on the website.
- **Real names** — participants appear by a display name they control, not whatever their OAuth provider sent.

Constraints: keep the verified-email/computed-entitlement model of ADR-0002 untouched; the Foundation already runs Google Workspace, so calendaring should ride on it rather than be rebuilt; the public site must keep building and rendering when third parties (Google, GitHub) are unreachable.

## Decision

### 1. Working groups become first-class pages with explicit participants

- Each WG gets a **`slug`** and an internal detail page **`/working-groups/<slug>`**: public summary (description, leads, next meeting date, published minutes); richer for signed-in participants (Meet link, upcoming occurrences); richer again for leads (schedule editor, member management). The existing `link` field remains as the optional *external space* (GitHub org/folder, chat, …).
- **Participation is explicit.** Any signed-in user whose effective membership set satisfies the WG's `requiredClass` (existing `canAccessWg` rule — unchanged) may **join** the group, creating a `WgParticipant` row. Participants are who we add as Calendar attendees, list in the attendance picker, and show on the page. Leaving (or losing the qualifying membership) sets `leftAt`; access checks always re-evaluate `canAccessWg`, so a stale participant row never grants access by itself.

### 2. Leads

- `WgLead (wgId, userId)` — one or several per group. Foundation admins assign the initial lead(s); leads may add/remove other leads.
- **Invariant: a WG never has zero leads.** Every removal/demotion path checks `leadCount > 1` server-side (same pattern as the "last org manager" safeguard of ADR-0002). Admins can always override membership of the lead set, but not below one.
- Leads can: edit description and external link, manage the schedule and per-occurrence cancellations, manage leads and participants, and publish minutes. Leads do **not** change `requiredClass` (admin-only, as today).
- Cards show lead avatars (the GitHub-contributor avatar style already used on the home page): `User.image`, falling back to initials.
- All lead/schedule mutations are logged to `AdminAction` (`wg.lead.add`, `wg.schedule.update`, …) with the acting user, even when the actor is a lead rather than a Foundation admin.

### 2b. Email invites (amendment, 2026-07)

- Leads and Foundation admins can invite **any email address** into a group —
  as **lead** or as **participant** — including people with no account or
  membership yet. The invite is a `WgInvite (wgId, email, role)` row; the
  person receives an email asking them to join the Foundation as a
  Contributor (free) or Associate (Associate expected for
  `requiredClass = associate` groups), with a link to `/join`.
- **The membership gate stays strict.** A pending invite converts into a real
  `WgLead`/`WgParticipant` row (Calendar attendee, shown on the page) only
  once a user with that verified email holds an **active membership
  satisfying the group's `requiredClass`**. Conversion
  (`convertWgInvitesForEmails`) runs at every point the gate can newly hold:
  sign-in, contributor application, invoice payment (Associate activation),
  admin membership-status changes, and org access-list additions. It is
  idempotent and best-effort — payment webhooks and sign-in never fail on it.
- Direct adds are unchanged: inviting a user who already qualifies adds them
  immediately; adding an **existing account** as lead still works without a
  membership check (leads assigned pre-membership remain possible, as before).
- Pending invites are listed in the lead console (resend / revoke); pending
  **lead** invites do not count toward the "never zero leads" invariant.
- Audit: `wg.invite.add` / `wg.invite.resend` / `wg.invite.revoke` /
  `wg.invite.accept` in `AdminAction`.

### 3. Schedule: Google Calendar is the delivery rail, the database is the canonical record

The Foundation's Google Workspace hosts the meetings. A **service account with domain-wide delegation** impersonates a dedicated role account (e.g. `meetings@verana.io`), which is the **organizer of every WG meeting**:

- When a lead saves a WG schedule, the app **creates/updates one recurring Google Calendar event** on the role account's calendar: `RRULE` recurrence, the WG's participants as **attendees**, `conferenceDataVersion=1` so Google **auto-creates the Meet link**, and `sendUpdates=all` so **Google sends the invitations** — Gmail users get native invites; Microsoft/Apple users receive Google's standards-compliant iCalendar email, so Outlook renders Accept/Decline too. No SMTP invite code of our own.
- **Join/leave a WG** patches the event's attendee list (invite/cancellation delivered by Google to just that person).
- **Cancelling one occurrence** ("nobody can attend next week") patches that event *instance* to `status=cancelled` with `sendUpdates=all` — it disappears from every attendee's calendar. Restoring un-cancels it.
- **RSVPs** live in Google Calendar; the app can read attendee `responseStatus` back from the API to show expected attendance (nice-to-have, not load-bearing — recorded attendance comes from the note-taker, §4).

The database stays the **canonical record** so the site renders schedules without calling Google and survives an outage:

```text
WgSchedule {
  wgId (unique),
  startsAt (first occurrence), durationMin,
  timezone,                       # IANA, e.g. "Europe/Paris"
  rrule,                          # RFC 5545, e.g. "FREQ=WEEKLY;BYDAY=WE"
  googleEventId?, meetLink?,      # set after the Calendar API call succeeds
  syncedAt?, syncError?           # last push state — UI shows "pending sync" if stale
}
WgScheduleException {             # cancelled occurrences, mirrored to Calendar
  scheduleId, originalStart, note?
}
```

Sync is **one-way (DB → Google)** and retryable: every write goes to the DB first, then pushes to the Calendar API; a failed push stores `syncError` and the lead UI offers retry. The Meet link returned by Google is stored and shown only to participants — never on the public page of a gated group.

### 4. Sessions & minutes: DB is the working copy, GitHub is the public record

```text
WgSession {
  wgId, occurredAt,
  status: draft | published,
  notesMd,                          # Markdown, autosaved while drafting
  recordedById,
  notesPath?, notesCommitSha?       # set on publish
}
WgSessionAttendee { sessionId, userId?, name }   # name snapshotted; guests have userId = null
```

- Any participant can open a session record for an occurrence, tick attendees (participants + free-text guests), and take Markdown notes. Drafts are visible to participants only.
- **Publish** commits the minutes to a public GitHub repository — **`verana-labs/working-groups`**, path `<slug>/minutes/YYYY-MM-DD.md` with a YAML front-matter header (group, date, attendees, recorder) — via the GitHub contents API using a server-side fine-grained token (`MINUTES_REPO`, `MINUTES_GITHUB_TOKEN` env). The commit SHA is stored on the session.
- The website renders session history **from the database** (fast, no rate limits, works when GitHub is down) and links each published session to its commit (immutable, citable public record). Attendee names are snapshotted at publish time — later display-name changes don't rewrite history.
- If the GitHub commit fails, the session stays `draft` with the error surfaced to the publisher; publishing is retryable and idempotent (same path, content updated by SHA).

### 5. Display name

- New `User.displayName`, editable in a new **`/account/settings`** page, reached via a **Settings** entry in the signed-in menu (`/api/me` actions).
- OAuth sign-ins keep refreshing `User.name`; `displayName` is never touched by providers. Everywhere a person is shown (lead avatars, participant lists, attendance, minutes) the rule is `displayName ?? name ?? email local-part`.

## Workspace / GitHub provisioning (one-time, manual)

1. **Google Cloud project** (any name, e.g. `verana-foundation-site`) with the **Google Calendar API enabled**.
2. **Service account** in that project; create a **JSON key**. No IAM roles needed.
3. **Domain-wide delegation** in the Workspace Admin console (Security → Access and data control → API controls → Domain-wide delegation): authorize the service account's **client ID** for scope `https://www.googleapis.com/auth/calendar.events`.
4. **Role account** `meetings@verana.io` (a normal Workspace user; needs a Meet-enabled license). All WG events live on its primary calendar; it is the organizer and Meet host.
5. **GitHub**: public repo `verana-labs/working-groups`; fine-grained PAT (or GitHub App) with **Contents: read/write** on that single repo.
6. Environment:

```text
GOOGLE_SA_EMAIL=…@….iam.gserviceaccount.com
GOOGLE_SA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…"   # from the JSON key
GOOGLE_CALENDAR_IMPERSONATE=meetings@verana.io
MINUTES_REPO=verana-labs/working-groups
MINUTES_GITHUB_TOKEN=github_pat_…
```

## Data model summary (additions)

```text
User          { + displayName? }
WorkingGroup  { + slug (unique), leads[], participants[], schedule?, sessions[] }
WgLead        { wgId, userId, addedByUserId, @@unique(wgId,userId) }
WgParticipant { wgId, userId, joinedAt, leftAt?, @@unique(wgId,userId) }
WgInvite      { wgId, email, role (lead|participant), invitedByUserId?, acceptedAt?, @@unique(wgId,email) }
WgSchedule / WgScheduleException / WgSession / WgSessionAttendee   (as above)
```

`requiredClass`, the computed-access rule, and admin enable/disable/showOnHome behaviour are unchanged.

## Rollout phases

| Phase | Scope | Size |
|---|---|---|
| 0 | `displayName` + Settings page; `slug` backfill; `WgLead` + admin lead picker; lead avatars on cards | S |
| 1 | `WgParticipant`, join/leave; `/working-groups/<slug>` page; lead console (description, link, leads, participants) | M |
| 2 | `WgSchedule` + exceptions; lead schedule editor; Google Calendar sync (recurring event, attendees, auto-Meet, native invites, per-occurrence cancellation) | M–L |
| 3 | `WgSession` + attendance; Markdown notes editor with drafts; GitHub publish; public session history | M |

## Security & privacy

- Authorization for every lead/participant action is checked server-side per request: lead actions require a `WgLead` row; participant actions require an active `WgParticipant` row **and** a passing `canAccessWg`.
- The service-account key is delegated to **one scope** (`calendar.events`) and impersonates **one role account**; it can touch nothing else in the Workspace. Store the key only in env/secrets, never in the repo.
- Meet links of gated groups appear only in Calendar invites (delivered to participants) and signed-in participant pages — never on public pages.
- Published minutes are public by design (public repo + public history page) — the publish action says so explicitly in the UI. Attendance lists name people; joining a WG implies consent to appear in invites and minutes, stated on the join action.
- All mutations audited via `AdminAction`.

## Consequences

**Positive**

- Real calendar-native UX from day one: auto-created Meet links, invitations/cancellations delivered by Google to Google *and* non-Google calendars, RSVP in the attendee's own client — zero invite plumbing in our codebase.
- One organizer (`meetings@verana.io`) owns every meeting: host rights and recordings survive any lead change.
- GitHub gives minutes an immutable, citable, fork-able public history at zero storage cost; the DB keeps reads fast and the site independent of GitHub availability.
- Leads are self-managing (schedule, membership, minutes) — admins stop being a bottleneck after creation.

**Negative / risks**

- A Google-side dependency for scheduling writes: mitigated by DB-first writes with visible `syncError` + retry; reads never call Google.
- A powerful credential (DWD service-account key) to provision and rotate — scoped to `calendar.events` and a single impersonated user to bound the blast radius.
- Attendee fan-out counts against the role account's Calendar quotas; fine at WG scale (tens of attendees), revisit if groups reach hundreds.
- A second token with repo write access (`MINUTES_GITHUB_TOKEN`) must be provisioned and rotated; scope it to the single minutes repository.
