# ADR-0001 — Verana Foundation billing architecture

- **Status:** Proposed
- **Date:** 2026-06-08
- **Deciders:** Fabrice (Verana / 2060)
- **Applies to:** Verana Foundation membership dues.

## Context

The Foundation must collect membership dues. The profile is narrow:

- **Annual**, B2B, flat tiers; **Contributor = €0**, only Associate orgs pay.
- **Low volume** — tens to low hundreds of paying orgs per year.
- **Invoice-first** (bank transfer) for the larger tiers, card for the small ones.
- **EU reverse-charge VAT** (Estonian seller).

This is a `memberships` table + provider-hosted invoicing, not a subscription engine. We explicitly **reject building a general billing platform** here: it's over-scoped for once-a-year invoices. (Other 2060 products that do high-volume, metered SaaS bill on their own stack — Verana stays decoupled and shares *concepts, not code*.)

## Decision

A **thin, bespoke invoicing capability inside the existing Next.js site** — not a separate service, not a billing engine:

1. **Own the canonical state.** Memberships, invoices, payments, and entitlements live in our DB. A payment provider's only jobs are to **collect money** and **notify us**; it is never the source of truth.
2. **Providers are adapters** behind a small `PaymentProvider` port — Stripe Invoicing + an offline bank-transfer adapter to start.
3. **Expose an Entitlements API and emit canonical events** that the account/admin UI and Working-Group access consume.
4. **Centralize seller-entity / VAT** so tax treatment is computed in one place.
5. **Card data never touches us** — provider-hosted pay pages only (PCI SAQ-A).
6. **Model dues as member-owned annual invoices**, not provider subscriptions — we own the renewal schedule and ask the provider to collect a single amount each period.

## `PaymentProvider` port

The only operations we need; each provider implements them, and **nothing outside the adapter imports a provider SDK**:

```text
createCustomer(member)                       -> providerCustomerId
createInvoice(amount, currency, taxInfo,
              dueDate, metadata)             -> { invoiceId, hostedPayUrl }
getInvoiceStatus(invoiceId)                  -> open | paid | void
handleWebhook(rawEvent)                      -> CanonicalEvent   # normalize
```

- **Stripe Invoicing** (initial) — hosted invoice, card + bank transfer, Stripe Tax for VAT/VIES.
- **Offline bank transfer** — issue an invoice with a unique reference; an admin marks it paid. At this volume manual reconciliation is fine, and it proves the abstraction is real.

Idempotency + a reconciliation poll (truth = our DB / the provider, not "did the webhook arrive") are required regardless of provider.

## Entitlements API

The single source other parts of the app ask — never the provider directly:

```text
GET /v1/entitlements?subject={memberId}
```

```json
{
  "subject": "member_456",
  "status": "active",              // active | past_due | canceled | none
  "plan": "associate-tier-3",      // contributor | associate-{tier}
  "validUntil": "2027-06-08T00:00:00Z",
  "updatedAt": "2026-06-08T10:00:00Z"
}
```

The `subject` is the `Member`. A logged-in user's effective entitlements are the union over their `UserMember` links (see [ADR-0002](./adr-0002-authentication.md)); the account/admin UI and WG-access checks read from here.

## Canonical events

Consumers (UI, notifications, WG access) react to events; they don't poll the provider:

```json
{
  "id": "evt_...",
  "type": "entitlement.changed",
  "version": 1,
  "occurredAt": "2026-06-08T10:00:00Z",
  "subject": "member_456",
  "data": { "status": "active", "plan": "associate-tier-3", "validUntil": "2027-06-08T00:00:00Z" }
}
```

Minimum types: `entitlement.changed`, `invoice.issued`, `payment.succeeded`, `payment.failed`, `membership.renewed`, `membership.expired`. Consumers must be **idempotent** (dedupe on `id`).

## Seller entity & VAT

VAT logic is centralized on the seller entity so it's identical everywhere money is collected:

```text
SellerEntity {
  legalName        # Verana Foundation (in formation), represented by 2060 OÜ
  vatNumber
  country          # EE
  address
  invoicePrefix    # "VF-"
  providerAccounts # { stripe: acct_..., ... }
}
```

Rule: domestic = seller's domestic rate; **EU B2B with a VIES-valid VAT ID = reverse charge (0%, noted on the invoice)**; non-EU = outside EU VAT scope. (Stripe Tax computes it; the rule and seller identity are defined here. VAT-number validation: see [verana-invoicing-spec.md](./verana-invoicing-spec.md).)

## Consequences

**Positive**

- Right-sized: a few routes + a table, not a billing platform or an extra service.
- Provider-swappable: the port + our own state mean we can change or add a collector (or accept crypto) without touching membership logic.
- Consistent tax/seller handling; minimal PCI scope.

**Negative / risks**

- We own renewal/dunning logic (small, but ours). Mitigated by annual cadence and low volume.
- The entitlements API + events are an internal interface the UI depends on — version them (`version` field; additive changes preferred).

## Non-goals / future

- **Non-goal:** a shared cross-product billing platform. Other products bill on their own stacks; we do not couple to them.
- **Future:** if Verana ever grows to metered/subscription scale, owning the state behind the `PaymentProvider` port and the entitlements surface means a billing engine could be slotted in **without changing the entitlements API or events** consumers rely on.
