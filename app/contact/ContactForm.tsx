"use client";

import { useEffect, useState } from "react";

const TOPICS = [
  { value: "membership-associate", label: "Membership — Associate" },
  { value: "membership-contributor", label: "Membership — Contributor" },
  { value: "working-group", label: "Working group participation" },
  { value: "grant", label: "Grant / ecosystem" },
  { value: "partnership", label: "Partnership / integration" },
  { value: "press", label: "Press or analyst" },
  { value: "general", label: "General inquiry" },
];

const MIN_MESSAGE = 50;
const MAX_MESSAGE = 4000;

export default function ContactForm() {
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [renderedAt, setRenderedAt] = useState("");

  // Preselect inquiry type from ?topic= (set by the Join page buttons) and
  // record render time for a server-side time-to-submit check.
  useEffect(() => {
    setRenderedAt(String(Date.now()));
    const params = new URLSearchParams(window.location.search);
    const t = params.get("topic");
    if (t && TOPICS.some((o) => o.value === t)) setTopic(t);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;

    // Honeypot (hidden field): silently treat as success.
    const honeypot = (form.elements.namedItem("website_hp") as HTMLInputElement)
      ?.value;
    if (honeypot) {
      setStatus("success");
      return;
    }

    if (!form.checkValidity() || message.trim().length < MIN_MESSAGE) {
      form.reportValidity();
      setStatus("error");
      return;
    }

    const fd = new FormData(form);
    const payload = {
      topic: fd.get("topic"),
      name: fd.get("name"),
      email: fd.get("email"),
      organization: fd.get("organization"),
      role: fd.get("role"),
      website: fd.get("website"),
      message: fd.get("message"),
      source: fd.get("source"),
      consent: (form.elements.namedItem("consent") as HTMLInputElement)?.checked,
      website_hp: honeypot ?? "",
      rendered_at: renderedAt,
    };

    setStatus("submitting");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("success");
      form.reset();
      setTopic("");
      setMessage("");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="card" role="status" aria-live="polite">
        <h3 className="display text-lg">Thank you.</h3>
        <p className="text-sm text-muted leading-relaxed">
          We received your message and will route it to the right person. We
          reply within a few business days.
        </p>
        <button
          type="button"
          className="btn btn-ghost text-sm self-start"
          onClick={() => setStatus("idle")}
        >
          Send another →
        </button>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <form className="space-y-1" onSubmit={handleSubmit} noValidate>
      {/* Honeypot — hidden from users */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <label>
          Leave this field empty
          <input name="website_hp" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input type="hidden" name="rendered_at" value={renderedAt} readOnly />

      <div className="form-field">
        <label htmlFor="topic">
          Inquiry type <span className="req">*</span>
        </label>
        <select
          id="topic"
          name="topic"
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        >
          <option value="">Select one</option>
          {TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-5">
        <div className="form-field">
          <label htmlFor="name">
            Name <span className="req">*</span>
          </label>
          <input id="name" name="name" type="text" required autoComplete="name" />
        </div>
        <div className="form-field">
          <label htmlFor="email">
            Email <span className="req">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </div>
        <div className="form-field">
          <label htmlFor="organization">
            Organization{" "}
            <span className="opt">(required for membership / partnership / press)</span>
          </label>
          <input
            id="organization"
            name="organization"
            type="text"
            autoComplete="organization"
          />
        </div>
        <div className="form-field">
          <label htmlFor="role">
            Role or title <span className="opt">(optional)</span>
          </label>
          <input id="role" name="role" type="text" />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="website">
          Website or LinkedIn <span className="opt">(optional)</span>
        </label>
        <input id="website" name="website" type="url" placeholder="https://…" />
      </div>

      <div className="form-field">
        <label htmlFor="message">
          Message <span className="req">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={6}
          required
          minLength={MIN_MESSAGE}
          maxLength={MAX_MESSAGE}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What is your organization, what are you interested in, and what timeline are you on?"
        />
        <p className="hint">
          {message.length} / {MAX_MESSAGE} (min {MIN_MESSAGE})
        </p>
      </div>

      <div className="form-field">
        <label htmlFor="source">
          How did you hear about us <span className="opt">(optional)</span>
        </label>
        <select id="source" name="source">
          <option value="">(none)</option>
          <option>GitHub</option>
          <option>IIW or standards venue</option>
          <option>Verana Council</option>
          <option>Referral</option>
          <option>Search</option>
          <option>Other</option>
        </select>
      </div>

      <div className="flex items-start gap-3 py-2">
        <input id="consent" name="consent" type="checkbox" required className="mt-1" />
        <label htmlFor="consent" className="text-sm text-muted">
          I consent to the Verana Foundation (in formation, represented by 2060
          OÜ) storing this inquiry to respond to me. See the{" "}
          <a href="/privacy" className="text-purple underline">
            Privacy Policy
          </a>
          . <span className="req">*</span>
        </label>
      </div>

      {status === "error" && (
        <p className="text-sm" style={{ color: "#c0392b" }} role="alert">
          Please complete the required fields (message must be at least{" "}
          {MIN_MESSAGE} characters), then try again.
        </p>
      )}

      <div className="pt-2 flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Sending…" : "Send message"}
        </button>
        <span className="text-xs text-muted">
          We do not publish email addresses; messages are routed internally.
        </span>
      </div>
    </form>
  );
}
