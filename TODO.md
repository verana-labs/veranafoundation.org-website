# TODO — veranafoundation.org

Pending work for the membership / billing / accounts platform. Phases 0–3 of
[docs/implementation-plan.md](docs/implementation-plan.md) are largely shipped
(auth, `/apply` for individuals + Contributor + Associate, agreement signing +
versioned templates, Stripe invoicing + webhook, the `/account` and `/admin`
surfaces). What remains is mostly **Phase 4 (lifecycle & polish)** plus
cross‑cutting hardening and go‑live confirmations.

> Convention: `[ ]` not started · `[~]` partial · file paths point at the code.

---

## 1. Membership lifecycle & scheduled jobs (Phase 4 — biggest gap)

No scheduled-job infrastructure or renewal logic exists yet. Today only the
*initial* term is activated (`status: active`, `periodEnd = now + 1y` in
[`app/lib/invoices.ts`](app/lib/invoices.ts)); nothing renews, expires, or dunns.

- [ ] **Scheduled-jobs infra** — k8s `CronJob` → protected endpoint (shared-secret/header), per ADR-0001. Nothing under `app/api/*cron*` today.
- [ ] **Renewal** — before `periodEnd`, issue the next annual invoice; on payment, **renew in place** (extend `periodEnd`) on the single `Membership` (schema is now 1:1-ready). Contributor = €0 auto-renew.
- [ ] **Renewal reminders + dunning** — email reminders ahead of `periodEnd`; chase unpaid Associate invoices (`past_due`).
- [ ] **Auto-expire** — move active→`expired` when `periodEnd` passes with no payment; revoke WG access accordingly.
- [ ] **Bank-transfer reconciliation poll** — currently an admin manually marks paid in `/admin/invoices`; add the reconcile job the plan calls for.

## 2. Entitlements API & canonical events

- [ ] **`GET /v1/entitlements?subject={memberId}`** — canonical entitlement object (`status`, `plan`, `validUntil`). Not implemented (no `app/api/.../entitlements` route). Currently entitlement is resolved internally in [`app/lib/working-groups.ts`](app/lib/working-groups.ts).
- [ ] **Emit events** — `entitlement.changed`, `invoice.issued`, `payment.succeeded/failed`, `membership.renewed`, `membership.expired` (idempotent, dedupe on id), per ADR-0001 §events. No emission today.

## 3. Notifications

- [ ] **In-app notifications UI** — the `Notification` model exists in the schema but is unused (no UI, nothing writes to it). Build the write path + an `/account` surface.
- [~] **Email notifications** — executed-agreement + admin agreement-integrity alerts exist; add membership lifecycle emails (renewal, expiry, payment failed, cancellation confirmation).

## 4. Billing / VAT / tax hardening

- [ ] **Confirm Estonian VAT rate + 2060 OÜ VAT registration** with the accountant before go-live — see the `CONFIRM` note in [`app/lib/vat.ts`](app/lib/vat.ts) and `VAT_DOMESTIC_RATE`.
- [ ] **Stripe Tax + VIES** for automatic EU reverse-charge — currently VAT treatment is computed manually; the Stripe Tax/VIES path is marked future in [`app/lib/payments/stripe.ts`](app/lib/payments/stripe.ts).
- [ ] **Admin waivers / dues overrides** (Phase 3 exit item) — hardship waivers / special tiers aren't editable in admin yet.
- [ ] **Set `BANK_TRANSFER_DETAILS`** (cluster secret) — billing page shows a fallback when unset ([`account/org/[memberId]/billing/page.tsx`](app/(app)/account/org/[memberId]/billing/page.tsx)).

## 5. Stripe webhook robustness

- [~] **Webhook handling** — [`app/api/webhooks/stripe/route.ts`](app/api/webhooks/stripe/route.ts) verifies the signature and handles `invoice.paid` / `invoice.payment_succeeded`. Pending:
  - [ ] explicit **idempotency/dedupe** store (re-delivered events);
  - [ ] handle **`payment_failed`** (→ dunning) and subscription/renewal events;
  - [ ] test against Stripe **fixtures** (plan's testing item).

## 6. Organization features

- [ ] **Org logo upload** — `Member.logoUri` exists and the filesystem store ([`app/lib/storage.ts`](app/lib/storage.ts)) is ready, but there's no upload UI or homepage display.

## 7. Go-live confirmations (content / config)

- [ ] **Foundation incorporation jurisdiction** — "to be confirmed on incorporation" on the contact/about pages; update once incorporated.
- [ ] **Analytics provider + measurement id** — TBD per the privacy page.
- [ ] Review the seeded **active agreement version** in `/admin/settings` for production.

## 8. Infra / ops

- [ ] **One-time deploy step:** the app moved Deployment → **StatefulSet** (for the data volume). Before the first rollout, delete the old object once: `kubectl -n web delete deployment veranafoundation-website`. (Then normal CI applies the StatefulSet.)
- [ ] **Images are `linux/amd64`-only** (arm64 cross-build under QEMU SIGILLs). If multi-arch is ever needed, build on native runners (`ubuntu-latest` + `ubuntu-24.04-arm`) → manifest list — not QEMU.
- [ ] **Finer rate-limiting** on the magic-link endpoint (per-IP sliding window) — noted as a future improvement in [`app/api/auth/[...nextauth]/route.ts`](app/api/auth/[...nextauth]/route.ts).
- [ ] **DB backups / PVC snapshot policy** for the Postgres StatefulSet and the app data volume (signed PDFs).

## 9. Minor / nice-to-have

- [ ] Working-group **Delete** is implemented (`deleteWg`) but intentionally not in the card ⋮ menu — add it back if desired.
- [ ] Admin **member detail**: now a single "Membership" block; consider surfacing the member's `Invoice` history there.
- [ ] Email **logo**: emails use a text wordmark; set `EMAIL_LOGO_URL` to a hosted PNG when available.
- [ ] Switch the agreement PDF glyphs from ASCII fallbacks (`[X]`, tight `€`) to a real Unicode TTF (`@pdf-lib/fontkit`) if crisper output is wanted.
