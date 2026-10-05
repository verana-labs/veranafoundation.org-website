import { createSign } from "node:crypto";

/**
 * Google service-account auth shared by the Calendar (ADR-0003) and Meet
 * (ADR-0004) clients: a hand-rolled JWT-bearer grant with domain-wide
 * delegation, impersonating the meetings role account
 * (GOOGLE_CALENDAR_IMPERSONATE). One cached access token per scope set.
 *
 * Plain fetch + node:crypto — no googleapis dependency.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function googleConfig() {
  const email = process.env.GOOGLE_SA_EMAIL;
  // The key arrives with literal \n in env files.
  const key = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const impersonate = process.env.GOOGLE_CALENDAR_IMPERSONATE;
  if (!email || !key || !impersonate) return null;
  return { email, key, impersonate };
}

/** Whether the delegated service account is configured (env present). */
export function googleConfigured(): boolean {
  return googleConfig() !== null;
}

const cache = new Map<string, { token: string; expiresAt: number }>();

/** An access token for the given scopes, acting as the role account. */
export async function googleAccessToken(scopes: readonly string[]): Promise<string> {
  const cfg = googleConfig();
  if (!cfg) throw new Error("Google Workspace is not configured (GOOGLE_* env).");
  const scope = [...scopes].sort().join(" ");
  const cached = cache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: cfg.email,
    sub: cfg.impersonate, // act as the meetings role account
    scope,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(cfg.key, "base64url");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cache.set(scope, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}
