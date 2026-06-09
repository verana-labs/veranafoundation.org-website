import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Personalises the Membership Agreement template (legal/membership-agreement.template.md)
 * for a specific signer. One template serves all three use cases — individual
 * contributor, organization contributor, organization associate — driven by two
 * facts: the member type and the membership class.
 *
 * Template syntax:
 *   {{value}}                          — substituted with a context value
 *   <!--IF:flag-->A<!--ELSE-->B<!--ENDIF-->  — A when `flag` is true, else B (ELSE optional)
 * IF blocks may be nested. Flags and values both come from buildAgreementValues().
 */

export type MemberType = "organization" | "individual";
export type MembershipClass = "associate" | "contributor";

export type AgreementContext = {
  memberType: MemberType;
  membershipClass: MembershipClass;
  memberLegalName: string;
  /** Organization only — e.g. "corporation"; falls back to "legal entity". */
  entityForm?: string | null;
  /** Country/jurisdiction (org place of organization, or individual residence). */
  jurisdiction?: string | null;
  /** Org registered address; optional for individuals. */
  memberAddress?: string | null;
  signerName: string;
  /** Organization only — the signer's role. */
  signerTitle?: string | null;
  effectiveDate: Date;
};

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "legal",
  "membership-agreement.template.md",
);

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Resolve the template context into boolean flags and string values. */
export function buildAgreementValues(ctx: AgreementContext): {
  flags: Record<string, boolean>;
  values: Record<string, string>;
} {
  const isOrg = ctx.memberType === "organization";
  const isAssociate = ctx.membershipClass === "associate";
  const address = (ctx.memberAddress ?? "").trim();
  const d = ctx.effectiveDate;

  const flags = {
    is_organization: isOrg,
    is_individual: !isOrg,
    is_associate: isAssociate,
    is_contributor: !isAssociate,
    has_member_address: address.length > 0,
  };

  const values = {
    member_legal_name: ctx.memberLegalName.trim(),
    entity_form: (ctx.entityForm ?? "").trim() || "legal entity",
    jurisdiction: (ctx.jurisdiction ?? "").trim(),
    member_address: address,
    signer_name: ctx.signerName.trim(),
    signer_title: (ctx.signerTitle ?? "").trim(),
    effective_day: ordinal(d.getUTCDate()),
    effective_month: MONTHS[d.getUTCMonth()],
    effective_year: String(d.getUTCFullYear()),
    effective_date: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    associate_checkbox: isAssociate ? "☒" : "☐",
    contributor_checkbox: isAssociate ? "☐" : "☒",
  };

  return { flags, values };
}

/** Resolve <!--IF:flag-->...<!--ELSE-->...<!--ENDIF--> blocks, innermost first. */
function resolveConditionals(text: string, flags: Record<string, boolean>): string {
  // Matches an IF block whose body contains no further IF/ENDIF — i.e. the
  // innermost block — so repeated passes collapse arbitrary nesting bottom-up.
  const innermost = /<!--IF:(\w+)-->((?:(?!<!--IF:|<!--ENDIF-->)[\s\S])*?)<!--ENDIF-->/;
  let out = text;
  let guard = 0;
  while (innermost.test(out)) {
    if (++guard > 1000) throw new Error("agreement template: unbalanced IF/ENDIF");
    out = out.replace(innermost, (_m, flag: string, body: string) => {
      const elseIdx = body.indexOf("<!--ELSE-->");
      const whenTrue = elseIdx === -1 ? body : body.slice(0, elseIdx);
      const whenFalse = elseIdx === -1 ? "" : body.slice(elseIdx + "<!--ELSE-->".length);
      if (!(flag in flags)) throw new Error(`agreement template: unknown flag "${flag}"`);
      return flags[flag] ? whenTrue : whenFalse;
    });
  }
  return out;
}

/** Apply a fully-built context to a raw template string. */
export function resolveTemplate(template: string, ctx: AgreementContext): string {
  const { flags, values } = buildAgreementValues(ctx);
  let out = resolveConditionals(template, flags);
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    if (!(key in values)) throw new Error(`agreement template: unknown placeholder "${key}"`);
    return values[key];
  });
  const leftover = out.match(/\{\{[^}]+\}\}|<!--(?:IF:|ELSE|ENDIF)/);
  if (leftover) throw new Error(`agreement template: unresolved token "${leftover[0]}"`);
  return out;
}

/** Read the on-disk template (shipped into the standalone build via next.config). */
export async function loadAgreementTemplate(): Promise<string> {
  return fs.readFile(TEMPLATE_PATH, "utf8");
}

/** Load the template and personalise it for one signer. */
export async function renderAgreementMarkdown(ctx: AgreementContext): Promise<string> {
  return resolveTemplate(await loadAgreementTemplate(), ctx);
}
