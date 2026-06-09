import { AgreementContext, renderAgreementMarkdown } from "@/app/lib/agreement-template";

/**
 * Renders the personalised agreement markdown to semantic HTML for the on-screen
 * review step (app/(app)/apply). Mirrors the construct set understood by the PDF
 * renderer — H1/H2/H3, inline **bold**, paragraphs, `---` rules, pipe tables, and
 * the ☒/☐ checkbox lines — but as flowing, themeable HTML rather than fixed pages.
 *
 * The output is built from escaped text, so member-supplied values cannot inject
 * markup. Wrap it in a container styled by the caller (see ApplyForm).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Undo markdown backslash-escapes, then HTML-escape, then apply **bold**. */
function inline(s: string): string {
  const unescaped = s.replace(/\\([!-/:-@[-`{-~])/g, "$1");
  let out = "";
  let bold = false;
  for (const part of unescaped.split("**")) {
    if (part) out += bold ? `<strong>${escapeHtml(part)}</strong>` : escapeHtml(part);
    bold = !bold;
  }
  return out;
}

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}
function isTableSeparator(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line);
}
function cells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (line.trim() === "") continue;
    if (/^#{1,}\s*$/.test(line)) continue; // bare heading markers ("# ")

    if (isTableRow(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i].trimEnd())) {
        if (!isTableSeparator(lines[i].trimEnd())) rows.push(cells(lines[i].trimEnd()));
        i++;
      }
      i--;
      const [head, ...body] = rows;
      html.push("<table>");
      if (head) html.push(`<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`);
      html.push("<tbody>");
      for (const r of body) html.push(`<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
      html.push("</tbody></table>");
      continue;
    }

    if (line.trim() === "---") { html.push("<hr />"); continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const tag = `h${h[1].length}`;
      html.push(`<${tag}>${inline(h[2])}</${tag}>`);
      continue;
    }

    html.push(`<p>${inline(line)}</p>`);
  }

  return html.join("\n");
}

/** Load the template, personalise it, and return review-ready HTML. */
export async function renderAgreementHtml(ctx: AgreementContext): Promise<string> {
  return markdownToHtml(await renderAgreementMarkdown(ctx));
}
