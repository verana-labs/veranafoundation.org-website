import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Ecosystem",
  description:
    "How the Verana Foundation grows the open trust layer: grants, developer relations, partnerships and integrations, and adoption in the wild.",
};

type Partner = {
  name: string;
  sub?: string;
  href: string;
  logo: string;
};

const PARTNERSHIPS: Partner[] = [
  {
    name: "MOSIP",
    sub: "Inji Wallet",
    href: "https://www.mosip.io/",
    logo: "/assets/img/logo_mosip.png",
  },
  {
    name: "France Identité",
    sub: "EUDIW Unfold",
    href: "https://france-identite.gouv.fr/",
    logo: "/assets/img/logo_france_identite.png",
  },
  {
    name: "European Commission",
    sub: "EUDI Wallet",
    href: "https://ec.europa.eu",
    logo: "/assets/img/logo_eudi.svg",
  },
  {
    name: "Swiss Confederation",
    sub: "swiyu Wallet",
    href: "https://www.eid.admin.ch",
    logo: "/assets/img/logo_swiyu.webp",
  },
  {
    name: "Government of British Columbia",
    sub: "BC Wallet",
    href: "https://digital.gov.bc.ca/digital-trust/",
    logo: "/assets/img/logo_bcwallet.webp",
  },
  {
    name: "MinBZK",
    sub: "NL Wallet",
    href: "https://edi.pleio.nl",
    logo: "/assets/img/logo_nl_wallet.png",
  },
  {
    name: "Animo Solutions",
    sub: "Paradym Wallet",
    href: "https://animo.id",
    logo: "/assets/img/logo_paradym.webp",
  },
  {
    name: "Procivis",
    sub: "Procivis One Wallet",
    href: "https://www.procivis.ch",
    logo: "/assets/img/logo_procivis.webp",
  },
  {
    name: "Sphereon",
    sub: "Sphereon Wallet",
    href: "https://sphereon.com",
    logo: "/assets/img/logo_sphereon.webp",
  },
  {
    name: "Talao",
    sub: "Altme Wallet",
    href: "https://talao.io",
    logo: "/assets/img/logo_talao.webp",
  },
  {
    name: "Authbound",
    sub: "Authbound Wallet",
    href: "https://authbound.io",
    logo: "/assets/img/logo_authbound.webp",
  },
  {
    name: "wwWallet",
    sub: "browser wallet",
    href: "https://wwwallet.org",
    logo: "/assets/img/logo_wwwallet.svg",
  },
  { name: "Mobai", href: "https://www.mobai.bio/", logo: "/assets/img/logo_mobai.png" },
  { name: "Bitel", href: "https://bitel.com.pe/", logo: "/assets/img/logo_bitel.png" },
  { name: "EAFIT", href: "https://www.eafit.edu.co/", logo: "/assets/img/logo_eafit.svg" },
];

const INTEGRATORS: Partner[] = [
  { name: "2060", href: "https://2060.io", logo: "/assets/img/logo_2060.svg" },
  {
    name: "Orchestrating Identity",
    href: "https://www.oidentity.com/",
    logo: "/assets/img/logo_oidentity.svg",
  },
  { name: "Intexus", href: "https://intexus.la/", logo: "/assets/img/logo_intexus.svg" },
  { name: "Mobiera", href: "https://www.mobiera.com/", logo: "/assets/img/logo_mobiera.svg" },
  { name: "Bigdavi", href: "https://bigdavi.com/", logo: "/assets/img/logo_bigdavi.png" },
  { name: "TotalNot", href: "https://www.totalnot.mx/", logo: "/assets/img/logo_totalnot.png" },
];

function PartnerGrid({ items, cols }: { items: Partner[]; cols: string }) {
  return (
    <div className={`grid gap-4 ${cols}`}>
      {items.map((p) => (
        <a key={p.name} href={p.href} rel="noopener" className="partner-card" title={p.name}>
          <span className="partner-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.logo} alt={`${p.name} logo`} loading="lazy" />
          </span>
          <span className="partner-name">
            {p.name}
            {p.sub ? <span className="partner-sub">{p.sub}</span> : null}
          </span>
        </a>
      ))}
    </div>
  );
}

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
          <p className="text-xs text-muted uppercase tracking-wider mb-4">
            Partnerships, integrations &amp; pilots
          </p>
          <PartnerGrid
            items={PARTNERSHIPS}
            cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
          />
          <p className="text-xs text-muted uppercase tracking-wider mt-10 mb-4">
            Integrators
          </p>
          <PartnerGrid items={INTEGRATORS} cols="grid-cols-2 sm:grid-cols-3" />
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
