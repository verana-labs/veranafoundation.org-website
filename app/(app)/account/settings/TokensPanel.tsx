"use client";

import { useActionState, useState, useTransition } from "react";
import LocalTime from "@/app/components/LocalTime";
import { createToken, revokeToken, type TokenState } from "./actions";

export type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "write";
  createdAtIso: string;
  lastUsedAtIso: string | null;
  expiresAtIso: string | null;
  revokedAtIso: string | null;
};

// Personal access tokens for the MCP server: created here, shown once, revocable.
export default function TokensPanel({
  tokens,
  mcpUrl,
}: {
  tokens: TokenRow[];
  mcpUrl: string;
}) {
  const [state, action, pending] = useActionState<TokenState, FormData>(createToken, {});
  const [revoking, startTransition] = useTransition();
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const active = tokens.filter((t) => !t.revokedAtIso);
  const revoked = tokens.filter((t) => t.revokedAtIso);

  const claudeCommand = (secret: string) =>
    `claude mcp add --transport http veranafoundation ${mcpUrl} --header "Authorization: Bearer ${secret}"`;

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-muted">
        Connect an AI assistant (Claude Code, Cursor, any MCP client that sends a
        bearer token) to the working groups through the site&apos;s MCP server at{" "}
        <code>{mcpUrl}</code>. The assistant acts as you, with your role in each
        group; a <strong>read</strong> token can only look things up, a{" "}
        <strong>read-write</strong> one can do everything you can do on the site.
        Every change made this way is recorded in the audit log.
      </p>

      {state.secret && (
        <div className="wg-tile mt-6" style={{ borderLeftColor: "var(--color-purple)" }}>
          <p className="font-medium">Token &ldquo;{state.name}&rdquo; created — copy it now</p>
          <p className="text-sm text-muted mt-1">
            This is the only time the secret is shown. Store it in your assistant&apos;s
            configuration; if you lose it, revoke it and create a new one.
          </p>
          <pre className="mt-3 text-sm whitespace-pre-wrap break-all font-mono p-3 rounded bg-rule/30">{state.secret}</pre>
          <p className="text-sm text-muted mt-3">For Claude Code:</p>
          <pre className="mt-1 text-xs whitespace-pre-wrap break-all font-mono p-3 rounded bg-rule/30">{claudeCommand(state.secret)}</pre>
          <button
            type="button"
            className="btn text-sm mt-3"
            onClick={() => {
              navigator.clipboard?.writeText(state.secret!).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy the token"}
          </button>
        </div>
      )}

      <h3 className="display text-lg mt-8">Your tokens</h3>
      {active.length === 0 ? (
        <p className="text-sm text-muted mt-2">No active token.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {active.map((t) => (
            <li key={t.id} className="wg-tile flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-medium">{t.name}</span>{" "}
                <code className="text-muted">{t.prefix}…</code>{" "}
                <span className={`badge ${t.scope === "write" ? "badge-purple" : ""}`}>
                  {t.scope === "write" ? "read-write" : "read"}
                </span>
                <span className="block text-xs text-muted mt-1">
                  Created <LocalTime iso={t.createdAtIso} />
                  {t.lastUsedAtIso ? (
                    <>
                      {" "}· last used <LocalTime iso={t.lastUsedAtIso} />
                    </>
                  ) : (
                    " · never used"
                  )}
                  {t.expiresAtIso ? (
                    <>
                      {" "}· expires <LocalTime iso={t.expiresAtIso} format="date" />
                    </>
                  ) : (
                    " · no expiry"
                  )}
                </span>
              </span>
              <button
                type="button"
                className="btn text-sm"
                disabled={revoking}
                onClick={() => {
                  if (!confirm(`Revoke "${t.name}"? Assistants using it stop working immediately.`)) return;
                  startTransition(async () => {
                    const res = await revokeToken(t.id);
                    setRevokeError(res.error ?? null);
                  });
                }}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      {revokeError && <p className="text-sm text-red-600 mt-2">{revokeError}</p>}
      {revoked.length > 0 && (
        <p className="text-xs text-muted mt-2">
          {revoked.length} revoked token{revoked.length === 1 ? "" : "s"} kept for the audit trail.
        </p>
      )}

      <h3 className="display text-lg mt-8">Create a token</h3>
      <form action={action} className="mt-3 max-w-md space-y-1">
        <div className="form-field">
          <label htmlFor="token-name">Name</label>
          <input id="token-name" name="name" required maxLength={80} placeholder="Claude Code on my laptop" />
        </div>
        <div className="grid sm:grid-cols-2 gap-x-5">
          <div className="form-field">
            <label htmlFor="token-scope">Access</label>
            <select id="token-scope" name="scope" defaultValue="read">
              <option value="read">Read only</option>
              <option value="write">Read and write</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="token-expiry">Expires</label>
            <select id="token-expiry" name="expiresInDays" defaultValue="90">
              <option value="30">In 30 days</option>
              <option value="90">In 90 days</option>
              <option value="365">In a year</option>
              <option value="never">Never</option>
            </select>
          </div>
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
          {pending ? "Creating…" : "Create token"}
        </button>
      </form>
    </div>
  );
}
