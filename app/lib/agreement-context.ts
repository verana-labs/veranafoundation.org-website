import { AgreementContext, MemberType, MembershipClass } from "@/app/lib/agreement-template";
import { countryName } from "@/app/lib/countries";

/**
 * Raw apply-form fields, as captured by either step of the /apply wizard. Used to
 * build a single AgreementContext so the on-screen preview and the finally-signed
 * PDF are rendered from identical data.
 */
export type ApplyInput = {
  class: MembershipClass;
  /** Contributor: chosen by the applicant. Associate is always an organization. */
  type?: MemberType;
  legalName?: string;
  entityType?: string | null;
  jurisdiction?: string | null; // contributor org (country code)
  registeredAddress?: string | null;
  countryOfResidence?: string | null; // contributor individual (country code)
  country?: string | null; // associate (country code)
  signerName?: string;
  signerTitle?: string | null;
  email?: string | null;
  effectiveDate: Date;
};

function display(code?: string | null): string | null {
  if (!code) return null;
  return countryName(code) ?? code;
}

export function toAgreementContext(i: ApplyInput): AgreementContext {
  const isAssociate = i.class === "associate";
  const memberType: MemberType = isAssociate ? "organization" : i.type ?? "individual";
  const isOrg = memberType === "organization";

  const jurisdiction = display(
    isAssociate ? i.country : isOrg ? i.jurisdiction : i.countryOfResidence,
  );

  return {
    memberType,
    membershipClass: i.class,
    memberLegalName: i.legalName ?? "",
    entityForm: isOrg ? i.entityType ?? null : null,
    jurisdiction,
    // Organizations always show an address clause; fall back to the country
    // when no registered address was given.
    memberAddress: isOrg ? (i.registeredAddress?.trim() || jurisdiction) : null,
    signerName: i.signerName ?? "",
    signerTitle: isOrg ? i.signerTitle ?? null : null,
    memberEmail: i.email ?? null,
    effectiveDate: i.effectiveDate,
  };
}
