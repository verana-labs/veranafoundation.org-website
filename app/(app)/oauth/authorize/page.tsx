import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser } from "@/app/lib/authz";
import { mcpResourceUrl, parseScope, redirectUriMatches, resourceOk } from "@/app/lib/oauth";
import { personName } from "@/app/lib/working-groups";
import { decideAuthorization } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Authorize an application" };

type Params = {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  resource?: string;
  error?: string;
};

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <section>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <p className="tag mb-4">Authorization</p>
        <h1 className="display text-3xl">{title}</h1>
        <p className="mt-4 text-muted max-w-xl">{detail}</p>
      </div>
    </section>
  );
}

/**
 * OAuth 2.1 consent screen (ADR-0005 amendment). The client is validated
 * before anything is shown; the user signs in with the usual methods first.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const q = await searchParams;
  if (q.error) {
    return <Problem title="This authorization request is invalid" detail="The application sent a request we could not verify. Go back to the application and try again." />;
  }
  const client = q.client_id ? await db.oAuthClient.findUnique({ where: { id: q.client_id } }) : null;
  if (!client) return <Problem title="Unknown application" detail="No application is registered with this client id." />;
  if (!q.redirect_uri || !client.redirectUris.some((r) => redirectUriMatches(r, q.redirect_uri!))) {
    return <Problem title="Redirect not allowed" detail="The application asked us to send you to an address it did not register." />;
  }
  if (q.response_type !== "code") return <Problem title="Unsupported request" detail="Only the authorization code flow is supported." />;
  if (!q.code_challenge || (q.code_challenge_method ?? "S256") !== "S256") {
    return <Problem title="PKCE required" detail="The application must use PKCE with S256." />;
  }
  const scope = parseScope(q.scope);
  if (!scope) return <Problem title="Unknown permissions requested" detail="The application asked for permissions this site does not define." />;
  if (!resourceOk(q.resource)) return <Problem title="Unknown resource" detail={`This server only issues tokens for ${mcpResourceUrl()}.`} />;

  const user = await currentUser();
  if (!user?.id) {
    const here = `/oauth/authorize?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString()}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(here)}`);
  }
  const record = await db.user.findUnique({ where: { id: user.id } });
  const write = scope.includes("write");

  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Authorization</p>
          <h1 className="display text-4xl leading-tight">
            <span className="text-purple">{client.name}</span> wants to use the working groups as you
          </h1>
          <div className="accent-line mt-6" />
        </div>
      </section>
      <section>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="max-w-xl">
            <p className="text-muted">
              You are signed in as <strong className="text-ink">{record ? personName(record) : user.email}</strong>
              {user.email ? ` (${user.email})` : ""}. The application would act with your own role in each
              working group: participant, lead or admin, never more.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              <li className="wg-tile">
                <strong>Read</strong> — list the groups, read schedules and upcoming meetings, published
                minutes, and the sessions and transcripts of groups you belong to.
              </li>
              {write && (
                <li className="wg-tile" style={{ borderLeftColor: "var(--color-purple)" }}>
                  <strong>Write</strong> — everything you can do on the site: join or leave groups,
                  and as a lead manage people, meetings, settings and publish minutes. Every change is
                  recorded in the audit log as made through this application.
                </li>
              )}
            </ul>
            {client.clientUri && (
              <p className="text-xs text-muted mt-3">
                Application site: <a href={client.clientUri} rel="noopener" className="text-purple hover:underline">{client.clientUri}</a>
              </p>
            )}
            <p className="text-xs text-muted mt-3">
              You can disconnect it at any time from <a href="/account/settings" className="text-purple hover:underline">your settings</a>.
              Access lasts until you do, with short-lived tokens renewed by the application.
            </p>
            <form action={decideAuthorization} className="mt-8 flex gap-3">
              <input type="hidden" name="client_id" value={client.id} />
              <input type="hidden" name="redirect_uri" value={q.redirect_uri} />
              <input type="hidden" name="state" value={q.state ?? ""} />
              <input type="hidden" name="code_challenge" value={q.code_challenge} />
              <input type="hidden" name="scope" value={scope.join(" ")} />
              <input type="hidden" name="resource" value={q.resource ?? ""} />
              <button type="submit" name="decision" value="approve" className="btn btn-primary">
                Allow {client.name}
              </button>
              <button type="submit" name="decision" value="deny" className="btn">
                Deny
              </button>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
