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
    <>
      {/* Hero */}
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Join</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">
            Join the Foundation
          </h1>
          <div className="accent-line mt-6" />
          <p className="mt-8 text-lg text-muted max-w-2xl leading-relaxed">
            Contributor membership is free; Associate (supporting) membership
            pays annual dues by organization size. Review and sign the
            Membership Agreement to join.
          </p>
        </div>
      </section>

      {/* Application */}
      <section>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {agreement ? (
            <ApplyForm
              agreementUrl={agreement.url}
              agreementVersion={agreement.version}
              initialClass={initialClass}
            />
          ) : (
            <p className="text-muted">
              Membership applications aren&rsquo;t open yet — no Membership
              Agreement is configured.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
