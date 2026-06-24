// Associate annual dues by worldwide headcount. Amounts in minor units
// (EUR cents). Contributor dues are €0 (no tier).
//
// Fee schedules are versioned data, keyed by the agreement version that
// introduced them (fee changes ship with a new agreement version; its Annex D
// embeds the table). fee-schedule.test.ts asserts every agreement version's
// Annex D matches its mapped schedule, so legal text and billing can never
// silently diverge.
//
// To change fees: add the new schedule under the new agreement version's key,
// map the new template file below, and activate that version in
// /admin/settings — activation is the single switch that flips both the legal
// text and the pricing (resolved at runtime by lib/fees.ts). An agreement
// version that does NOT change fees simply maps to the older schedule key.

export type AssociateTier =
  | "tier_1"
  | "tier_2"
  | "tier_3"
  | "tier_4"
  | "tier_5"
  | "tier_6";

export type FeeTier = { id: AssociateTier; label: string; amount: number };

export const FEE_SCHEDULES: Record<string, FeeTier[]> = {
  v1: [
    { id: "tier_1", label: "1–10 employees", amount: 150_000 },
    { id: "tier_2", label: "11–100 employees", amount: 300_000 },
    { id: "tier_3", label: "101–500 employees", amount: 700_000 },
    { id: "tier_4", label: "501–2,500 employees", amount: 1_000_000 },
    { id: "tier_5", label: "2,501–10,000 employees", amount: 2_500_000 },
    { id: "tier_6", label: "10,001+ employees", amount: 5_000_000 },
  ],
  v2: [
    { id: "tier_1", label: "1–10 employees", amount: 1_000 },
    { id: "tier_2", label: "11–100 employees", amount: 300_000 },
    { id: "tier_3", label: "101–500 employees", amount: 700_000 },
    { id: "tier_4", label: "501–2,500 employees", amount: 1_000_000 },
    { id: "tier_5", label: "2,501–10,000 employees", amount: 2_500_000 },
    { id: "tier_6", label: "10,001+ employees", amount: 5_000_000 },
  ],
  // v3 restores the standard tier_1 fee (the v2 €10 introductory price ends);
  // all other tiers unchanged. Matches membership-agreement-v3.md Annex D.
  v3: [
    { id: "tier_1", label: "1–10 employees", amount: 150_000 },
    { id: "tier_2", label: "11–100 employees", amount: 300_000 },
    { id: "tier_3", label: "101–500 employees", amount: 700_000 },
    { id: "tier_4", label: "501–2,500 employees", amount: 1_000_000 },
    { id: "tier_5", label: "2,501–10,000 employees", amount: 2_500_000 },
    { id: "tier_6", label: "10,001+ employees", amount: 5_000_000 },
  ],
};

/**
 * Fallback schedule, used only when the AgreementDocument catalog can't
 * answer (fresh/unreachable DB, unmapped file). At runtime the schedule in
 * force is derived from the ACTIVE agreement version — see lib/fees.ts.
 */
export const ACTIVE_FEE_SCHEDULE = "v2";

/** Which fee schedule each agreement template's Annex D snapshots (tested). */
export const AGREEMENT_FEE_SCHEDULE: Record<string, string> = {
  "membership-agreement-v1.md": "v1",
  "membership-agreement-v2.md": "v2",
  "membership-agreement-v3.md": "v3",
};

/** Price of a tier under an explicit schedule (callers resolve it via fees.ts). */
export function tierAmount(id: string, schedule: string): number | null {
  return FEE_SCHEDULES[schedule]?.find((t) => t.id === id)?.amount ?? null;
}

export function tierLabel(
  id: string | null | undefined,
  schedule: string | null | undefined,
): string | null {
  if (!id) return null;
  return (
    FEE_SCHEDULES[schedule ?? ACTIVE_FEE_SCHEDULE]?.find((t) => t.id === id)
      ?.label ?? null
  );
}

export function formatEur(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
