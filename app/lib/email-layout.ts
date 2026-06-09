// Shared branded HTML shell for all transactional emails: a Verana wordmark
// header, themed CTA button, and footer — colours match the website tokens
// (globals.css). Table-based + inline styles for broad email-client support.

const SITE_URL = process.env.AUTH_URL ?? "https://veranafoundation.org";

// Website design tokens (globals.css @theme).
const PURPLE = "#763ef0";
const PURPLE_DARK = "#5b2fc9";
const INK = "#111111";
const MUTED = "#5b5b5b";
const RULE = "#e8e6e0";
const SURFACE = "#fafafb";
const CARD = "#ffffff";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type EmailButton = { label: string; href: string };

/**
 * The Verana logo for emails. Uses a hosted raster if EMAIL_LOGO_URL is set
 * (SVG/remote images are unreliable across clients), otherwise a styled text
 * wordmark — "Verana" in ink, "Foundation" in Verana purple — like the site.
 */
function logo(): string {
  const url = process.env.EMAIL_LOGO_URL;
  if (url) {
    return `<img src="${url}" alt="Verana Foundation" height="28" style="display:block;border:0;outline:none;text-decoration:none;height:28px;">`;
  }
  return `<span style="font-family:${FONT};font-size:20px;font-weight:700;color:${INK};letter-spacing:-0.01em;">Verana<span style="color:${PURPLE};">Foundation</span></span>`;
}

/** Wrap email body HTML in the branded shell. `bodyHtml` is trusted HTML. */
export function emailLayout(opts: {
  heading?: string;
  bodyHtml: string;
  button?: EmailButton;
}): string {
  const button = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
         <tr><td style="border-radius:8px;background:${PURPLE};">
           <a href="${opts.button.href}"
              style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;
                     color:#ffffff;text-decoration:none;border-radius:8px;border:1px solid ${PURPLE_DARK};">
             ${opts.button.label}
           </a>
         </td></tr>
       </table>`
    : "";

  const heading = opts.heading
    ? `<h1 style="margin:0 0 14px;font-family:${FONT};font-size:20px;line-height:1.3;font-weight:600;color:${INK};">${opts.heading}</h1>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:${SURFACE};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:560px;background:${CARD};border:1px solid ${RULE};border-radius:12px;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid ${RULE};">${logo()}</td></tr>
        <tr><td style="padding:28px;font-family:${FONT};font-size:14px;line-height:1.6;color:${INK};">
          ${heading}${opts.bodyHtml}${button}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid ${RULE};font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};">
          Verana Foundation (in formation), stewarded by 2060 OÜ.<br>
          <a href="${SITE_URL}" style="color:${PURPLE};text-decoration:none;">veranafoundation.org</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
