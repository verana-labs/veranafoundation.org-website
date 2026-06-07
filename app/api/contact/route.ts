import { NextRequest, NextResponse } from "next/server";
import {
  submitInquiry,
  crmConfigured,
  alertOps,
  type Inquiry,
} from "@/app/lib/relaticle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_MESSAGE = 50;
const MAX_MESSAGE = 4000;

// Naive in-memory rate limit. The deployment runs a single replica, so a
// per-process map is sufficient as a best-effort guard (in addition to the
// CRM's own throttle:api).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_MAX;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: NextRequest) {
  let data: Record<string, unknown>;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  // Honeypot: a filled hidden field means a bot. Pretend success, do nothing.
  if (typeof data.website_hp === "string" && data.website_hp.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  // Time-to-submit: human submissions take more than a couple of seconds.
  const renderedAt = Number(data.rendered_at);
  if (Number.isFinite(renderedAt) && Date.now() - renderedAt < 2500) {
    return NextResponse.json({ ok: true });
  }

  const topic = String(data.topic ?? "").trim();
  const name = String(data.name ?? "").trim();
  const email = String(data.email ?? "").trim();
  const message = String(data.message ?? "").trim();
  const consent =
    data.consent === true || data.consent === "on" || data.consent === "true";

  const fields: string[] = [];
  if (!topic) fields.push("topic");
  if (!name) fields.push("name");
  if (!EMAIL_RE.test(email)) fields.push("email");
  if (message.length < MIN_MESSAGE || message.length > MAX_MESSAGE)
    fields.push("message");
  if (!consent) fields.push("consent");
  if (fields.length > 0) {
    return NextResponse.json(
      { ok: false, error: "validation", fields },
      { status: 422 }
    );
  }

  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const inquiry: Inquiry = {
    topic,
    name,
    email,
    organization: String(data.organization ?? "").trim() || undefined,
    role: String(data.role ?? "").trim() || undefined,
    website: String(data.website ?? "").trim() || undefined,
    message,
    source: String(data.source ?? "").trim() || undefined,
    consentAt: new Date().toISOString(),
  };

  // Best-effort: a CRM problem must never fail the user's submission.
  if (!crmConfigured()) {
    console.warn(
      "[contact] Relaticle not configured; inquiry not sent to CRM:",
      { topic, name, email, organization: inquiry.organization }
    );
    return NextResponse.json({ ok: true });
  }

  try {
    const ids = await submitInquiry(inquiry);
    console.info("[contact] CRM records created", ids);
  } catch (err) {
    console.error("[contact] CRM submission failed", err, {
      topic,
      name,
      email,
      organization: inquiry.organization,
    });
    await alertOps(
      `Contact form: CRM write failed for ${name} <${email}> (${topic}). ${String(
        err
      ).slice(0, 300)}`
    );
    // Still report success to the user (best-effort + alert).
  }

  return NextResponse.json({ ok: true });
}
