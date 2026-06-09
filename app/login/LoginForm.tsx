"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope, faCircleCheck } from "@fortawesome/free-solid-svg-icons";

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="flex-shrink-0">
      <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  if (sent) {
    return (
      <div className="text-center py-2">
        <FontAwesomeIcon icon={faCircleCheck} className="text-green-600 text-3xl" />
        <p className="text-sm text-muted mt-3">
          We emailed a sign-in link to{" "}
          <strong className="text-ink">{email}</strong>. Open it to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl })}
        className="btn btn-secondary w-full flex items-center justify-center gap-2.5"
      >
        <GoogleLogo /> Continue with Google
      </button>
      <button
        type="button"
        onClick={() => signIn("github", { callbackUrl })}
        className="btn btn-secondary w-full flex items-center justify-center gap-2.5"
      >
        <FontAwesomeIcon icon={faGithub} className="text-base" /> Continue with GitHub
      </button>

      <div className="flex items-center gap-3 my-1 text-xs text-muted">
        <span className="h-px flex-1 bg-rule" />
        or
        <span className="h-px flex-1 bg-rule" />
      </div>

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
        <div className="relative">
          <FontAwesomeIcon
            icon={faEnvelope}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm"
          />
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-rule bg-surface pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
    </div>
  );
}
