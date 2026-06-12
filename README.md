# veranafoundation.org

The institutional website of the **Verana Foundation** — the non-profit steward of
the open trust layer. The Foundation owns the specifications, stewards the
open-source software (Apache 2.0), grows the ecosystem (grants, devrel,
partnerships), and runs two membership classes (Associate and Contributor).

Built with **Next.js 15** (App Router, standalone output) and **Tailwind CSS v4**,
backed by **PostgreSQL** via **Prisma**. Sister site to
[veranacouncil.org](https://github.com/verana-labs/veranacouncil.org-website):
it shares the information architecture but has its own *open-source commons*
personality (Space Grotesk display type, purple + green palette, GitHub-flavored
layout).

> The Foundation is **in formation**, stewarded by 2060 OÜ pre-incorporation.

## Features

### Public site

- **Home** — live GitHub organization statistics (repos, stars, contributors
  wall with real avatars; daily ISR, authenticated API calls) and the featured
  working-group board (client-fetched so it's always current).
- **Working groups** (`/working-groups`, [ADR-0003](docs/adr-0003-working-groups.md)) —
  the public board plus a page per group (`/working-groups/<slug>`): description,
  lead avatars, meeting schedule, published minutes. Old URLs (`/contribute`,
  `/account/working-groups`) redirect permanently.
- **Members** (`/members`) — admin-curated list of member organizations (logo wall).
- **About · Join · Ecosystem · Contact · Blog** — institutional pages; the Join
  comparison table quotes Associate dues **from the fee schedule in force** (it
  can never disagree with what the apply flow charges).
- **Legal** — privacy, terms, cookies.

### Accounts & authentication ([ADR-0002](docs/adr-0002-authentication.md))

- **Passwordless sign-in**: Google OAuth, GitHub OAuth, or an emailed one-time
  code. Authorization is keyed on the **verified email**, never the provider;
  multiple methods collapse into one account.
- **Settings** (`/account/settings`) — user-chosen display name (provider names
  are never overwritten); used on working-group pages, attendance and minutes.
- Route protection in middleware: `/account/**` requires a session, `/admin/**`
  requires the admin allowlist.

### Membership & billing ([ADR-0001](docs/adr-0001-subscription-billing-architecture.md), [invoicing spec](docs/verana-invoicing-spec.md))

- **Application & e-signature** (`/apply`) — organization or individual;
  Contributor (free) or Associate (dues by headcount tier). The applicant signs
  a **personalized PDF** of the Membership Agreement; the exact signed copy is
  stored verbatim (PVC) with audit metadata (hash, IP, user agent).
- **Versioned agreements** — one Markdown template per version in `legal/`,
  hash-pinned at first activation so a signed version can never silently change.
  Admins switch the active version in `/admin/settings` — **the single switch**
  that flips both the legal text and the fee schedule (Annex D and pricing are
  asserted in sync by tests).
- **Invoicing & VAT** — sequential invoice numbers (`VF-…`), EU VAT logic
  (domestic / reverse-charge / outside scope), PDF invoices, fee-schedule
  version stamped per invoice.
- **Payments** — Stripe Checkout (card) at `/pay/{invoiceId}` with webhook
  confirmation, or direct **bank transfer** auto-reconciled against the **Wise**
  activities feed (webhook + daily cron backstop).
- **Dunning** — daily cron: payment reminders on a fixed cadence, then invoice
  void + membership expiry; renewal invoices issued ahead of period end.
- **Organizations** — self-managed access lists (`manager` / `representative`),
  auto-link on first verified sign-in, "last admin" safeguard, and email
  notifications when someone is added or promoted.

### Working groups (members)

- **Join/leave in one click** — eligibility computed from active memberships
  across every organization the user belongs to (`requiredClass`: any vs
  Associate-only).
- **Leads** — assigned by Foundation admins, then self-managed; a group can
  never drop to zero leads; mutations audited.
- **Meetings via Google Calendar** — the lead sets a recurring schedule
  (weekly / biweekly / monthly, timezone-aware); the site maintains one Google
  Calendar event as the `meetings@` role account: auto-created **Google Meet**
  link, **native invitations** to Google/Microsoft/Apple calendars on join,
  updates on change, and single-occurrence cancellation ("skip next week").
  The DB is canonical; sync failures are stored and retryable from the UI.
- **Sessions & minutes** — any participant records attendance (+ guests) and
  Markdown minutes; **publishing commits the file to the public minutes repo**
  (`<slug>/minutes/YYYY-MM-DD.md`, commit SHA stored) and the history renders
  on the group page from the DB.

### Admin (`/admin`, allowlist-gated)

- **Members** — browse/search, member detail, membership actions.
- **Invoices** — list, mark bank transfers paid, reissue void invoices.
- **Working groups** — CRUD, required class, home-page flag, priority,
  enable/disable, lead management.
- **Admins** — manage the admin allowlist (the only admin grant).
- **Settings** — activate a Membership Agreement version (= fee schedule).
- **Audit** — every sensitive mutation (admin or lead) lands in `AdminAction`.

## Architecture & third-party integrations

| Service | Used for | Notes |
| --- | --- | --- |
| **PostgreSQL** (in-cluster) | All state (Prisma) | Migrations applied by a CI job before each rollout |
| **Google / GitHub OAuth** | Sign-in | Verified-email rule enforced (GitHub primary-verified fetch) |
| **SMTP** (Google Workspace) | All transactional email | One-time codes, agreement copy, invoices/receipts, dunning, org-access notices; branded shared layout |
| **Stripe** | Card payments for dues | Checkout + webhook; bank-transfer feature off (prohibited category) |
| **Wise Business API** | Bank-transfer reconciliation | Read-only activities feed; webhook (`balances#credit`) + daily cron backstop |
| **Relaticle CRM** | `/contact` inquiries | Company/Person/Note/Opportunity/Task per inquiry; best-effort, never blocks the user |
| **Google Calendar API** | Working-group meetings | Service account + domain-wide delegation impersonating the `meetings@` role account; auto Meet links, native invites |
| **GitHub API** | Minutes publishing + home stats | Fine-grained PAT scoped to the minutes repo; same token raises the stats rate limit |
| **Discord/Slack webhook** | Ops alerts | Optional; CRM/reconciliation failures |

**Reliability conventions** used throughout: the database is the system of
record; external calls happen after the DB transaction commits and are
**best-effort** (failures logged/alerted/retryable, never user-facing errors);
marketing pages render static fallbacks when third parties are unreachable, so
the build and runtime never depend on an external service being up.

## Local development

Prerequisites: **Node 22** (`nvm use`), **Docker** (for Postgres).

```bash
npm install
cp .env.example .env.local   # fill in what you need (see appendix)
npm run db:up                # Postgres via docker/compose.yaml
npm run db:migrate           # apply Prisma migrations
npm run db:seed              # bootstrap admins (ADMIN_BOOTSTRAP_EMAILS) + agreement catalog
npm run dev                  # http://localhost:3000
```

Almost everything degrades gracefully without secrets: with an empty
`.env.local` (plus `DATABASE_URL` and `AUTH_SECRET`) the site runs; email
logs instead of sending, CRM/Calendar/minutes integrations no-op with a
visible notice. Add credentials only for the flows you're working on.

```bash
npm test                     # vitest
npm run build && npm start   # production build (standalone)
npm run db:studio            # Prisma Studio
```

Container:

```bash
docker build -t veranalabs/veranafoundation.org-website:local .
docker run --rm -p 3000:3000 veranalabs/veranafoundation.org-website:local
```

## Deployment

Runs on the OVH Kubernetes cluster, namespace `web` (manifests in `k8s/`).

- **`docker-publish.yml`** — type-check + build on every PR/push; on push to
  `main` and on `v*` tags, builds the `linux/amd64` image, pushes to Docker Hub
  (`veranalabs/veranafoundation.org-website`), **upserts the
  `veranafoundation-website-secrets` k8s Secret from GitHub Actions secrets**,
  applies `k8s/`, runs the **db-migrate Job** (Prisma `migrate deploy`), the
  **seed Job** (admin allowlist + agreement catalog, idempotent), then restarts
  the app StatefulSet.
- **`release-please.yml`** — maintains a release PR from Conventional Commits;
  merging tags `v*` and announces on Discord.
- **CronJobs** — `wise-reconcile` daily 06:00 UTC (bank-transfer backstop),
  `dunning` daily 06:30 UTC (reminders, voiding, renewals).
- **Storage** — a PVC mounted at `/data` (`STORAGE_DIR`) holds signed agreement
  PDFs and uploaded member logos.
- **Secrets flow** — GitHub Actions secrets → CI `kubectl create secret …
  --dry-run | apply` → `secretKeyRef` env entries in `k8s/statefulset.yaml`
  (all `optional: true`, so pods boot while a credential is still missing).
  To add a variable, touch **all three**: `.env.example` (docs),
  `docker-publish.yml` (env + `--from-literal`), `k8s/statefulset.yaml`.

## Appendix — configuration reference

Where: **local** = `.env.local`; **secret** = GitHub Actions secret → k8s Secret;
**manifest** = plain value in `k8s/statefulset.yaml`; **CI** = used by workflows only.

### Core

| Variable | Required | Where (prod) | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | derived by CI from `POSTGRES_PASSWORD` | Postgres connection (Prisma) |
| `POSTGRES_PASSWORD` | yes | secret | In-cluster Postgres password; CI derives `DATABASE_URL` |
| `AUTH_SECRET` | yes | secret | Auth.js session/JWT key (`openssl rand -base64 32`) |
| `AUTH_URL` | yes | manifest (`https://veranafoundation.org`) | Canonical base URL — also the base for every absolute link in emails/PDFs |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | for Google sign-in | secret | Google OAuth app |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | for GitHub sign-in | secret | GitHub OAuth app |
| `STORAGE_DIR` | yes | manifest (`/data`, PVC) | Signed agreement PDFs, member logos (local default `./var/storage`) |
| `ADMIN_BOOTSTRAP_EMAILS` | first run | secret | Comma-separated emails seeded into the admin allowlist |
| `AGREEMENT_FILENAME` | no | — | Which `legal/` version the seed activates (default `membership-agreement-v1.md`) |

### Email (SMTP)

| Variable | Required | Where (prod) | Purpose |
| --- | --- | --- | --- |
| `MAIL_HOST` / `MAIL_PORT` | for email | manifest (`smtp.gmail.com` / 587) | SMTP server (587 = STARTTLS, 465 = SSL) |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | for email | secret | Workspace account + **App Password** |
| `MAIL_ENCRYPTION` | no | — | `ssl` to force SSL on non-465 ports |
| `MAIL_FROM_ADDRESS` / `MAIL_FROM_NAME` | no | manifest | From header (`no-reply@veranafoundation.org` / `Verana Foundation`); Gmail must be allowed to "send as" this address |
| `EMAIL_LOGO_URL` | no | — | Hosted PNG for email headers (unset → text wordmark) |

### Billing

| Variable | Required | Where (prod) | Purpose |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | for card payments | secret | Checkout + `/api/webhooks/stripe` |
| `STRIPE_BANK_TRANSFER` / `STRIPE_BANK_TRANSFER_COUNTRY` | no | — | Stripe's own bank-transfer method (keep `off`: prohibited for this account category) |
| `SELLER_LEGAL_NAME` / `SELLER_COUNTRY` / `INVOICE_PREFIX` | yes | manifest | Invoicing entity + number prefix (`VF-`) |
| `SELLER_VAT_NUMBER` | yes | secret | Seller VAT ID on invoices |
| `VAT_DOMESTIC_RATE` | yes | manifest (`0.24`) | Estonian VAT rate |
| `BANK_TRANSFER_DETAILS` | for wire payments | secret | Beneficiary/IBAN/BIC shown to bank payers |
| `WISE_API_TOKEN` / `WISE_PROFILE_ID` | for auto-reconcile | secret | Wise Business read-only API |
| `WISE_WEBHOOK_PUBLIC_KEY` | for the webhook | secret | Verifies `/api/webhooks/wise` signatures |
| `WISE_API_URL` / `WISE_RECONCILE_DAYS` | no | — | Sandbox URL override / look-back window (default 14) |
| `CRON_SECRET` | yes | secret | Bearer guard for `/api/cron/*` endpoints |

### Working groups

| Variable | Required | Where (prod) | Purpose |
| --- | --- | --- | --- |
| `GOOGLE_SA_EMAIL` | for Calendar sync | secret | Service-account email |
| `GOOGLE_SA_PRIVATE_KEY` | for Calendar sync | secret | SA key PEM (`\n`-escaped); DWD scope `calendar.events` |
| `GOOGLE_CALENDAR_IMPERSONATE` | for Calendar sync | secret | Role account organizing all WG meetings (e.g. `meetings@veranafoundation.org`) |
| `MINUTES_REPO` | for publishing | secret | Public minutes repo (`verana-labs/working-groups`) |
| `MINUTES_GITHUB_TOKEN` | for publishing | secret | Fine-grained PAT, Contents RW on that repo only; also the fallback token for home-page stats |
| `GITHUB_TOKEN` | no | — | Optional explicit token for the home-page org stats |

### CRM & ops

| Variable | Required | Where (prod) | Purpose |
| --- | --- | --- | --- |
| `RELATICLE_API_URL` | for contact→CRM | manifest (in-cluster URL) | Relaticle REST base |
| `RELATICLE_API_TOKEN` | for contact→CRM | secret | Sanctum token (team `2060`) |
| `ALERT_WEBHOOK_URL` | no | — | Discord/Slack-compatible ops alerts |

### CI-only (GitHub Actions repo secrets)

| Secret | Purpose |
| --- | --- |
| `DOCKER_HUB_LOGIN` / `DOCKER_HUB_PWD` | Push images to Docker Hub |
| `OVH_KUBECONFIG` | Deploy to the OVH cluster |
| `DISCORD_UPDATES_WEBHOOK_URL` | Release announcements |
| *(plus every app secret above — CI injects them into the k8s Secret)* | |

## Content & design docs

- Page-by-page content spec: `verana-strategy/2026/foundation-website/spec.md`
- Architecture decisions: [`docs/adr-0001`](docs/adr-0001-subscription-billing-architecture.md) (billing),
  [`docs/adr-0002`](docs/adr-0002-authentication.md) (auth/roles),
  [`docs/adr-0003`](docs/adr-0003-working-groups.md) (working groups),
  plus the [invoicing spec](docs/verana-invoicing-spec.md) and
  [frontend spec](docs/frontend-account-admin-spec.md).

## License

Apache-2.0. Site text CC-BY-SA 4.0; brand assets CC-BY 4.0.
