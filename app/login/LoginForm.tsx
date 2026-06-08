"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="btn"
        onClick={() => signIn("google", { callbackUrl })}
      >
        Continue with Google
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => signIn("github", { callbackUrl })}
      >
        Continue with GitHub
      </button>

      <div className="flex items-center gap-3 my-1 text-xs text-muted">
        <span className="h-px flex-1 bg-rule" />
        or
        <span className="h-px flex-1 bg-rule" />
      </div>

      {sent ? (
        <p className="text-sm text-muted">
          Check your inbox — we emailed a sign-in link to <strong>{email}</strong>.
        </p>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            await signIn("nodemailer", { email, callbackUrl, redirect: false });
            setPending(false);
            setSent(true);
          }}
        >
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-rule bg-surface px-3 py-2 text-sm"
          />
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      )}
    </div>
  );
}
