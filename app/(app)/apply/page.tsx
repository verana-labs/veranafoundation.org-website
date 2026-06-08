import type { Metadata } from "next";
import { getActiveAgreement } from "@/app/lib/agreement";
import ApplyForm from "./ApplyForm";

export const metadata: Metadata = { title: "Join the Foundation" };

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const { class: cls } = await searchParams;
  const initialClass = cls === "associate" ? "associate" : "contributor";
  const agreement = await getActiveAgreement();

  return (
    <div className="prose-body max-w-2xl">
      <h1 className="display text-3xl">Join the Foundation</h1>
      <p className="text-muted mt-2">
        Contributor membership is free; Associate (supporting) membership pays
        annual dues by organization size. Review and sign the Membership
        Agreement to join.
      </p>

      {agreement ? (
        <div className="mt-8">
          <ApplyForm
            agreementUrl={agreement.url}
            agreementVersion={agreement.version}
            initialClass={initialClass}
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
