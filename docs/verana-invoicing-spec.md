# Verana Foundation — membership invoicing module (spec)

- **Status:** Proposed
- **Date:** 2026-06-08
- **Scope:** Collect Associate dues, record memberships, expose entitlements. Implements the contract in [ADR-0001](./adr-0001-subscription-billing-architecture.md).
- **Non-goals:** subscription proration, usage metering, a separate service. This lives as API routes + a table in the existing Next.js site.

## Why bespoke (not Lago)

Verana is annual, B2B, low-volume, invoice-first. Contributor membership is **€0**; only Associate orgs pay, on flat headcount tiers (Annex D). That is a `memberships` table + provider-hosted invoicing + a manual bank-transfer reconcile — not a billing engine. See ADR-0001.

## Membership classes & dues (from the Agreement, Annex D)

| Class | Who | Dues |
|---|---|---|
| Contributor | Orgs **and individuals** doing technical/standards work | **€0** |
| Associate | Supporting organizations | Sliding by worldwide headcount: €1,500 (1–10) → €50,000 (10,001+) |

Tiers: 1–10 → €1,500 · 11–100 → €3,000 · 101–500 → €7,000 · 501–2,500 → €10,000 · 2,501–10,000 → €25,000 · 10,001+ → €50,000. Hardship / non-profit / government adjustments are discretionary (Annex D.4–D.6).

## Data model

```text
Member {
  id
  type            "organization" | "individual"
  legalName
  // org only:
  entityType, jurisdiction, registeredAddress, vatNumber?
  logoUri?                // URL or inline SVG — optional; future homepage display
  // individual only:
  countryOfResidence
  primaryEmail               // verified
  noticeBillingEmail?        // org: cc for invoices/receipts
  socialAnnouncementConsent  // ok to announce their membership on our social networks
  createdAt
}

Membership {
  id
  memberId
  class           "associate" | "contributor"
  tier?           // associate only, e.g. "tier_3"
  status          "pending" | "active" | "past_due" | "suspended" | "expired"
  periodStart, periodEnd     // 1 year
  provisional     bool       // true pre-incorporation (Agreement §2.4(c))
  createdAt, updatedAt
}

Invoice {
  id
  membershipId
  sellerEntityId  // "verana-foundation"
  number          // VF-2026-0001
  currency        "EUR"
  netAmount, vatAmount, grossAmount
  vatTreatment    "domestic" | "reverse_charge" | "outside_scope"
  status          "draft" | "issued" | "paid" | "void"
  providerRef     // Stripe/Mollie invoice id, if applicable
  payMethod       "card" | "bank_transfer" | null
  dueDate, issuedAt, paidAt
}

Payment {
  id, invoiceId, provider, providerRef, amount, currency, receivedAt, raw
}

SignatureRecord {              // ties to the application/e-sign flow
  id, memberId, signerName, signerTitle?, emailVerified,
  agreementVersion, agreementUrl, agreementHash,   // the AgreementDocument that was accepted
  signedAt, ip, userAgent
}

AgreementDocument {            // admin-configured; the agreement shown at /apply
  id, version,                 // e.g. "v1" / doc ref "LG-EE..."
  url,                         // PDF URL — admin-editable; swap to publish a new version
  hash?,                       // optional integrity hash of the PDF
  active, effectiveFrom
}
```

`Contributor` memberships create no `Invoice`.

> **Identity** (login users, org managers, representatives) lives in [ADR-0002](./adr-0002-authentication.md): `User`, `UserMember` (`manager` / `representative`), and `MemberAccess` (the org-managed email allowlist — admins + endorsed representatives — that auto-links a person to the org on signup; admins add/remove both representatives and other admins). A user may be entitled by several `Member`s; **WG access** is computed from their effective membership set, and some WGs require an active **Associate** membership — see ADR-0002 §Working Group access.

## Flows

### A. Individual Contributor (free) — instant

```text
verify email (OTP)
  → enter name + country of residence
  → view & accept the Membership Agreement PDF (active AgreementDocument, incl. Code of Conduct)
  → tick: legal age & capacity (§3.10a)
  → type name to sign  ──► SignatureRecord (records agreement version + url + hash)
  → Membership{class:contributor, status:active, provisional:true}
  → emit entitlement.changed (active)
  → email executed PDF
```

### B. Organization — Contributor (free)

Same as A plus org fields (legal name, entity type, jurisdiction, address) and **work-email verification** + **"authorized to bind" attestation** (§3.10c). No invoice. `status:active` on signature.

### C. Organization — Associate (paid)

```text
org fields + signer (name, title, verified work email) + notice/billing email
  → select headcount tier (UI shows dues)
  → attest authorized-to-bind + view & accept the Membership Agreement PDF (active AgreementDocument) + type name ──► SignatureRecord
  → Membership{class:associate, tier, status:pending}
  → compute VAT treatment (see below)
  → Invoice issued via provider (hosted pay page: card or bank transfer)
  → on payment ──► Membership active, periodEnd = +1y
                ──► emit payment.succeeded + entitlement.changed(active)
                ──► email receipt (cc billing contact)
```

Payment is itself the practical **authority signal** for paid orgs (nobody wires €1,500–50,000 without authority), so no heavier KYB gate up front. Annex D.2 lets the Foundation request headcount documentation later; §8.3 lets it terminate — verify lazily.

## VAT handling

Seller entity = the Foundation's invoicing entity (Verana Foundation (in formation), represented by **2060 OÜ**, Estonia). Rule (centralized per ADR-0001 SellerEntity):

| Member location | VAT ID | Treatment | On invoice |
|---|---|---|---|
| Estonia (domestic) | — | Domestic rate | seller's domestic VAT |
| EU, B2B | **VIES-valid** | **Reverse charge** | 0%, "VAT reverse charged, Art. 196 VAT Directive" + buyer VAT ID |
| EU, no valid VAT ID | — | Domestic rate (treat as B2C) | seller's domestic VAT |
| Non-EU | — | Outside EU VAT scope | no EU VAT |

> Confirm the **applicable Estonian rate and the Foundation/2060 OÜ VAT registration status** with the accountant before go-live — rate handling should not be hard-coded; prefer the provider's tax engine.

### Validating a VAT number

Reverse charge (0%) is only justified if the buyer's EU VAT ID is **valid and registered for intra-EU trade** at the time of supply. Source of truth: **VIES** (EU VAT Information Exchange System).

**Preferred (Stripe path).** Attach the buyer's VAT ID as a Customer Tax ID — Stripe Tax validates it against VIES and applies reverse charge automatically:

```ts
await stripe.customers.createTaxId(customerId, { type: "eu_vat", value: "EE123456789" });
// webhook customer.tax_id.updated → verification.status: pending | verified | unverified
```

React to the webhook: `verified` + buyer country ≠ EE → reverse charge; else domestic VAT.

**DIY path (if we move off Stripe / want our own audit record).**

1. **Syntactic check first** (per-country format/regex) to avoid wasting calls on typos.
2. **Live VIES check:** `GET https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{CC}/vat/{NUMBER}` → `{ isValid, name?, address?, requestDate }`. For an audit trail use the consultation variant (pass our VAT number as requester) to get a **consultation number** (`requestIdentifier`); store it as proof of verification.

**Rules / gotchas:**

- **VIES covers EU only.** Not UK (use HMRC's checker), not CH/NO/etc. → treat non-EU as outside EU VAT scope.
- **Unverified ⇒ charge domestic VAT, never 0%.** Only grant reverse charge once `verified`. If VIES is down (it frequently is, per member state), record `pending`, retry, and bill domestic until verified.
- **Validity ≠ identity.** VIES confirms the number is registered, not that this buyer owns it; name/address may be redacted by some states — don't gate on name-matching.
- **Cache** results (~24h) keyed by VAT ID; VIES isn't built for high QPS.

**Stored on the records:** `Member.vatNumber`, verification status + checkedAt (+ consultation number if DIY), and the resulting `Invoice.vatTreatment`.

## Provider choice

**Recommendation: Stripe Invoicing** for Verana, because **Stripe Tax** does EU B2B reverse-charge + **VIES VAT-ID validation** natively and supports **bank-transfer + card on one hosted invoice** — minimal custom tax code. **Mollie** is the EU-friendly alternative (clean SEPA/bank-transfer, simpler pricing) but you'd own more of the VAT logic.

Either sits behind the ADR-0001 `PaymentProvider` port, plus an **offline bank-transfer adapter** (issue invoice with unique reference; mark paid in admin). At this volume, manual reconciliation of wires is acceptable and the offline adapter proves the abstraction.

## Lifecycle & renewal

- States: `pending → active → past_due → suspended/expired`, with discretionary `reinstated` (§8.8).
- **Renewal:** annual. Reminder + next invoice issued N days before `periodEnd` (e.g. 30). Grace period on non-payment → `past_due`; after grace → `suspended` (revoke entitlement) per §8.3(a)/§7.4.
- **Provisional flag** clears (→ ordinary membership) when the Foundation incorporates and ratifies (§2.3); entitlements are unaffected by the flag.

## Admin (minimal)

List members/memberships; issue / void invoice; mark bank transfer paid; apply waiver or tier override (Annex D.4–D.6); resend executed PDF/receipt; view SignatureRecord audit trail.

## Contract surface (must match ADR-0001)

- `GET /v1/entitlements?subject={memberId}` → canonical entitlement object (`status` from Membership.status; `plan` = `contributor` | `associate-{tier}`; `validUntil` = `periodEnd`).
- Emit `entitlement.changed`, `invoice.issued`, `payment.succeeded`, `payment.failed`, `membership.renewed`, `membership.expired`.

## Build order

1. Schema + `Member`/`Membership` + Contributor (free) flow end-to-end (no payments) — covers individuals and Contributor orgs, exercises e-sign + entitlements + events.
2. Associate flow with **Stripe Invoicing** (card + bank transfer) + Stripe Tax.
3. Offline bank-transfer adapter + admin mark-paid.
4. Renewal reminders + dunning/suspension.

## Open questions

1. Estonian VAT rate + Foundation/2060 OÜ VAT registration status (accountant).
2. Stripe Invoicing vs Mollie — confirm pick.
3. Invoice number format / sequence per seller entity (e.g. `VF-{year}-{seq}`).
4. Where entitlement events are published (shared bus vs per-product webhooks).
