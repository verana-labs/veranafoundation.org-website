# ADR-0002 — Authentication & authorization (passwordless, verified-email-keyed)

- **Status:** Proposed
- **Date:** 2026-06-08
- **Deciders:** Fabrice (Verana / 2060)
- **Depends on / blocks:** dependency of the membership invoicing module ([verana-invoicing-spec.md](./verana-invoicing-spec.md)) and admin tooling.

## Context

To handle subscriptions and admin access on veranafoundation.org we need identity for two audiences:

- **Members** — orgs/individuals who return occasionally (renew, download invoices, manage membership, reach Working Groups). Enabled from day one.
- **Admins** — a small fixed set of Foundation staff doing sensitive operations (issue/void invoices, waivers, tier overrides).

Both must be **passwordless**. We do not want to store or secure passwords.

## Decision

**Authorize on the verified email address, not on the sign-in provider.** The provider only proves "you own this email."

- **Sign-in methods (all passwordless):** Google OAuth, GitHub OAuth, and email **magic link**. All three resolve to a single thing: a **verified email**.
- **Identity key = verified email.** One account per email; multiple methods collapse to one user.
- **Authorization:**
  - `admin` if the verified email ∈ the **admin allowlist** (a config list of emails),
  - `member` if the verified email is linked to a `Member`,
  - an email may be both.
- **Library:** [Auth.js (NextAuth)](https://authjs.dev/) in the existing Next.js app — email + OAuth providers, httpOnly cookie sessions, one `users` table.

Admins and members use the **same login screen and the same buttons**; only what their email is *authorized for* differs. No provider-specific logic leaks into authorization.

## The rule that makes this safe

> **Never authorize on an unverified email. Auto-link accounts by email only because every enabled method yields a verified email.**

Per method:

| Method | Email verification | Notes |
|---|---|---|
| Google | Always verified, stable | Clean. |
| Magic link | Verified by construction (clicked link to that address) | Clean. |
| GitHub | Must fetch via `user:email` scope and use the **`primary && verified`** address | Reject unverified; `@users.noreply.github.com` users can't match a work-email allowlist. |

Auto-linking by email is an account-takeover vector **if** any method can present an unverified email. Because all three above are verified (with the GitHub primary-verified rule enforced), linking-by-email is safe.

## Authorization model

Two scopes of authorization:

**Foundation-level role**

- `admin` if the verified email ∈ the **admin allowlist** (config/env or a small `admins` table, editable without deploy). The allowlist is the *only* admin grant.

**Member-scoped role** — a user's role *within* a `Member` (via `UserMember`)

- `manager` (org admin) — manage the org profile, billing/invoices, and the **access list** (add/remove both managers/admins and representatives); also participates in WGs.
- `representative` — participates in WGs and sees their own profile; no billing or management.
- An **individual** member is the sole `manager` of their own `Member`.
- A user may be linked to several `Member`s with different roles in each, and may also be `admin`.

**Route protection (middleware):**

- `/account/**` → any member-scoped role
- `/account/org/**` (billing, access list) → `manager`
- `/admin/**` → `admin`

## Identity model — org, people, and representatives

A *person* logs in; for an organization the contracting party is the `Member`. The people who participate on its behalf are **Member Representatives** (Agreement §1.20), and the Member is responsible for them (§3.6). The org's **admins (`manager`)** maintain a single **access list** of emails, each with a role — **admins** (`manager`) and **endorsed representatives** (`representative`, usually employees). Anyone on the list gets access by simply creating an account, and admins can add/remove both representatives and other admins.

```text
User   { id, email (verified, unique), name, createdAt }     # login identity
Member { ... }                                                # contracting party (org or individual)

UserMember {                                                  # who can act for a Member, and how
  userId, memberId,
  role: "manager" | "representative"
}

MemberAccess {                                        # org-managed email allowlist
  memberId, email,                                            # authorized representative
  role: "manager" | "representative",
  addedByUserId, addedAt,
  status: "invited" | "active" | "removed"
}
```

**How access works:**

1. On signup, the signer's email is seeded as the first `MemberAccess{ role: manager }` — the org's first **admin**.
2. **Admins (`manager`) maintain the access list:** add/remove **admin emails** (`manager`) and **endorsed/representative emails** (`representative`, usually employees). Admins can add and remove other admins.
3. When a person signs in with a **verified email** matching an active `MemberAccess` entry and not yet linked, they are **auto-linked** via `UserMember` with that entry's **role** — no approval step. (Optionally we email "you've been added to {Org}, sign in".)
4. A `representative` **inherits the org's membership entitlement** (WG access) with no billing or management rights; a `manager` additionally manages the org profile, billing, and the access list.
5. Removing an email **revokes** the link; entitlements recompute (WG access lost if no other qualifying membership remains).
6. **Safeguard:** an org must keep at least one active `manager` — the system refuses removal or demotion of the last admin.

**Optional accelerator:** an org may allow auto-join by **verified email domain** (anyone `@org-domain`) instead of, or in addition to, the explicit list. The same verified-email safety rule applies.

**Entitlement resolution:** entitlement is held by the `Member`; a `User`'s **effective membership set** = the active memberships across *all* their `UserMember` links (their own plus every org that lists them — an email may be entitled by several organizations). A user needs **at least one** qualifying membership to act — one entitlement among many is enough. In the ADR-0001 contract the `subject` is the `Member`; the app resolves *user → members → entitlements*. Individual Contributors link to their own `Member`.

## Working Group access

WG access is **computed** from the user's effective membership set, not stored per user. A **Working Group is a first-class entity** managed by Foundation admins; it declares the membership class it requires and the external space it links to:

```text
WorkingGroup {
  id, name, description,
  requiredClass: "any" | "associate",
  link                                 # external URL to the WG's space
}
```

- **Open WGs** (`requiredClass: any`) — accessible with **any** active membership (Associate *or* Contributor).
- **Associate-only WGs** (`requiredClass: associate`) — require **at least one active Associate** membership.
- **Access check** for user `U` and WG `W`:
  `∃ link ∈ U.UserMember where membership.status = active AND membership.class satisfies W.requiredClass`
  (provisional pre-incorporation memberships have `status = active`, so they qualify — §2.4(c).)
- Because the rule is "at least one," a user entitled through several organizations keeps access as long as **any** qualifying membership stays active; losing or downgrading one membership only removes access when no other link still satisfies the WG's `requiredClass`.

## Security baseline

- httpOnly, Secure, SameSite cookies; CSRF protection (Auth.js defaults).
- **Rate-limit** the magic-link / OTP request endpoint (per email + per IP).
- Short-lived, single-use magic-link tokens.
- Admin 2FA is inherited from the IdP (Google/GitHub) — we don't build it.
- **Admin action audit log** for all mutations (extends the `SignatureRecord` pattern): `who (userId/email), action, target, before/after, at, ip`.

## Consequences

**Positive**

- No passwords to store or breach; minimal surface.
- Provider-agnostic authz — adding/removing a sign-in method never touches authorization.
- One login serves both audiences; admin grant is a one-line allowlist edit.

**Negative / risks**

- Auto-link-by-email **must** enforce verified-only (the core safety rule) — a regression here is an account-takeover bug. Cover with a test.
- GitHub email handling needs the primary-verified fetch; document in the provider config.
- Email deliverability matters for magic links (members) — use a reliable transactional sender; monitor bounces.

## v1 scope

In: 3 passwordless methods → verified email → account; Foundation `admin` allowlist; **org `manager`/`representative` roles with an admin-managed access list (admin + representative emails) and auto-link-on-signup**; optional verified-domain auto-join; route guards; `User↔Member` link; audit log; rate limiting.
Out: passwords; fine-grained per-WG permissions; approval/invitation workflows beyond email auto-link; SCIM/enterprise provisioning.

## Open items

- Seed the initial admin allowlist (founding staff emails).
- Transactional email sender for magic links (same one used for executed-PDF/receipt emails).
