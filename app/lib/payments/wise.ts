import crypto from "node:crypto";

// Read-only Wise Business API client, used to reconcile incoming wires against
// issued invoices (see wise-reconcile.ts). Wise Business has no API to *create*
// payment links — collection is Stripe Checkout or a direct wire — but it does
// expose balances and statements, which is all reconciliation needs. Scope the
// token read-only; the client never moves money.
//
// Env: WISE_API_TOKEN, WISE_PROFILE_ID, optional WISE_API_URL (default
// production; sandbox: https://api.sandbox.transferwise.tech) and
// WISE_SCA_PRIVATE_KEY (PEM) — the balance-statement endpoint is SCA-protected
// for business profiles, so upload the matching public key in Wise's settings.

const API_URL = process.env.WISE_API_URL ?? "https://api.transferwise.com";

export function wiseConfigured(): boolean {
  return !!(process.env.WISE_API_TOKEN && process.env.WISE_PROFILE_ID);
}

export type WiseCredit = {
  /** Wise's transaction reference, e.g. "TRANSFER-123456" — our providerRef. */
  referenceNumber: string;
  date: string;
  /** EUR amount as Wise reports it (major units). */
  amount: number;
  currency: string;
  /** Free text the payer attached + Wise's own description, for matching. */
  text: string;
  senderName: string | null;
};

async function wiseFetch(path: string, scaHeaders?: Record<string, string>) {
  return fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.WISE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...scaHeaders,
    },
    cache: "no-store",
  });
}

/**
 * Wise SCA: a protected endpoint answers 403 with a one-time token in the
 * `x-2fa-approval` header; sign it (RSA-SHA256, base64) with the private key
 * whose public half is registered on the Wise profile, then retry.
 */
async function wiseFetchSca(path: string): Promise<Response> {
  const first = await wiseFetch(path);
  if (first.status !== 403) return first;
  const token = first.headers.get("x-2fa-approval");
  // Tolerate \n-escaped PEMs (single-line env values).
  const pem = process.env.WISE_SCA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!token || !pem) return first;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(token)
    .sign(pem, "base64");
  return wiseFetch(path, { "x-2fa-approval": token, "X-Signature": signature });
}

/** The profile's STANDARD balance id for `currency`, or null. */
export async function findBalanceId(currency = "EUR"): Promise<number | null> {
  const profileId = process.env.WISE_PROFILE_ID;
  const res = await wiseFetch(`/v4/profiles/${profileId}/balances?types=STANDARD`);
  if (!res.ok) throw new Error(`wise: balances ${res.status} ${await res.text()}`);
  const balances = (await res.json()) as { id: number; currency: string }[];
  return balances.find((b) => b.currency === currency)?.id ?? null;
}

/** Incoming credits on the EUR balance between `since` and now. */
export async function fetchCredits(args: {
  since: Date;
  currency?: string;
}): Promise<WiseCredit[]> {
  if (!wiseConfigured()) throw new Error("Wise is not configured.");
  const currency = args.currency ?? "EUR";
  const profileId = process.env.WISE_PROFILE_ID;
  const balanceId = await findBalanceId(currency);
  if (balanceId == null) throw new Error(`wise: no ${currency} balance found`);

  const qs = new URLSearchParams({
    currency,
    intervalStart: args.since.toISOString(),
    intervalEnd: new Date().toISOString(),
    type: "COMPACT",
  });
  const res = await wiseFetchSca(
    `/v1/profiles/${profileId}/balance-statements/${balanceId}/statement.json?${qs}`,
  );
  if (!res.ok) throw new Error(`wise: statement ${res.status} ${await res.text()}`);

  const statement = (await res.json()) as {
    transactions?: {
      type: "CREDIT" | "DEBIT";
      date: string;
      amount: { value: number; currency: string };
      referenceNumber: string;
      details?: {
        description?: string;
        paymentReference?: string;
        senderName?: string;
      };
    }[];
  };

  return (statement.transactions ?? [])
    .filter((t) => t.type === "CREDIT")
    .map((t) => ({
      referenceNumber: t.referenceNumber,
      date: t.date,
      amount: t.amount.value,
      currency: t.amount.currency,
      text: [t.details?.paymentReference, t.details?.description]
        .filter(Boolean)
        .join(" "),
      senderName: t.details?.senderName ?? null,
    }));
}
