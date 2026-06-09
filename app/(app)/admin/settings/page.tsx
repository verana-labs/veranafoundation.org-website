import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { listVersions, readVersionFile } from "@/app/lib/agreement-versions";
import { renderTemplateHtml } from "@/app/lib/agreement-html";
import VersionSelector from "./VersionSelector";

export const metadata: Metadata = { title: "Settings" };

const STATUS_NOTE: Record<string, string> = {
  modified: "modified since publish — not selectable",
  missing: "file missing — not selectable",
  new: "new (never activated)",
  ok: "matches published hash",
};

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) notFound();

  const versions = await listVersions();
  const active = versions.find((v) => v.active) ?? null;
  const others = versions.filter((v) => !v.active);

  const activeContent =
    active && active.currentHash ? await readVersionFile(active.filename).catch(() => null) : null;
  const activeHtml = activeContent ? renderTemplateHtml(activeContent) : null;
  const activeDrifted = !!active && active.currentHash !== active.pinnedHash;

  return (
    <div className="prose-body max-w-3xl">
      <h1 className="display text-3xl">Settings</h1>

      <h2 className="display text-xl mt-8">Membership Agreement</h2>
      <p className="text-muted text-sm">
        Versions live as Markdown files in <code>legal/</code>. Each new version is a
        new file; never edit a published one. The active version is shown to
        applicants at <code>/apply</code>; existing signatures keep the version they
        signed.
      </p>

      <h3 className="display text-lg mt-6">Active Version</h3>
      {active ? (
        <>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted">Document</dt>
            <dd>
              <code>{active.filename}</code> ({active.version})
            </dd>
            <dt className="text-muted">Integrity hash</dt>
            <dd className="break-all font-mono text-xs">{active.pinnedHash}</dd>
          </dl>
          {activeDrifted && (
            <p className="text-sm text-red-600 mt-2">
              ⚠ The file on disk no longer matches this hash
              {active.currentHash ? "" : " (file missing)"} — signing is blocked until
              it is restored.
            </p>
          )}
          {activeHtml ? (
            <div
              className="agreement-prose mt-4 max-h-[28rem] overflow-y-auto rounded border border-rule bg-surface p-5"
              dangerouslySetInnerHTML={{ __html: activeHtml }}
            />
          ) : (
            <p className="text-sm text-muted mt-2">Content unavailable.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted mt-2">No active version configured.</p>
      )}

      <h3 className="display text-lg mt-8">Other Versions</h3>
      <VersionSelector
        options={others.map((v) => ({
          filename: v.filename,
          version: v.version,
          selectable: v.selectable,
          note: STATUS_NOTE[v.status] ?? v.status,
        }))}
      />
    </div>
  );
}
