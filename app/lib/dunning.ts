// Dunning + renewals for Associate dues (invoicing spec §Lifecycle), run daily
// by /api/cron/dunning:
//
//   issue ──7d──14d──21d──28d── reminders ──39d──► invoice void + expired
//
// The same cadence covers the initial application (membership `pending`) and
// renewals: on the day `periodEnd` passes, a fresh renewal invoice is issued
// (status → `past_due`; access continues through grace). A renewal paid in
// grace extends from the old periodEnd (markInvoicePaid); after expiry a
// member rejoins via an admin-reissued invoice, with the year starting on the
// day of payment.
//
// Every step is idempotent and deduped through the AdminAction audit log, so
// re-running a day (or a wide catch-up after downtime) never double-sends.

import type { Prisma } from "@prisma/client";
import { db } from "@/app/lib/db";
import {
  createMembershipInvoice,
  invoicePayUrl,
  REMINDER_DAYS,
  EXPIRE_DAYS,
} from "@/app/lib/invoices";
import { tierAmount, formatEur } from "@/app/lib/dues";
import {
  sendPaymentRequestEmail,
  sendPaymentReminderEmail,
  sendMembershipExpiredEmail,
} from "@/app/lib/billing-emails";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days elapsed since `from` (UTC), floored. */
export function daysSince(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / DAY_MS);
}

/**
 * The single dunning action due for an invoice `age` days after issue:
 * the highest reminder milestone reached, or expiry. Only one action per run —
 * if the job was down across several milestones, the member gets the latest
 * reminder, not a backlog of four.
 */
export function dueAction(age: number): { kind: "remind"; day: number } | { kind: "expire" } | null {
  if (age >= EXPIRE_DAYS) return { kind: "expire" };
  const reached = REMINDER_DAYS.filter((d) => age >= d);
  const day = reached[reached.length - 1];
  return day ? { kind: "remind", day } : null;
}

export type DunningResult = {
  renewalsIssued: string[]; // invoice numbers
  reminded: string[]; // "VF-…@d14"
  expired: string[]; // invoice numbers
};

export async function runDunning(now = new Date()): Promise<DunningResult> {
  const result: DunningResult = { renewalsIssued: [], reminded: [], expired: [] };
  await issueRenewals(now, result);
  await processOpenInvoices(now, result);
  if (result.renewalsIssued.length || result.reminded.length || result.expired.length) {
    console.log(
      `[dunning] renewals: ${result.renewalsIssued.join(", ") || "none"}; ` +
        `reminders: ${result.reminded.join(", ") || "none"}; ` +
        `expired: ${result.expired.join(", ") || "none"}`,
    );
  }
  return result;
}

/** Issue the renewal invoice the day periodEnd passes; access continues (past_due). */
async function issueRenewals(now: Date, result: DunningResult) {
  const due = await db.membership.findMany({
    where: {
      class: "associate",
      status: "active",
      periodEnd: { lte: now },
      invoices: { none: { status: "issued" } },
    },
    include: { member: true },
  });

  for (const m of due) {
    const net = m.tier ? tierAmount(m.tier) : null;
    if (net == null) {
      console.error(`[dunning] membership ${m.id} has no resolvable tier — skipped`);
      continue;
    }
    const inv = await createMembershipInvoice({
      membershipId: m.id,
      net,
      country: m.member.jurisdiction ?? "EE",
      hasVatNumber: !!m.member.vatNumber,
    });
    await db.membership.update({ where: { id: m.id }, data: { status: "past_due" } });
    try {
      await sendPaymentRequestEmail({
        to: recipients(m.member),
        memberName: m.member.legalName,
        invoiceNumber: inv.number,
        amountDue: formatEur(inv.grossAmount),
        vatNote: vatNote(inv.vat.treatment, inv.vat.vatAmount),
        dueDate: inv.dueDate,
        payUrl: inv.payUrl,
        renewal: true,
      });
    } catch (e) {
      console.error(`[dunning] renewal email failed for ${inv.number}`, e);
    }
    result.renewalsIssued.push(inv.number);
  }
}

/** Remind on open invoices at 7/14/21/28 days; void + expire at 39. */
async function processOpenInvoices(now: Date, result: DunningResult) {
  const open = await db.invoice.findMany({
    where: { status: "issued", issuedAt: { not: null } },
    include: { membership: { include: { member: true } } },
  });

  for (const inv of open) {
    const m = inv.membership;
    // Only Associate application/renewal invoices are dunned.
    if (m.class !== "associate" || (m.status !== "pending" && m.status !== "past_due")) {
      continue;
    }
    const renewal = m.status === "past_due";
    const action = dueAction(daysSince(inv.issuedAt!, now));
    if (!action) continue;

    if (action.kind === "expire") {
      await db.$transaction([
        db.invoice.update({ where: { id: inv.id }, data: { status: "void" } }),
        db.membership.update({ where: { id: m.id }, data: { status: "expired" } }),
        record(`dunning.expire`, inv.id, { renewal }),
      ]);
      try {
        await sendMembershipExpiredEmail({
          to: recipients(m.member),
          memberName: m.member.legalName,
          invoiceNumber: inv.number,
          renewal,
        });
      } catch (e) {
        console.error(`[dunning] expiry email failed for ${inv.number}`, e);
      }
      result.expired.push(inv.number);
      continue;
    }

    // One reminder per milestone, deduped via the audit log.
    const key = `${inv.id}:d${action.day}`;
    const seen = await db.adminAction.findFirst({
      where: { action: "dunning.reminder", targetType: "Invoice", targetId: key },
      select: { id: true },
    });
    if (seen) continue;
    try {
      await sendPaymentReminderEmail({
        to: recipients(m.member),
        memberName: m.member.legalName,
        invoiceNumber: inv.number,
        amountDue: formatEur(inv.grossAmount),
        vatNote: vatNote(inv.vatTreatment, inv.vatAmount),
        dueDate: inv.dueDate ?? now,
        payUrl: invoicePayUrl(inv.id),
        reminderDay: action.day,
        expireDay: EXPIRE_DAYS,
        renewal,
      });
    } catch (e) {
      console.error(`[dunning] reminder email failed for ${inv.number}`, e);
      continue; // not recorded — retried next run
    }
    await record("dunning.reminder", key, { number: inv.number, day: action.day });
    result.reminded.push(`${inv.number}@d${action.day}`);
  }
}

function recipients(member: { primaryEmail: string; noticeBillingEmail: string | null }): string {
  return [member.primaryEmail, member.noticeBillingEmail].filter(Boolean).join(",");
}

function vatNote(treatment: string, vatAmount: number): string | null {
  if (treatment === "reverse_charge") return "VAT reverse-charged (Art. 196 EU VAT Directive)";
  return vatAmount > 0 ? `Includes ${formatEur(vatAmount)} VAT` : null;
}

function record(action: string, targetId: string, after?: Prisma.InputJsonValue) {
  return db.adminAction.create({
    data: {
      actorEmail: "system:dunning",
      action,
      targetType: "Invoice",
      targetId,
      after,
    },
  });
}
