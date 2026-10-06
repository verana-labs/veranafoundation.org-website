import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/app/lib/authz";
import { db } from "@/app/lib/db";
import SettingsForm from "./SettingsForm";
import TokensPanel from "./TokensPanel";
import { listApiTokens } from "@/app/lib/api-tokens";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user?.id) redirect("/login");
  const [record, tokens] = await Promise.all([
    db.user.findUnique({ where: { id: user.id } }),
    listApiTokens(user.id),
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
          <div className="mt-4">
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
