import { describe, expect, it } from "vitest";
import { markdownToEmailHtml } from "./wg-minutes-emails";

describe("markdownToEmailHtml", () => {
  it("renders headings, lists, checkboxes, bold and paragraphs, escaped", () => {
    const html = markdownToEmailHtml(
      "## Decisions\n\n- Ship **v1** <now>\n- [ ] Write docs (Ada)\n- [x] Done\n\nPlain text\nsecond line",
    );
    expect(html).toContain("<h3");
    expect(html).toContain("Decisions</h3>");
    expect(html).toContain("<li style=\"margin:0 0 4px;\">Ship <strong>v1</strong> &lt;now&gt;</li>");
    expect(html).toContain("&#9744; Write docs (Ada)");
    expect(html).toContain("&#9745; Done");
    expect(html).toContain("<p style=\"margin:0 0 12px;\">Plain text second line</p>");
    expect(html).not.toContain("<now>");
  });
  it("handles an empty draft", () => {
    expect(markdownToEmailHtml("")).toBe("");
  });
});
