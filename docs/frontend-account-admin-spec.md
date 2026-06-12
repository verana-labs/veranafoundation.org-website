# Frontend spec — Account & Admin areas (proposed)

- **Status:** Proposed
- **Date:** 2026-06-08
- **Implements UI for:** [ADR-0001](./adr-0001-subscription-billing-architecture.md) (entitlements), [ADR-0002](./adr-0002-authentication.md) (auth/roles/access list), [verana-invoicing-spec.md](./verana-invoicing-spec.md) (memberships, invoices).
- **Stack:** existing Next.js App Router site + Tailwind; Auth.js sessions; reuse current design tokens (`card`, `btn`, `badge`, `display`, `text-muted`, `accent-line`).

## Scope & principles

Two authenticated areas on top of the public marketing site:

- **Account** (`/account/**`) — members manage their own membership(s); org admins manage their organization.
- **Admin** (`/admin/**`) — Foundation staff manage members, invoices, working groups, and the admin allowlist.

Principles:

- **Thin billing UI** — hand off invoice/payment-method/receipt management to the **Stripe Customer Portal** (a button that opens a portal session); we don't rebuild it.
- **Role-gated, server-enforced** — middleware guards routes (ADR-0002); never rely on hiding UI alone.
- **Multi-membership aware** — a user may belong to several orgs *and* hold an individual membership; pages aggregate or scope-by-org accordingly.
- **Every admin mutation is audited** (writes to the admin/manager action log).

## Route map

| Route | Guard | Purpose |
|---|---|---|
| `/login` | public | Passwordless: Google · GitHub · magic link |
| `/apply` | public | Onboarding/sign flow (creates `Member`) — see below |
| `/account` | member-scoped role | Dashboard: your memberships + WG access |
| `/account/profile` | member | Your user profile + connected sign-in methods |
| `/working-groups` · `/working-groups/[slug]` | public (richer when signed in) | WG board + per-group pages (join, schedule, minutes) — replaced `/account/working-groups`; see ADR-0003 |
| `/account/org/[memberId]` | `manager` of that org | Org overview |
| `/account/org/[memberId]/access` | `manager` | Manage Admins + Representatives lists |
| `/account/org/[memberId]/billing` | `manager` | Invoices, VAT ID, Stripe portal handoff |
| `/account/org/[memberId]/profile` | `manager` | View org details (read-only; Contact us to change) |
| `/admin` | `admin` | Foundation dashboard |
| `/admin/members` · `/admin/members/[id]` | `admin` | Browse/search members; member detail + actions |
| `/admin/invoices` | `admin` | All invoices; reconcile bank transfers |
| `/admin/working-groups` | `admin` | CRUD working groups (`requiredClass`, external link, description) |
| `/admin/admins` | `admin` | Manage the Foundation admin allowlist |
| `/admin/settings` | `admin` | App settings — incl. the **Membership Agreement** PDF URL + version |
| `/admin/audit` | `admin` | Admin/manager action log |

## Onboarding entry (`/apply`, public — summary)

Not part of the authenticated areas but the path that *creates* accounts (full detail in the invoicing spec):

- Branch **individual** vs **organization**, and class (Contributor / Associate).
- **Displays the Membership Agreement** inline — the **PDF at the admin-configured URL** (active `AgreementDocument`); the user must view it and explicitly accept. The signature records the agreement **version + URL + hash**, so swapping the config to a new PDF only affects future signatures.
- Email OTP verify → fill fields → accept the agreement → type name to sign (`SignatureRecord`).
- **Optional consent** — a checkbox to let the Foundation announce the membership on its social networks (`socialAnnouncementConsent`). Organizations may also provide an optional **logo** (`logoUri`) for future homepage display.
- Creates `Member` (+ `Membership`), seeds the signer as first `MemberAccess{ role: manager }`, signs them in, emails the executed PDF.
- Associate → continues to invoice/payment before activation.

## Account area (member-facing)

### `/account` — Dashboard

This is the canonical place a user sees **which organizations they are a member of**. Memberships are grouped:

- **Your individual membership** (if any) — class badge, status pill.
- **Organizations you belong to** — one card per org `Member` you're linked to (via `UserMember`, derived from `MemberAccess`): org **legal name**, your **role** (admin / representative), class badge (Associate/Contributor), status pill (active / pending / past_due / suspended), `validUntil`. Managers get a **Manage** action (→ `/account/org/[memberId]`); for a representative the card is informational only (they have no org pages, so this is the *only* place they see the affiliation).

Plus:

- **Working Group access** — summary line ("You can access N working groups") → link to the public `/working-groups` board.
- **Action needed** banners — e.g. org `past_due` (if you're a manager) → "Pay outstanding invoice."
- **Empty state** — signed in but no membership: "You're not part of any membership yet. Ask your organization's admin to add your email, or [apply]." (Covers a verified user whose email isn't on any access list.)

### `/account/profile`

- Name, primary email; **connected sign-in methods** (Google / GitHub / email) with add/remove (must keep ≥1).
- No password anywhere.

### Working groups (superseded)

> The members-only `/account/working-groups` list described in earlier drafts
> was replaced by the public `/working-groups` board and per-group pages
> (leads, join/leave, Google-Calendar schedule, session minutes) —
> [ADR-0003](./adr-0003-working-groups.md). The computed access rule
> (ADR-0002 §Working Group access) is unchanged and gates joining.

## Organization admin (manager-only, scoped by `[memberId]`)

A switcher lets a user managing multiple orgs pick which one. All pages 403 unless the user is a `manager` of that `Member`.

### `/account/org/[memberId]` — Overview

- Org legal details (name, jurisdiction, address), membership class/tier, status, **next renewal date**, dues amount.
- Shortcuts to access list, billing, profile.

### `/account/org/[memberId]/access` — Access list (the core new UI)

- **Two lists** rendered from `MemberAccess`: **Admins** (`manager`) and **Representatives** (`representative`).
- Per row: email, status (`invited` / `active` / `removed`), added-by/when; actions: **remove**, **promote/demote** role.
- **Add emails** — paste one or many; choose role; (optional) toggle **verified-domain auto-join** (`@org-domain`).
- **Safeguard UI** — disable removing/demoting the **last active admin**; show explanatory tooltip.
- Pending vs active: an entry is `invited` until that person first signs in with the verified email (then `active`).
- Each change is audited.

### `/account/org/[memberId]/billing`

- **Invoices** table: number, period, gross, status (issued/paid/void), pay/download.
- **Pay / manage** → opens **Stripe Customer Portal** session (payment method, receipts, history).
- **VAT ID** field with validation status (see invoicing spec VAT validation); reverse-charge indicator.
- Bank-transfer invoices show the reference + instructions.

### `/account/org/[memberId]/profile`

- **Read-only** org details — legal name, jurisdiction, registered address, notice/billing email. Not self-serve for now: a **Contact us** action opens a change request (a Foundation admin makes the edit via the member detail page).
- VAT ID is managed on the **billing** page (it drives tax treatment), not here.

## Foundation admin area (`admin` only)

### `/admin` — Dashboard

- Counts: members by class & status; outstanding invoices (count/€); recent signups; memberships expiring soon.

### `/admin/members` + `/admin/members/[id]`

- **List:** searchable/filterable table (name, type, class, status, country, renewal).
- **Detail:** profile; memberships (class/tier/status/period); invoices; **access list** (read-only view of `MemberAccess`); **`SignatureRecord`** audit (who signed, verified email, version/hash, IP, time).
- **Actions** (each audited, per invoicing spec §Admin): issue / void invoice; **mark bank transfer paid**; apply **waiver / tier override** (Annex D.4–D.6); **suspend / reinstate** (§8); resend executed PDF / receipt.

### `/admin/invoices`

- All invoices; filter by status; **reconcile** view for open bank-transfer invoices → mark paid (→ activates membership, emits `payment.succeeded`).

### `/admin/working-groups`

- CRUD the `WorkingGroup` entity; set `name`, `description`, `requiredClass` (`any` | `associate`), and the **external `link`**. Changes affect computed access immediately.

### `/admin/admins`

- Manage the **admin allowlist** (emails). Add/remove; cannot remove the last admin. Audited. (This is the *only* grant of Foundation-admin rights — ADR-0002.)

### `/admin/settings`

- **Membership Agreement** — set the active `AgreementDocument`: **PDF URL** + **version** (and optional hash). Updating the URL **publishes a new version** for future applicants; existing `SignatureRecord`s keep the version they signed. Audited.
- Home for other app-level settings as they arise.

### `/admin/audit`

- Chronological action log: actor (email/userId), action, target, before/after, time, IP. Filter by actor/target/date.

## Shared components & states

- **App shell** — authenticated nav distinct from the marketing header; shows current user, org switcher (managers), sign-out.
- **Reusable:** `StatusPill` (membership status), `ClassBadge`, `RoleBadge`, `EmailListEditor` (used by both the org access list and the admin allowlist), `DataTable`, `ConfirmDialog`, `StripePortalButton`.
- **Every page:** loading skeleton, empty state, error state, and a **forbidden (403)** state for role mismatches.
- **Auth states:** unauthenticated → redirect to `/login?next=`; authenticated-but-unauthorized → 403 with guidance.

## Permissions matrix

| Capability | representative | manager (org admin) | Foundation admin |
|---|---|---|---|
| View own dashboard / WGs | ✓ | ✓ | ✓ |
| Access WGs (per class rule) | ✓ | ✓ | ✓ |
| Manage org access list | | ✓ | (via member detail) |
| View/pay org invoices | | ✓ | ✓ (all) |
| Edit org profile/VAT | | ✓ | ✓ |
| Issue/void/mark-paid invoices | | | ✓ |
| Waivers / tier override / suspend | | | ✓ |
| Manage WGs & admin allowlist | | | ✓ |

## Decisions

1. **Org scoping:** path-scoping with an **org switcher** (Option A), keyed by **org id** — `/account/org/[memberId]`, never the org name.
2. **Org info edits:** organization details (legal name, jurisdiction, address, notice/billing email) are **read-only** for org users for now — shown with a **Contact us** action to request a change; **Foundation admins** edit them via the member detail page. (Billing VAT ID stays manageable on the billing page, as it drives tax treatment.)
3. **Working Groups:** a first-class **`WorkingGroup` entity** managed by admins (name, description, `requiredClass`, **external `link`**); accessible WGs link out to that URL.
4. **Billing:** the **Stripe Customer Portal** covers member billing self-service; no bespoke billing screens.
5. **Notifications:** **in-app and email** — for "added to org", "invoice due/paid", "membership expiring", etc.

## Build order (aligns with invoicing spec)

1. Auth + app shell + `/login` + route guards.
2. `/account` dashboard + `/account/settings` + the public `/working-groups` board (ADR-0003).
3. Org `access` list management (the new multi-admin UI).
4. Org `billing` (Stripe portal handoff) — after the Associate payment flow exists.
5. Admin area: members → invoices → working-groups → admins → audit.
