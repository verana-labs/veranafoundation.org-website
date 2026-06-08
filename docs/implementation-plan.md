# Implementation plan — membership, billing & accounts

- **Status:** Proposed
- **Date:** 2026-06-08
- **Implements:** [ADR-0001](./adr-0001-subscription-billing-architecture.md) (billing), [ADR-0002](./adr-0002-authentication.md) (auth), [verana-invoicing-spec.md](./verana-invoicing-spec.md) (memberships/invoices), [frontend-account-admin-spec.md](./frontend-account-admin-spec.md) (UI).

## Starting point

Today the site is **stateless**: Next.js 15 App Router + Tailwind v4, no database, no auth, no payments, no email (the only backend touch is the contact form → Relaticle). This work introduces **stateful infrastructure** — a database, sessions, webhooks, and an admin surface — which is the bulk of the effort and drives the phasing.

## Locked decisions

| Concern | Choice |
|---|---|
| App boundary | **Same Next.js app** — `(marketing)` static/cached, `(app)` + `/api` dynamic |
| ORM | **Prisma** + migrations |
| Auth | **Auth.js v5** — Google, GitHub, email magic link; verified-email-keyed |
| Email | **Resend** (magic links, receipts, notifications) |
| Payments | **Stripe** Invoicing + Tax + Customer Portal, behind a `PaymentProvider` port; + offline bank-transfer adapter |
| Database | **In-cluster Postgres** |
| Scheduled jobs | **k8s CronJob → protected endpoint** (renewal reminders, reconciliation) |

## Data model (Prisma)

From the specs: `User`, Auth.js `Account`/`Session`/`VerificationToken`, `Member`, `Membership`, `UserMember` (role), `MemberAccess` (org allowlist, role), `Invoice`, `Payment`, `SignatureRecord`, `WorkingGroup`, `AgreementDocument`, and an `AdminAction` audit log.

## Phases

Each phase is independently shippable; value lands before money does.

### Phase 0 — Foundations

- Add deps: `prisma`, `@prisma/client`, `next-auth@beta`, `@auth/prisma-adapter`, `resend`, `zod`.
- `prisma/schema.prisma` (full model) + first migration; `app/lib/db.ts` (HMR-safe client).
- Local Postgres via `docker-compose.yml`; `DATABASE_URL` + new keys in `.env.example`.
- k8s: Postgres manifest (StatefulSet + Service + Secret) + env wired into `deployment.yaml`.
- Restructure `app/` into route groups: `(marketing)` (static, unchanged) vs `(app)` (dynamic).
- **Exit:** migrations run locally and in-cluster; app boots with a DB connection.

### Phase 1 — Auth (ADR-0002)

- Auth.js v5: Google + GitHub + email magic link; Prisma adapter; **verified-email linking** with the safety rule + GitHub primary-verified handling.
- Admin allowlist; member-scoped roles via `UserMember`; **middleware route guards** (`/account/**`, `/account/org/**`, `/admin/**`).
- `/login`, app shell + org switcher, rate-limited magic-link endpoint.
- **Exit:** all three methods sign in to one verified-email-keyed account; guards enforced server-side; the verified-only linking test passes.

### Phase 2 — Membership core + free Contributor flow (no payments)

- `/apply` for individuals + Contributor orgs: **display the Membership Agreement PDF** (active `AgreementDocument`) → accept → sign → create `Member`/`Membership` → seed first `MemberAccess{ manager }` → active → emit `entitlement.changed` → email copy.
- `MemberAccess` **auto-link on signup**; org `/account/org/[id]/access` (admins + representatives, last-admin safeguard).
- **Entitlements API** (`/v1/entitlements?subject=`) + canonical events; `/account` dashboard, profile, working-groups.
- `WorkingGroup` entity + admin CRUD (incl. external `link`); `/admin/settings` to manage the `AgreementDocument` URL/version.
- **Exit:** an individual and a Contributor org can join, an org admin can manage its access list, and WG access reflects entitlements end-to-end — with zero payment code.

### Phase 3 — Associate (paid) + Stripe

- `PaymentProvider` port + Stripe Invoicing/Tax adapter + offline bank-transfer adapter.
- Apply-as-Associate: tier → invoice → hosted pay → webhook → active; VAT ID + VIES via Stripe Tax; billing page → **Stripe Customer Portal**.
- Admin: invoices, mark bank transfer paid, waivers/overrides, suspend/reinstate.
- **Exit:** a paying Associate org completes signup→invoice→payment→active; reverse charge applied for valid EU VAT IDs.

### Phase 4 — Lifecycle & polish

- Renewal reminders + dunning via k8s CronJob → protected endpoint; reconciliation poll.
- Notifications (in-app + email); admin dashboard, members, audit log, admin-allowlist UI.
- Executed-agreement **PDF generation** for the emailed copy.
- **Exit:** memberships renew/expire/suspend automatically; admins have full visibility.

## The Membership Agreement document (configurable)

The agreement shown during `/apply` is a **PDF at an admin-configurable URL**, stored as `AgreementDocument { version, url, hash?, active, effectiveFrom }`:

- Applicants **view and explicitly accept** the active PDF before signing.
- The `SignatureRecord` captures the **version + URL + hash** that were accepted.
- Publishing a new version is a config change (update the URL/version in `/admin/settings`) — **no deploy**; existing signatures keep the version they signed.

## Cross-cutting

- **Validation:** `zod` on every form + API boundary.
- **Audit:** every admin/manager mutation → `AdminAction` log.
- **Security:** rate-limit magic links; verified-only account linking (tested); card data never touches us (PCI SAQ-A via hosted pay pages); webhook signature verification + idempotency.
- **Caching:** `(app)`/`/api` routes are dynamic/no-store; marketing pages stay static.
- **Testing:** unit (entitlement resolution, WG access, VAT treatment), the verified-email-linking safety test, and Stripe webhook handling against fixtures.

## Process

- Work on **feature branches**, one per phase (e.g. `feat/membership-phase-0`), merged via PR — same flow as these docs.
- **Secrets:** all CI/CD secrets live in **GitHub Actions secrets** and are injected into the deployment Secret at deploy time. **Nothing in cleartext** in the repo — no secrets in workflows, manifests, or committed `.env*` (which stay gitignored). Local dev uses `.env.local`; only `.env.example` (placeholder keys, no values) is committed.
