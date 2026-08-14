import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Ecosystem",
  description:
    "How the Verana Foundation grows the open trust layer: grants, developer relations, the live playground, and adoption in the wild.",
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
          <p className="tag mb-3">Playground</p>
          <h2 className="display text-3xl">See the open trust layer working</h2>
          <div className="accent-line mt-4 mb-8" />
          <p className="text-muted max-w-2xl leading-relaxed">
            The playground is a live demo environment anchored to the Verana
            testnet. Demo ecosystems issue real credentials, verifiable
            services prove who they are before you share anything, and you can
            take part with a wallet on your own phone.
          </p>
          <div className="grid md:grid-cols-3 gap-6 mt-10">
            <div className="card">
              <h3>Bring your wallet</h3>
              <p className="text-sm text-muted leading-relaxed">
                Sixteen wallets and agents already interoperate on the
                playground, including the EUDI reference wallet, swiyu, BC
                Wallet, NL Wallet, Inji, Paradym, Hologram, and more.
              </p>
            </div>
            <div className="card">
              <h3>Real credentials, real checks</h3>
              <p className="text-sm text-muted leading-relaxed">
                Receive credentials, present them to services, and watch trust
                resolution happen against the testnet registry: nothing is
                mocked.
              </p>
            </div>
            <div className="card">
              <h3>Open standards</h3>
              <p className="text-sm text-muted leading-relaxed">
                Everything runs over W3C Verifiable Credentials, DIDComm, and
                OpenID4VC, the same rails ecosystems will use in production.
              </p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="https://playground.testnet.verana.network"
              rel="noopener"
              className="btn btn-primary"
            >
              Open the playground ↗
            </a>
            <p className="text-sm text-muted">
              Interested in partnering or integrating?{" "}
              <Link href="/contact" className="text-purple hover:underline">
                Get in touch →
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="card">
            <h3>Adoption in the wild</h3>
            <p className="text-sm text-muted leading-relaxed">
              Independent builders ship on the open protocol, for example 2060&rsquo;s{" "}
              <a href="https://hologram.zone" rel="noopener" className="text-purple hover:underline">
                Hologram
              </a>
              : evidence that the standards work in production. The Foundation
              stewards the neutral protocol underneath; it does not market
              products.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
