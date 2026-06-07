/**
 * Server-only client for the Relaticle CRM REST API (https://crm.2060.io,
 * in-cluster). Used by the /api/contact route to turn a contact-form
 * submission into CRM records.
 *
 * Mapping (per product decision):
 *   organization  -> Company   (always created when present; no dedupe)
 *   name/email/…  -> Person     (linked to the company)
 *   full inquiry  -> Note       (linked to the person + company)
 *   lead inquiries-> Opportunity (membership / partnership / grant only)
 *
 * Relaticle API contract (v1):
 *   POST /api/v1/people        { name, company_id?, custom_fields:{<code>:value} }
 *   POST /api/v1/companies     { name, custom_fields }
 *   POST /api/v1/notes         { title, people_ids?[], company_ids?[], custom_fields }
 *   POST /api/v1/opportunities { name, company_id?, contact_id?, custom_fields }
 *   GET  /api/v1/custom-fields?entity_type=… -> field definitions (id, code, name, type)
 *   Auth: Authorization: Bearer <token> (token bound to the "2060" team).
 *
 * `custom_fields` is an object keyed by each field's *code*. Because codes are
 * team-configured, we discover them at runtime and match by name/code. Every
 * create falls back to a custom-field-free payload if the CRM rejects the
 * custom fields, so a mapping mismatch never loses the core record — and the
 * full inquiry is always captured in the Note body (or its title) and the logs.
 *
 * This module must never be imported from client components.
 */

const BASE = process.env.RELATICLE_API_URL?.replace(/\/+$/, "");
const TOKEN = process.env.RELATICLE_API_TOKEN;
const ALERT_WEBHOOK = process.env.ALERT_WEBHOOK_URL;

export function crmConfigured(): boolean {
  return Boolean(BASE && TOKEN);
}

export type Inquiry = {
  topic: string;
  name: string;
  email: string;
  organization?: string;
  role?: string;
  website?: string;
  message: string;
  source?: string;
  consentAt: string;
};

export type CrmResult = {
  personId?: string;
  companyId?: string;
  noteId?: string;
  opportunityId?: string;
};

const TOPIC_LABELS: Record<string, string> = {
  "membership-associate": "Membership — Associate",
  "membership-contributor": "Membership — Contributor",
  "working-group": "Working group participation",
  grant: "Grant / ecosystem",
  partnership: "Partnership / integration",
  press: "Press or analyst",
  general: "General inquiry",
};

// Inquiry types that should also open an Opportunity (a lead in the pipeline).
const LEAD_TOPICS = new Set([
  "membership-associate",
  "membership-contributor",
  "partnership",
  "grant",
]);

function topicLabel(topic: string): string {
  return TOPIC_LABELS[topic] ?? topic ?? "Inquiry";
}

// --- low-level HTTP ---------------------------------------------------------

type AnyJson = Record<string, unknown>;

async function api(
  path: string,
  init: { method: string; body?: AnyJson }
): Promise<unknown> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method: init.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Relaticle ${init.method} ${path} -> ${res.status} ${text.slice(0, 400)}`
    );
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

function idOf(resp: unknown): string | undefined {
  const r = resp as { data?: { id?: string }; id?: string } | null;
  return r?.data?.id ?? r?.id;
}

// --- custom-field discovery (cached) ---------------------------------------

type CustomField = { id: string; code: string; name: string; type?: string };
const cfCache = new Map<string, { at: number; fields: CustomField[] }>();
const CF_TTL_MS = 10 * 60 * 1000;

async function customFields(entityType: string): Promise<CustomField[]> {
  const cached = cfCache.get(entityType);
  if (cached && Date.now() - cached.at < CF_TTL_MS) return cached.fields;

  const fields: CustomField[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = (await api(
      `/custom-fields?entity_type=${encodeURIComponent(entityType)}&page=${page}`,
      { method: "GET" }
    )) as { data?: unknown[]; links?: { next?: string | null } } | unknown[];
    const items = (Array.isArray(data) ? data : (data?.data ?? [])) as Array<
      Record<string, unknown>
    >;
    for (const it of items) {
      if (it.code) {
        fields.push({
          id: String(it.id ?? ""),
          code: String(it.code),
          name: String(it.name ?? ""),
          type: it.type ? String(it.type) : undefined,
        });
      }
    }
    const next = Array.isArray(data) ? null : data?.links?.next;
    if (!next || items.length === 0) break;
  }

  cfCache.set(entityType, { at: Date.now(), fields });
  return fields;
}

function pick(fields: CustomField[], re: RegExp): CustomField | undefined {
  return fields.find((f) => re.test(f.code) || re.test(f.name));
}

function cfValue(field: CustomField, value: string): unknown {
  // Wrap in an array only for clearly multi-valued field types; otherwise scalar.
  return /multi|array|tags|repeat|list/i.test(field.type ?? "")
    ? [value]
    : value;
}

/** POST with custom fields, retrying without them if the CRM rejects them. */
async function createWithFallback(
  path: string,
  base: AnyJson,
  custom: AnyJson
): Promise<unknown> {
  try {
    return await api(path, { method: "POST", body: { ...base, custom_fields: custom } });
  } catch (err) {
    if (Object.keys(custom).length === 0) throw err;
    console.warn(
      `[relaticle] ${path} create with custom_fields failed, retrying without them:`,
      String(err).slice(0, 200)
    );
    return api(path, { method: "POST", body: { ...base, custom_fields: {} } });
  }
}

// --- content helpers --------------------------------------------------------

function noteTitle(inq: Inquiry): string {
  const org = inq.organization ? ` (${inq.organization})` : "";
  return `${topicLabel(inq.topic)} — ${inq.name}${org}`.slice(0, 255);
}

function noteBody(inq: Inquiry): string {
  const lines = [
    `Inquiry type: ${topicLabel(inq.topic)}`,
    `Name: ${inq.name}`,
    `Email: ${inq.email}`,
    inq.organization ? `Organization: ${inq.organization}` : null,
    inq.role ? `Role: ${inq.role}` : null,
    inq.website ? `Website: ${inq.website}` : null,
    inq.source ? `Heard about us: ${inq.source}` : null,
    `Consent: yes (${inq.consentAt})`,
    "",
    "Message:",
    inq.message,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

// --- orchestration ----------------------------------------------------------

export async function submitInquiry(inq: Inquiry): Promise<CrmResult> {
  const result: CrmResult = {};

  // 1) Company (always create when an organization is given; no dedupe).
  if (inq.organization?.trim()) {
    const cf = await customFields("company");
    const fields: AnyJson = {};
    const domain = pick(cf, /domain|website|url|link/i);
    if (domain && inq.website) fields[domain.code] = cfValue(domain, inq.website);
    const company = await createWithFallback(
      "/companies",
      { name: inq.organization.trim() },
      fields
    );
    result.companyId = idOf(company);
  }

  // 2) Person (linked to the company).
  {
    const cf = await customFields("people");
    const fields: AnyJson = {};
    const email = pick(cf, /email/i);
    if (email) fields[email.code] = cfValue(email, inq.email);
    const role = pick(cf, /job.?title|role|position|title/i);
    if (role && inq.role) fields[role.code] = cfValue(role, inq.role);
    const web = pick(cf, /link|website|url/i);
    if (web && inq.website) fields[web.code] = cfValue(web, inq.website);
    const person = await createWithFallback(
      "/people",
      { name: inq.name, company_id: result.companyId ?? null },
      fields
    );
    result.personId = idOf(person);
  }

  // 3) Note carrying the full inquiry, linked to the person + company.
  {
    const cf = await customFields("note");
    const fields: AnyJson = {};
    const body = pick(cf, /body|content|description|note|message|text/i);
    if (body) fields[body.code] = cfValue(body, noteBody(inq));
    const note = await createWithFallback(
      "/notes",
      {
        title: noteTitle(inq),
        people_ids: result.personId ? [result.personId] : [],
        company_ids: result.companyId ? [result.companyId] : [],
      },
      fields
    );
    result.noteId = idOf(note);
  }

  // 4) Opportunity for lead-type inquiries.
  if (LEAD_TOPICS.has(inq.topic)) {
    const opp = await createWithFallback(
      "/opportunities",
      {
        name: noteTitle(inq),
        company_id: result.companyId ?? null,
        contact_id: result.personId ?? null,
      },
      {}
    );
    result.opportunityId = idOf(opp);
  }

  return result;
}

/** Best-effort ops alert (Discord/Slack-compatible webhook). No-op if unset. */
export async function alertOps(message: string): Promise<void> {
  if (!ALERT_WEBHOOK) return;
  try {
    await fetch(ALERT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
      cache: "no-store",
    });
  } catch {
    /* swallow — alerting must never throw */
  }
}
