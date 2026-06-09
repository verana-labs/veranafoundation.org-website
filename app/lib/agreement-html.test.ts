import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { markdownToHtml, renderAgreementHtml, renderTemplateHtml } from "./agreement-html";
import { AgreementContext } from "./agreement-template";

const TEMPLATE = readFileSync(
  path.join(process.cwd(), "legal", "membership-agreement-v1.md"),
  "utf8",
);

describe("markdownToHtml", () => {
  it("maps headings, bold, rules and pipe tables", () => {
    const md = [
      "# Title",
      "",
      "A **bold** word and \\_escaped\\_.",
      "",
      "---",
      "",
      "| Employee Count | Annual Dues (EUR) |",
      "| :---- | :---- |",
      "| 1–10 employees | €1,500 |",
    ].join("\n");
    const html = markdownToHtml(md);
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("_escaped_"); // backslash-escape undone
    expect(html).toContain("<hr />");
    expect(html).toContain("<th>Employee Count</th>");
    expect(html).toContain("<td>€1,500</td>");
  });

  it("escapes HTML so member-supplied text can't inject markup", () => {
    expect(markdownToHtml("Hello <script>alert(1)</script>")).toContain(
      "Hello &lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });
});

describe("renderAgreementHtml", () => {
  it("personalises the real template into HTML", async () => {
    const ctx: AgreementContext = {
      memberType: "organization",
      membershipClass: "associate",
      memberLegalName: "Acme OÜ",
      entityForm: "private limited company",
      jurisdiction: "Estonia",
      memberAddress: "Tallinn",
      signerName: "Jane Doe",
      signerTitle: "CEO",
      effectiveDate: new Date("2026-06-09T10:00:00Z"),
    };
    const html = renderAgreementHtml(ctx, TEMPLATE);
    expect(html).toContain("Acme OÜ");
    expect(html).toContain("<table>");
    expect(html).toContain("☒"); // selected class checkbox kept as unicode in HTML
    expect(html).not.toMatch(/\{\{|<!--(?:IF:|ELSE|ENDIF)/);
  });
});

describe("renderTemplateHtml (uncustomized admin preview)", () => {
  it("keeps placeholders literal but strips conditional markers", () => {
    const html = renderTemplateHtml(TEMPLATE);
    expect(html).toContain("{{member_legal_name}}"); // placeholders left visible
    expect(html).not.toMatch(/<!--(?:IF:|ELSE|ENDIF)/); // markers removed
    expect(html).toContain("<table>");
  });
});
