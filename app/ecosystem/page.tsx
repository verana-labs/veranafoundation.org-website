import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Ecosystem",
  description:
    "How the Verana Foundation grows the open trust layer: grants, developer relations, partnerships and integrations, and adoption in the wild.",
};

export default function EcosystemPage() {
  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Ecosystem</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">
            Growing the open trust layer
          </h1>
          <div className="accent-line mt-6" />
          <p className="mt-8 text-lg text-muted max-w-2xl leading-relaxed">
            Adoption is the Foundation&rsquo;s active mandate: funding builders,
            supporting developers, and bringing partners onto open, neutral
            infrastructure.
          </p>
        </div>
      </section>

      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid md:grid-cols-2 gap-6">
          <div className="card">
            <span className="badge badge-green self-start">grants</span>
            <h3>Grants</h3>
            <p className="text-sm text-muted leading-relaxed">
              Funding for builders, integrations, and public-good contributions
              to the trust layer.
            </p>
            <Link href="/contact" className="text-sm text-purple hover:underline">
              Express interest →
            </Link>
            <p className="text-xs text-muted">
              Program details to follow pre-incorporation.
            </p>
          </div>
          <div className="card">
            <span className="badge badge-purple self-start">devrel</span>
            <h3>Developer relations</h3>
            <p className="text-sm text-muted leading-relaxed">
              Docs, SDKs, and community support around the open-source software.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <a href="https://verana.io" rel="noopener" className="text-purple hover:underline">
                verana.io ↗
              </a>
              <a href="https://docs.verana.io" rel="noopener" className="text-purple hover:underline">
                docs.verana.io ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-3">Partnerships &amp; integrations</p>
          <h2 className="display text-3xl">Adopting the open trust layer</h2>
          <div className="accent-line mt-4 mb-10" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {["Partner", "Partner", "Partner", "Your org?"].map((p, i) => (
              <div key={i} className="logo-tile text-muted">
                {p}
              </div>
            ))}
          </div>
          <p className="text-sm text-muted mt-6">
            Interested in partnering or integrating?{" "}
            <Link href="/contact" className="text-purple hover:underline">
              Get in touch →
            </Link>
          </p>
        </div>
      </section>

      <section className="reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="card">
            <h3>Adoption in the wild</h3>
            <p className="text-sm text-muted leading-relaxed">
              Independent builders ship on the open protocol — for example 2060&rsquo;s{" "}
              <a href="https://hologram.zone" rel="noopener" className="text-purple hover:underline">
                Hologram
              </a>{" "}
              — evidence that the standards work in production. The Foundation
              stewards the neutral protocol underneath; it does not market
              products.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
