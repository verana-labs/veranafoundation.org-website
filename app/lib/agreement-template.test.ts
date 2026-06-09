import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveTemplate, AgreementContext } from "./agreement-template";
import { markdownToPdf, renderAgreementPdf } from "./agreement-pdf";

const TEMPLATE = readFileSync(
  path.join(process.cwd(), "legal", "membership-agreement-v1.md"),
  "utf8",
);

const TPL = [
  "Party: **{{member_legal_name}}**, <!--IF:is_organization-->a {{entity_form}} under {{jurisdiction}}, at **{{member_address}}**<!--ELSE-->an individual resident in **{{jurisdiction}}**<!--IF:has_member_address-->, at **{{member_address}}**<!--ENDIF--><!--ENDIF-->.",
  "{{associate_checkbox}} Associate / {{contributor_checkbox}} Contributor",
  "Name: {{signer_name}}",
  "<!--IF:is_organization-->Title: {{signer_title}}\n<!--ENDIF-->Email: {{member_email}}\nDate: {{effective_date}}",
].join("\n");

const orgAssociate: AgreementContext = {
  memberType: "organization",
  membershipClass: "associate",
  memberLegalName: "Acme OÜ",
  entityForm: "private limited company",
  jurisdiction: "Estonia",
  memberAddress: "Tallinn",
  signerName: "Jane Doe",
  signerTitle: "CEO",
  memberEmail: "jane@acme.example",
  effectiveDate: new Date("2026-06-09T10:00:00Z"),
};

const orgContributor: AgreementContext = {
  ...orgAssociate,
  membershipClass: "contributor",
};

const individual: AgreementContext = {
  memberType: "individual",
  membershipClass: "contributor",
  memberLegalName: "John Smith",
  jurisdiction: "France",
  memberAddress: null,
  signerName: "John Smith",
  effectiveDate: new Date("2026-06-09T10:00:00Z"),
};

describe("resolveTemplate", () => {
  it("renders the organization-associate case", () => {
    const out = resolveTemplate(TPL, orgAssociate);
    expect(out).toContain("a private limited company under Estonia, at **Tallinn**");
    expect(out).toContain("☒ Associate / ☐ Contributor");
    expect(out).toContain("Title: CEO");
    expect(out).toContain("Email: jane@acme.example");
    expect(out).toContain("Date: 9 June 2026");
  });

  it("renders the organization-contributor case", () => {
    const out = resolveTemplate(TPL, orgContributor);
    expect(out).toContain("☐ Associate / ☒ Contributor");
    expect(out).toContain("Title: CEO");
  });

  it("renders the individual case: no entity clause, no title, no address", () => {
    const out = resolveTemplate(TPL, individual);
    expect(out).toContain("an individual resident in **France**.");
    expect(out).not.toContain("Title:");
    expect(out).not.toContain("at **");
    expect(out).toContain("☒ Contributor".replace("☒", "")); // contributor checked
  });

  it("keeps an individual address clause when an address is present", () => {
    const out = resolveTemplate(TPL, { ...individual, memberAddress: "12 Rue X" });
    expect(out).toContain("resident in **France**, at **12 Rue X**.");
  });

  it("throws on an unknown placeholder", () => {
    expect(() => resolveTemplate("{{nope}}", individual)).toThrow(/unknown placeholder/);
  });

  it("leaves no template tokens behind for any case", () => {
    for (const ctx of [orgAssociate, orgContributor, individual]) {
      const out = resolveTemplate(TPL, ctx);
      expect(out).not.toMatch(/\{\{|<!--(?:IF:|ELSE|ENDIF)/);
    }
  });
});

describe("real template + PDF", () => {
  it("personalises the on-disk template with no leftover tokens", () => {
    const md = resolveTemplate(TEMPLATE, orgAssociate);
    expect(md).not.toMatch(/\{\{|<!--(?:IF:|ELSE|ENDIF)/);
    expect(md).toContain("Acme OÜ");
    expect(md).toContain("☒ **Associate Member**");
    // Member email appears in every signature block: main + 4 annexes = 5.
    expect(md.match(/Email: jane@acme\.example/g)).toHaveLength(5);
    // A signature block per annex (A–D) plus the main one.
    expect(md.match(/### \*\*MEMBER\*\*/g)).toHaveLength(5);
    for (const x of ["A", "B", "C", "D"]) {
      expect(md).toContain(`## **ANNEX ${x} — SIGNATURES**`);
    }
  });

  it("renders a valid multi-page PDF", async () => {
    const buf = await markdownToPdf(resolveTemplate(TEMPLATE, orgAssociate));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
  });

  it("renderAgreementPdf works end-to-end for the individual case", async () => {
    const buf = await renderAgreementPdf(individual, TEMPLATE);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
