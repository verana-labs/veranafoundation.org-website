import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { getActiveAgreement } from "@/app/lib/agreement";
import AgreementForm from "./AgreementForm";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.email))) notFound();

  const agreement = await getActiveAgreement();

  return (
    <div className="prose-body max-w-2xl">
      <h1 className="display text-3xl">Settings</h1>

      <h2 className="display text-xl mt-8">Membership Agreement</h2>
      <p className="text-muted text-sm">
        The PDF shown to applicants at <code>/apply</code>. Publishing a new
        version affects future signatures only; existing signatures keep the
        version they signed.
      </p>
      {agreement && (
        <p className="text-sm mt-2">
          Active: <strong>{agreement.version}</strong> —{" "}
          <a href={agreement.url} target="_blank" rel="noopener">
            {agreement.url}
          </a>
        </p>
      )}
      <div className="mt-4">
        <AgreementForm
          current={
            agreement
              ? { version: agreement.version, url: agreement.url, hash: agreement.hash }
              : null
          }
        />
      </div>
    </div>
  );
}
