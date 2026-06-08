// Associate annual dues by worldwide headcount (Agreement Annex D). Amounts in
// minor units (EUR cents). Contributor dues are €0 (no tier).
export type AssociateTier =
  | "tier_1"
  | "tier_2"
  | "tier_3"
  | "tier_4"
  | "tier_5"
  | "tier_6";

export const ASSOCIATE_TIERS: {
  id: AssociateTier;
  label: string;
  amount: number;
}[] = [
  { id: "tier_1", label: "1–10 employees", amount: 150_000 },
  { id: "tier_2", label: "11–100 employees", amount: 300_000 },
  { id: "tier_3", label: "101–500 employees", amount: 700_000 },
  { id: "tier_4", label: "501–2,500 employees", amount: 1_000_000 },
  { id: "tier_5", label: "2,501–10,000 employees", amount: 2_500_000 },
  { id: "tier_6", label: "10,001+ employees", amount: 5_000_000 },
];

export function tierAmount(id: string): number | null {
  return ASSOCIATE_TIERS.find((t) => t.id === id)?.amount ?? null;
}

export function formatEur(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
