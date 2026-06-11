// Auto-reconcile direct wires: scan recent credits on the Wise EUR balance for
// our invoice number in the payment reference, and mark matching issued
// invoices paid (activating the membership + sending the receipt). This is the
// offline bank-transfer adapter, automated — admin mark-paid remains the
// manual fallback for typo'd references.
//
// Triggered by the Wise `balances#credit` webhook and a cron backstop. The
// scan window re-covers past days on every run; markInvoicePaid is idempotent,
// so re-seeing a settled credit is a no-op.

import { db } from "@/app/lib/db";
import { getSellerEntity, markInvoicePaid } from "@/app/lib/invoices";
import { fetchCredits, wiseConfigured, type WiseCredit } from "@/app/lib/payments/wise";
import { sendEmail, escapeHtml } from "@/app/lib/email";
import { emailLayout } from "@/app/lib/email-layout";
import { formatEur } from "@/app/lib/dues";

const SCAN_DAYS = Number(process.env.WISE_RECONCILE_DAYS ?? "14");

/** Invoice numbers (e.g. "VF-2026-0001") mentioned in free text, uppercased. */
export function extractInvoiceNumbers(text: string, prefix: string): string[] {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const re = new RegExp(`${escaped}\\d{4}-\\d{4}`, "gi");
  return [...new Set((text.match(re) ?? []).map((n) => n.toUpperCase()))];
}

export type ReconcileResult = {
  configured: boolean;
  scanned: number;
  matched: string[]; // invoice numbers marked paid
  alerts: string[]; // NEW problems emailed to admins this run
  suppressed: number; // known problems re-seen in the window (already alerted)
};

export async function reconcileWiseCredits(): Promise<ReconcileResult> {
  if (!wiseConfigured()) {
    return { configured: false, scanned: 0, matched: [], alerts: [], suppressed: 0 };
  }

  const seller = await getSellerEntity();
  const since = new Date(Date.now() - SCAN_DAYS * 24 * 60 * 60 * 1000);
  const credits = await fetchCredits({ since });

  const matched: string[] = [];
  const problems: { key: string; message: string }[] = [];

  for (const credit of credits) {
    const numbers = extractInvoiceNumbers(credit.text, seller.invoicePrefix);
    for (const number of numbers) {
      const problem = await settleCredit(credit, number);
      if (problem === null) matched.push(number);
      else if (problem) {
        problems.push({ key: `${credit.referenceNumber}:${number}`, message: problem });
      }
    }
    // No invoice reference in the wire (member forgot it, or unrelated
    // revenue): alert only when the amount exactly matches an open invoice —
    // a strong manual-settlement candidate without auto-settling ambiguity.
    if (numbers.length === 0) {
      const cents = Math.round(credit.amount * 100);
      const candidates = await db.invoice.findMany({
        where: { status: "issued", currency: credit.currency, grossAmount: cents },
        include: { membership: { include: { member: true } } },
      });
      if (candidates.length) {
        const list = candidates
          .map((c) => `${c.number} (${c.membership.member.legalName})`)
          .join(", ");
        problems.push({
          key: `${credit.referenceNumber}:noref`,
          message:
            `credit of ${credit.amount} ${credit.currency} on ${credit.date.slice(0, 10)}` +
            `${credit.senderName ? ` from ${credit.senderName}` : ""} carries no invoice ` +
            `reference but matches by amount: ${list} — verify and mark paid`,
        });
      }
    }
  }

  // The scan window re-covers past days on every run, so an unresolved anomaly
  // would re-alert daily for WISE_RECONCILE_DAYS. Dedupe via the AdminAction
  // audit log: each wire+invoice pair alerts exactly once.
  const fresh: typeof problems = [];
  for (const p of problems) {
    const seen = await db.adminAction.findFirst({
      where: { action: "wise_reconcile.alert", targetType: "WiseCredit", targetId: p.key },
      select: { id: true },
    });
    if (!seen) fresh.push(p);
  }
  const suppressed = problems.length - fresh.length;

  if (fresh.length && (await alertAdmins(fresh.map((p) => p.message)))) {
    // Recorded only after the email went out, so a failed send retries next run.
    await db.adminAction.createMany({
      data: fresh.map((p) => ({
        actorEmail: "system:wise-reconcile",
        action: "wise_reconcile.alert",
        targetType: "WiseCredit",
        targetId: p.key,
        after: { message: p.message },
      })),
    });
  }

  const alerts = fresh.map((p) => p.message);
  if (matched.length || problems.length) {
    console.log(
      `[wise-reconcile] scanned ${credits.length} credits — paid: ${matched.join(", ") || "none"}; new alerts: ${alerts.length}; suppressed: ${suppressed}`,
    );
  }
  return { configured: true, scanned: credits.length, matched, alerts, suppressed };
}

/**
 * Settle one credit against one referenced invoice. Returns null when marked
 * paid, "" when nothing to do (already paid), or an alert message.
 */
async function settleCredit(
  credit: WiseCredit,
  number: string,
): Promise<string | null> {
  const where = (s: string) =>
    `${s} — wire ${credit.referenceNumber} (${credit.amount} ${credit.currency}` +
    `${credit.senderName ? `, from ${credit.senderName}` : ""}, ${credit.date.slice(0, 10)})`;

  const invoice = await db.invoice.findFirst({
    where: { number: { equals: number, mode: "insensitive" } },
    include: { payments: { select: { providerRef: true } } },
  });
  if (!invoice) return where(`reference ${number} matches no invoice`);
  if (invoice.payments.some((p) => p.providerRef === credit.referenceNumber)) {
    return ""; // this very credit already reconciled — re-scan no-op
  }
  if (invoice.status === "paid") {
    return where(`possible duplicate payment: ${number} is already paid`);
  }
  if (invoice.status !== "issued") {
    return where(`invoice ${number} is ${invoice.status}, not issued`);
  }
  if (credit.currency !== invoice.currency) {
    return where(`invoice ${number} expects ${invoice.currency}`);
  }
  const cents = Math.round(credit.amount * 100);
  if (cents < invoice.grossAmount) {
    return where(
      `underpayment on ${number}: received ${formatEur(cents)}, due ${formatEur(invoice.grossAmount)}`,
    );
  }

  await markInvoicePaid({
    invoiceId: invoice.id,
    provider: "wise",
    providerRef: credit.referenceNumber,
    amount: cents,
    payMethod: "bank_transfer",
  });
  return null;
}

/**
 * Heads-up to the admin allowlist about credits needing review. Returns
 * whether the email was sent — callers only record an alert as delivered
 * (for dedupe) when it actually went out.
 */
async function alertAdmins(alerts: string[]): Promise<boolean> {
  try {
    const admins = await db.adminAllowlistEntry.findMany({ select: { email: true } });
    const to = admins.map((a) => a.email).join(",");
    if (!to) return false;
    const SITE_URL = process.env.AUTH_URL ?? "https://veranafoundation.org";
    await sendEmail({
      to,
      subject: `Wise reconciliation — ${alerts.length} item(s) need review`,
      html: emailLayout({
        heading: "Incoming wires need review",
        bodyHtml: `
        <p style="margin:0 0 12px;">Automatic reconciliation found credits on the
        Wise EUR balance it could not safely match to an issued invoice:</p>
        <ul style="margin:0 0 12px;padding-left:18px;">
          ${alerts.map((a) => `<li style="margin:0 0 6px;">${escapeHtml(a)}</li>`).join("")}
        </ul>
        <p style="margin:0;">Verify in Wise, then settle from the admin invoices
        page (mark paid) or follow up with the member.</p>`,
        button: { label: "Open admin invoices", href: `${SITE_URL}/admin/invoices` },
      }),
    });
    return true;
  } catch (e) {
    console.error("[wise-reconcile] admin alert failed", e);
    return false;
  }
}
