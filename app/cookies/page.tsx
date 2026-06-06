import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookies",
  description:
    "How veranafoundation.org uses cookies: essential only by default, consent-gated analytics, no ad networks or cross-site trackers.",
};

export default function CookiesPage() {
  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-4">Legal</p>
          <h1 className="display text-4xl sm:text-5xl">Cookie Policy</h1>
          <div className="accent-line mt-6" />
          <p className="text-xs tracking-wider uppercase text-muted mt-8">
            <strong className="text-ink">Last updated.</strong> 2026-06-06
          </p>
        </div>
      </section>

      <article className="prose-body max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <p>
          We keep cookies to a minimum. The site runs on essential storage only,
          and any analytics are loaded only after you consent.
        </p>

        <h2>What we set</h2>
        <ul>
          <li>
            <strong>Consent preference</strong> — your choice from the cookie
            banner is stored under <code>vf-cookie-consent</code> in your
            browser&rsquo;s <code>localStorage</code>. It is not a cookie, is not
            transmitted to any server, and is scoped to this site only.
          </li>
          <li>
            <strong>Theme &amp; UI preferences</strong> — your light/dark choice
            (<code>vf-theme</code>) and dismissed announcement are likewise stored
            in <code>localStorage</code>.
          </li>
          <li>
            <strong>Analytics (optional)</strong> — if you select{" "}
            <em>Accept all</em>, a privacy-respecting analytics tag may set
            first-party cookies to count pageviews. Choosing{" "}
            <em>Essential only</em> sets none. The specific provider is listed in
            the <a href="/privacy">Privacy Policy</a> once finalized.
          </li>
        </ul>

        <h2>What we do not do</h2>
        <ul>
          <li>No ad networks or cross-site trackers.</li>
          <li>No third-party captcha or anti-bot cookies (anti-abuse is server-side).</li>
          <li>No selling or sharing of data.</li>
        </ul>

        <h2>Changing your choice</h2>
        <p>
          Clear site data for veranafoundation.org in your browser to reset the
          banner on your next visit, or use the <em>Preferences</em> link in the
          banner. See the <a href="/privacy">Privacy Policy</a> for full detail.
        </p>
      </article>
    </>
  );
}
