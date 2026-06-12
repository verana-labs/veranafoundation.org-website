import { db } from "@/app/lib/db";
import {
  ACTIVE_FEE_SCHEDULE,
  AGREEMENT_FEE_SCHEDULE,
  FEE_SCHEDULES,
  type FeeTier,
} from "@/app/lib/dues";

/**
 * The fee schedule in force, derived from the ACTIVE Membership Agreement
 * (AgreementDocument catalog) via AGREEMENT_FEE_SCHEDULE — so /admin/settings
 * is the single switch: activating an agreement version flips both the legal
 * text members sign and the prices they're invoiced, which Annex D of that
 * version snapshots (asserted by fee-schedule.test.ts).
 *
 * Server-only (DB): dues.ts stays pure data importable from client components.
 * Falls back to the code constant when the catalog is empty or unreachable
 * (fresh DB, build time), so pricing never crashes a request.
 */
export async function activeFeeSchedule(): Promise<string> {
  try {
    const active = await db.agreementDocument.findFirst({ where: { active: true } });
    if (!active) return ACTIVE_FEE_SCHEDULE;
    const mapped = AGREEMENT_FEE_SCHEDULE[active.filename];
    if (!mapped) {
      console.warn(
        `[fees] active agreement ${active.filename} has no fee-schedule mapping — using fallback "${ACTIVE_FEE_SCHEDULE}"`,
      );
      return ACTIVE_FEE_SCHEDULE;
    }
    return mapped;
  } catch {
    return ACTIVE_FEE_SCHEDULE;
  }
}

/** The tiers the apply form offers — the active schedule's. */
export async function activeTiers(): Promise<FeeTier[]> {
  return FEE_SCHEDULES[await activeFeeSchedule()] ?? [];
}
