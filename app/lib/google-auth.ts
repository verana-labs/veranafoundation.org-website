import { createSign } from "node:crypto";

/**
 * Google service-account auth shared by the Calendar (ADR-0003) and Meet
 * (ADR-0004) clients: a hand-rolled JWT-bearer grant with domain-wide
 * delegation, impersonating a meetings role account. The default host is
 * GOOGLE_CALENDAR_IMPERSONATE; GOOGLE_MEETINGS_HOSTS maps working languages to
 * other hosts (e.g. "es=meetings-es@veranafoundation.org"), because Meet
 * transcribes in the language the host account selected and leads outside the
 * Workspace cannot change it. One cached access token per host and scope set.
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

/**
 * The host account for a working language, or null for the default host.
 * GOOGLE_MEETINGS_HOSTS is a comma-separated list of `lang=email` pairs; an
 * entry naming the default host is the same as no entry.
 */
export function hostForLanguage(language: string): string | null {
  const raw = process.env.GOOGLE_MEETINGS_HOSTS ?? "";
  const fallback = process.env.GOOGLE_CALENDAR_IMPERSONATE?.trim().toLowerCase();
  for (const pair of raw.split(",")) {
    const [lang, email] = pair.split("=").map((x) => x?.trim().toLowerCase());
    if (lang && email && lang === language.toLowerCase()) return email === fallback ? null : email;
  }
  return null;
}

/** Whether the delegated service account is configured (env present). */
export function googleConfigured(): boolean {
  return googleConfig() !== null;
}

const cache = new Map<string, { token: string; expiresAt: number }>();

/**
 * An access token for the given scopes, acting as `host` (a role account; null
 * means the default host).
 */
export async function googleAccessToken(
  host: string | null,
  scopes: readonly string[],
): Promise<string> {
  const cfg = googleConfig();
  if (!cfg) throw new Error("Google Workspace is not configured (GOOGLE_* env).");
  const sub = host ?? cfg.impersonate;
  const scope = [...scopes].sort().join(" ");
  const key = `${sub} ${scope}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: cfg.email,
    sub, // act as the meetings role account
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
  cache.set(key, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}
