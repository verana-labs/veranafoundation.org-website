import type { Metadata } from "next";
import { getActiveAgreement } from "@/app/lib/agreement";
import { activeTiers } from "@/app/lib/fees";
import { currentUser } from "@/app/lib/authz";
import { db } from "@/app/lib/db";
import { readApplyDraft } from "@/app/lib/apply-draft-cookie";
import ApplyForm from "./ApplyForm";
import { previewAgreement } from "./actions";

export const metadata: Metadata = { title: "Join the Foundation" };

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const { class: cls } = await searchParams;
  const initialClass = cls === "associate" ? "associate" : "contributor";
  const agreement = await getActiveAgreement();

  // A user may hold at most one individual membership — if they already do, the
  // "individual" contributor option is disabled.
  const user = await currentUser();

  // Coming back from sign-in: the Sign action stored the typed details in a
  // draft cookie (apply-draft.ts). Prefill the form and, when the agreement
  // renders, reopen the review step so the user only has to accept and sign.
  const draft = user ? await readApplyDraft() : null;
  let initialPreview: string | undefined;
  if (draft && agreement) {
    const res = await previewAgreement({
      class: draft.class,
      type: draft.type,
      legalName: draft.legalName,
      entityType: draft.entityType,
      jurisdiction: draft.jurisdiction,
      registeredAddress: draft.registeredAddress,
      countryOfResidence: draft.countryOfResidence,
      country: draft.country,
      signerName: draft.signerName ?? (draft.type === "individual" ? draft.legalName : undefined),
      signerTitle: draft.signerTitle,
    });
    initialPreview = res.html;
  }

  const hasIndividual = user
    ? (await db.userMember.findFirst({
        where: { userId: user.id, member: { type: "individual" } },
        select: { id: true },
      })) != null
    : false;

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
              agreementVersion={agreement.version}
              tiers={await activeTiers()}
              initialClass={initialClass}
              hasIndividual={hasIndividual}
              signedIn={!!user}
              draft={draft}
              initialPreview={initialPreview}
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
