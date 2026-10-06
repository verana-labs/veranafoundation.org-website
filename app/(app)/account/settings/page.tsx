import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/app/lib/authz";
import { db } from "@/app/lib/db";
import SettingsForm from "./SettingsForm";
import TokensPanel from "./TokensPanel";
import ConnectedApps from "./ConnectedApps";
import { listApiTokens } from "@/app/lib/api-tokens";
import { listGrants } from "@/app/lib/oauth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user?.id) redirect("/login");
  const [record, tokens, grants] = await Promise.all([
    db.user.findUnique({ where: { id: user.id } }),
    listApiTokens(user.id),
    listGrants(user.id),
  ]);
  const mcpUrl = `${process.env.AUTH_URL ?? "https://veranafoundation.org"}/api/mcp`;

  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Settings</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">
            How you appear
          </h1>
          <div className="accent-line mt-6" />
        </div>
      </section>

      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <SettingsForm
            displayName={record?.displayName ?? null}
            providerName={record?.name ?? null}
          />
        </div>
      </section>

      {/* MCP access tokens (ADR-0005) */}
      <section>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="display text-2xl">AI assistants (MCP)</h2>
          <p className="text-sm text-muted mt-2 max-w-3xl">
            Two ways to connect an assistant to the working groups. <strong>claude.ai</strong>{" "}
            (web and desktop): add a custom connector with the URL <code>{mcpUrl}</code>, then sign
            in and approve when asked — it appears below under connected applications.{" "}
            <strong>Claude Code, Cursor and other clients</strong> that take a bearer token: create a
            personal access token further down.
          </p>
          <h3 className="display text-lg mt-8">Connected applications</h3>
          <div className="mt-3">
            <ConnectedApps
              mcpUrl={mcpUrl}
              grants={grants.map((g) => ({
                grantId: g.grantId,
                clientName: g.clientName,
                clientUri: g.clientUri,
                scope: g.scope,
                createdAtIso: g.createdAt.toISOString(),
                lastUsedAtIso: g.lastUsedAt?.toISOString() ?? null,
              }))}
            />
          </div>
          <h3 className="display text-lg mt-10">Personal access tokens</h3>
          <div className="mt-3">
            <TokensPanel
              mcpUrl={mcpUrl}
              tokens={tokens.map((t) => ({
                id: t.id,
                name: t.name,
                prefix: t.prefix,
                scope: t.scope,
                createdAtIso: t.createdAt.toISOString(),
                lastUsedAtIso: t.lastUsedAt?.toISOString() ?? null,
                expiresAtIso: t.expiresAt?.toISOString() ?? null,
                revokedAtIso: t.revokedAt?.toISOString() ?? null,
              }))}
            />
          </div>
        </div>
      </section>
    </>
  );
}
