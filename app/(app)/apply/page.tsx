import type { Metadata } from "next";
import { getActiveAgreement } from "@/app/lib/agreement";
import ApplyForm from "./ApplyForm";

export const metadata: Metadata = { title: "Join as a Contributor" };

export default async function ApplyPage() {
  const agreement = await getActiveAgreement();

  return (
    <div className="prose-body max-w-2xl">
      <h1 className="display text-3xl">Join as a Contributor</h1>
      <p className="text-muted mt-2">
        Contributor membership is free. Review and sign the Membership Agreement
        to join. Associate (supporting) membership with dues is coming soon.
      </p>

      {agreement ? (
        <div className="mt-8">
          <ApplyForm
            agreementUrl={agreement.url}
            agreementVersion={agreement.version}
          />
        </div>
      ) : (
        <p className="text-muted mt-8">
          Membership applications aren&rsquo;t open yet — no Membership Agreement
          is configured.
        </p>
      )}
    </div>
  );
}
