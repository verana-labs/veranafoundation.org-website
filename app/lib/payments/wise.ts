// Read-only Wise Business API client, used to reconcile incoming wires against
// issued invoices (see wise-reconcile.ts). Wise Business has no API to *create*
// payment links — collection is Stripe Checkout or a direct wire — but credits
// can be read back. Scope the token read-only; the client never moves money.
//
// Data path: the balance-statement endpoint is dead for us (Wise retired
// signature SCA for personal API tokens under PSD2). Instead, per Wise
// support: the ACTIVITIES feed indexes every credit with a TRANSFER resource
// id — both Wise-to-Wise and external SEPA pushes (verified live) — and
// GET /v1/transfers/{id} is NOT SCA-gated and returns the payment reference.
//
// Env: WISE_API_TOKEN, WISE_PROFILE_ID, optional WISE_API_URL (default
// production; sandbox: https://api.sandbox.transferwise.tech).

const API_URL = process.env.WISE_API_URL ?? "https://api.transferwise.com";

export function wiseConfigured(): boolean {
  return !!(process.env.WISE_API_TOKEN && process.env.WISE_PROFILE_ID);
}

export type WiseCredit = {
  /** The Wise transfer id — our providerRef / idempotency key. */
  referenceNumber: string;
  date: string;
  /** Amount as Wise reports it (major units). */
  amount: number;
  currency: string;
  /**
   * The payment reference, for invoice matching. Banks append scheme junk
   * (e.g. "VF-2026-0007/SCTINSTOUT…"), so always regex-scan, never compare.
   */
  text: string;
  senderName: string | null;
};

async function wiseFetch(path: string) {
  return fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.WISE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}

/** Activity entries wrap values in pseudo-HTML (<strong>, <positive>). */
export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

type Activity = {
  type: string;
  resource: { type: string; id: string };
  title: string;
  primaryAmount: string;
  status: string;
  createdOn: string;
};

/**
 * A credit is marked by the <positive> wrapper on its amount (outgoing
 * entries show a plain amount + "Sent"). Verified against live data.
 */
export function isSettledCredit(a: Activity): boolean {
  return (
    a.status === "COMPLETED" &&
    a.resource?.type === "TRANSFER" &&
    a.primaryAmount.includes("<positive>")
  );
}

/** Incoming credits on the profile between `since` and now. */
export async function fetchCredits(args: {
  since: Date;
  currency?: string;
}): Promise<WiseCredit[]> {
  if (!wiseConfigured()) throw new Error("Wise is not configured.");
  const currency = args.currency ?? "EUR";
  const profileId = process.env.WISE_PROFILE_ID;

  // The activities feed is the index: newest first; at this volume one page
  // comfortably covers the scan window.
  const res = await wiseFetch(`/v1/profiles/${profileId}/activities?size=100`);
  if (!res.ok) throw new Error(`wise: activities ${res.status} ${await res.text()}`);
  const { activities = [] } = (await res.json()) as { activities?: Activity[] };

  const credits = activities.filter(
    (a) => isSettledCredit(a) && new Date(a.createdOn) >= args.since,
  );

  const out: WiseCredit[] = [];
  for (const a of credits) {
    // The transfer detail carries the payment reference + settled amount.
    const tRes = await wiseFetch(`/v1/transfers/${a.resource.id}`);
    if (!tRes.ok) {
      console.error(`[wise] transfer ${a.resource.id} fetch failed: ${tRes.status}`);
      continue; // re-covered by the next scan
    }
    const t = (await tRes.json()) as {
      id: number;
      reference?: string | null;
      details?: { reference?: string | null };
      targetValue: number;
      targetCurrency: string;
      created: string;
    };
    if (t.targetCurrency !== currency) continue;
    out.push({
      referenceNumber: String(t.id),
      date: a.createdOn,
      amount: t.targetValue,
      currency: t.targetCurrency,
      text: t.details?.reference ?? t.reference ?? "",
      senderName: stripTags(a.title) || null,
    });
  }
  return out;
}
