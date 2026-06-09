import { describe, it, expect, afterEach } from "vitest";
import { emailLayout } from "./email-layout";

afterEach(() => {
  delete process.env.EMAIL_LOGO_URL;
});

describe("emailLayout", () => {
  it("renders the Verana wordmark, themed button and footer", () => {
    const html = emailLayout({
      heading: "Hello",
      bodyHtml: "<p>Body</p>",
      button: { label: "Go", href: "https://example.com/x" },
    });
    expect(html).toContain("Verana");
    expect(html).toContain("Foundation"); // wordmark
    expect(html).toContain("#763ef0"); // Verana purple
    expect(html).toMatch(/<a href="https:\/\/example\.com\/x"[\s\S]*?Go[\s\S]*?<\/a>/); // themed button
    expect(html).toContain("veranafoundation.org"); // footer
    expect(html).toContain("Hello"); // heading
    expect(html).toContain("<p>Body</p>");
  });

  it("uses a hosted logo image when EMAIL_LOGO_URL is set", () => {
    process.env.EMAIL_LOGO_URL = "https://cdn.example.com/verana.png";
    const html = emailLayout({ bodyHtml: "<p>x</p>" });
    expect(html).toContain('src="https://cdn.example.com/verana.png"');
    expect(html).toContain('alt="Verana Foundation"');
  });
});
