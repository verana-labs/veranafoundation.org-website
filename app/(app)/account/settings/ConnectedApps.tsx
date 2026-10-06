"use client";

import { useState, useTransition } from "react";
import LocalTime from "@/app/components/LocalTime";
import { disconnectApp } from "./actions";

export type GrantRow = {
  grantId: string;
  clientName: string;
  clientUri: string | null;
  scope: "read" | "write";
  createdAtIso: string;
  lastUsedAtIso: string | null;
};

// Applications connected through OAuth (claude.ai connectors and the like).
export default function ConnectedApps({ grants, mcpUrl }: { grants: GrantRow[]; mcpUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="max-w-3xl">
      <p className="text-sm text-muted">
        Applications that connected with &ldquo;Sign in with Verana Foundation&rdquo;,
        such as a claude.ai connector pointed at <code>{mcpUrl}</code>. Each acts as
        you, with your role in every group. Disconnecting revokes its access
        immediately; the application will ask you to sign in again if you reconnect.
      </p>
      {grants.length === 0 ? (
        <p className="text-sm text-muted mt-3">No connected application.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {grants.map((g) => (
            <li key={g.grantId} className="wg-tile flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-medium">{g.clientName}</span>{" "}
                <span className={`badge ${g.scope === "write" ? "badge-purple" : ""}`}>
                  {g.scope === "write" ? "read-write" : "read"}
                </span>
                {g.clientUri && (
                  <a href={g.clientUri} rel="noopener" className="text-purple hover:underline ml-2 text-xs">
                    {g.clientUri}
                  </a>
                )}
                <span className="block text-xs text-muted mt-1">
                  Connected <LocalTime iso={g.createdAtIso} />
                  {g.lastUsedAtIso ? (
                    <>
                      {" "}· last used <LocalTime iso={g.lastUsedAtIso} />
                    </>
                  ) : (
                    " · not used yet"
                  )}
                </span>
              </span>
              <button
                type="button"
                className="btn text-sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Disconnect ${g.clientName}? It loses access immediately.`)) return;
                  startTransition(async () => {
                    const res = await disconnectApp(g.grantId);
                    setError(res.error ?? null);
                  });
                }}
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
