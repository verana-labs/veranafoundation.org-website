import Link from "next/link";
import { getOrgStats, formatCount, formatRelative } from "./lib/github";

// Revalidate the live GitHub stats roughly once a day (ISR).
export const revalidate = 86400;

const SPECS = [
  {
    name: "Verifiable Trust v4",
    desc: "The verify-first connection model: Verifiable Services, User Agents, Essential Credential Schemas, recursive trust resolution.",
    href: "https://verana-labs.github.io/verifiable-trust-spec/",
  },
  {
    name: "Verifiable Public Registry (VPR) v4",
    desc: "The trust-registry / public-registry layer: corporations, ecosystems, schemas, the permission tree, trust deposits.",
    href: "https://verana-labs.github.io/verifiable-trust-vpr-spec/",
  },
];

const SOFTWARE = [
  {
    repo: "verana-labs/verana",
    name: "Verana Ledger",
    desc: "Cosmos-SDK Layer-1 reference implementation of the VPR spec, with council-based governance.",
    license: "AGPL-3.0",
  },
  {
    repo: "verana-labs/verana-indexer",
    name: "Verana Indexer",
    desc: "Trust Resolver / query surface. With ToIP TRQP (Trust Registry Query Protocol) v2 endpoint.",
    license: "Apache-2.0",
  },
  {
    repo: "verana-labs/vs-agent",
    name: "VS-Agent",
    desc: "The verifiable-service agent runtime.",
    license: "Apache-2.0",
  },
  {
    repo: "verana-labs/verana-frontend",
    name: "Verana Frontend",
    desc: "Reference web frontend.",
    license: "Apache-2.0",
  },
];

const WORKING_GROUPS = [
  {
    name: "Specification WG",
    desc: "Authors and maintains the specifications.",
    requires: "Associate or Contributor",
    associateOnly: false,
  },
  {
    name: "Reference Implementations WG",
    desc: "Maintains the open-source software.",
    requires: "Associate or Contributor",
    associateOnly: false,
  },
  {
    name: "Interop WG",
    desc: "Cross-implementation interoperability and conformance.",
    requires: "Associate or Contributor",
    associateOnly: false,
  },
  {
    name: "Business Cases WG",
    desc: "Use cases, business models, and adoption patterns.",
    requires: "Associate only",
    associateOnly: true,
  },
];

const FOUNDERS = [
  { name: "2060 OÜ", href: "https://2060.io", logo: "/assets/img/logo_2060.svg" },
  {
    name: "Mobiera",
    href: "https://mobiera.com",
    logo: "/assets/img/logo_mobiera.svg",
  },
  {
    name: "Orchestrating Identity",
    href: "https://www.oidentity.com/",
    logo: "/assets/img/logo_oidentity.svg",
  },
];

// Fallback contributor initials, used only if the live GitHub fetch fails.
const CONTRIBUTORS = ["AG", "FR", "JS", "MK", "RB", "TL", "VP", "DW", "NH", "EC"];
const AVATAR_COLORS = ["#763EF0", "#1FB57A", "#2E2A8F", "#5b2fc9", "#178a5e"];

export default async function HomePage() {
  const stats = await getOrgStats();
  const lastActivity = formatRelative(stats?.lastActivity ?? null);

  return (
    <>
      {/* Hero */}
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <p className="tag mb-4">Verana Foundation</p>
          <h1 className="display text-4xl sm:text-5xl lg:text-6xl leading-[1.05] max-w-4xl">
            The non-profit steward of the open trust layer.
          </h1>
          <p className="mt-6 text-lg text-muted max-w-2xl leading-relaxed">
            A non-profit rebuilding digital trust for the agentic web. The
            Foundation owns the specifications, stewards the open-source software
            under Apache 2.0 and AGPL-3.0, and grows the ecosystem around it — in the open,
            with its community.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/join" className="btn btn-primary">
              Join the Foundation
            </Link>
            <a href="#specifications" className="btn btn-secondary">
              Read the specifications
            </a>
          </div>
        </div>
      </section>

      {/* What the Foundation does */}
      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: "Owns the specifications",
                desc: "Verifiable Trust and VPR — authored in the open, owned and hosted by the Foundation.",
              },
              {
                title: "Stewards the open source",
                desc: "Reference open source implementations; copyright held by contributors.",
              },
              {
                title: "Grows the ecosystem",
                desc: "Grants, integrations, developer relations, partnerships, and the open-source community.",
              },
              {
                title: "Issues & administers VNA",
                desc: "The protocol's native utility token — which the Foundation does not own.",
              },
            ].map((c) => (
              <div key={c.title} className="card">
                <h3>{c.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-muted max-w-3xl">
            The Foundation is <strong className="text-ink">fully separate</strong>{" "}
            from the Verana Council, which governs and secures the live network.{" "}
            <a
              href="https://veranacouncil.org"
              className="text-purple hover:underline"
              rel="noopener"
            >
              See the Council →
            </a>
          </p>
        </div>
      </section>

      {/* Specifications */}
      <section
        id="specifications"
        className="border-b border-rule reveal scroll-mt-24"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-3">Owned &amp; hosted</p>
          <h2 className="display text-3xl">Specifications</h2>
          <div className="accent-line mt-4 mb-10" />
          <div className="grid sm:grid-cols-2 gap-6">
            {SPECS.map((s) => (
              <a
                key={s.name}
                href={s.href}
                rel="noopener"
                className="repo-card flex flex-col h-full"
              >
                <h3 className="display text-lg">{s.name} ↗</h3>
                <p className="text-sm text-muted leading-relaxed mt-2">
                  {s.desc}
                </p>
                <span className="badge badge-green mt-auto self-end">
                  CC BY-SA 4.0
                </span>
              </a>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">
            Both specifications are licensed{" "}
            <strong className="text-ink">
              Creative Commons Attribution-ShareAlike 4.0
            </strong>{" "}
            (CC BY-SA 4.0).
          </p>
        </div>
      </section>

      {/* Software */}
      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
            <div>
              <p className="tag mb-3">Stewarded · open source</p>
              <h2 className="display text-3xl">Open-source software</h2>
            </div>
            <a
              href="https://github.com/verana-labs"
              className="text-sm text-purple hover:underline"
              rel="noopener"
            >
              github.com/verana-labs ↗
            </a>
          </div>
          <div className="accent-line mb-10" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {SOFTWARE.map((s) => (
              <a
                key={s.name}
                href={`https://github.com/${s.repo}`}
                rel="noopener"
                className="repo-card flex flex-col h-full"
              >
                <span className="repo-name">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                  </svg>
                  {s.name}
                </span>
                <p className="text-sm text-muted leading-relaxed mt-2">
                  {s.desc}
                </p>
                <span
                  className={`badge mt-auto self-end ${
                    s.license === "Apache-2.0" ? "badge-green" : "badge-purple"
                  }`}
                >
                  {s.license}
                </span>
              </a>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">
            All modules are <strong className="text-ink">Apache 2.0</strong>{" "}
            (copyright held by contributors), except the{" "}
            <strong className="text-ink">Verifiable Public Registry</strong>,
            which is <strong className="text-ink">AGPL-3.0</strong>.
          </p>
        </div>
      </section>

      {/* Living commons */}
      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-3">A living commons</p>
          <h2 className="display text-3xl">Built in the open, by a community</h2>
          <div className="accent-line mt-4 mb-10" />

          {/* Live stats from the verana-labs GitHub org (ISR, daily) */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
              <div className="stat-tile">
                <div className="stat">{stats.repoCount}</div>
                <div className="stat-label">Public repos</div>
              </div>
              <div className="stat-tile">
                <div className="stat">{formatCount(stats.stars)}</div>
                <div className="stat-label">Stars</div>
              </div>
              <div className="stat-tile">
                <div className="stat">{formatCount(stats.forks)}</div>
                <div className="stat-label">Forks</div>
              </div>
              <div className="stat-tile">
                <div className="stat text-purple" style={{ fontSize: "1.1rem" }}>
                  {lastActivity ?? "—"}
                </div>
                <div className="stat-label">
                  {stats.lastActivityRepo
                    ? `last commit · ${stats.lastActivityRepo}`
                    : "last activity"}
                </div>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-10">
            {/* Contributors wall */}
            <div>
              <h3 className="display text-lg mb-4">Contributors</h3>
              <div className="flex flex-wrap gap-2">
                {stats && stats.contributors.length > 0
                  ? stats.contributors.map((c) => (
                      <a
                        key={c.login}
                        href={c.html_url}
                        rel="noopener"
                        title={c.login}
                        aria-label={c.login}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${c.avatar_url}${
                            c.avatar_url.includes("?") ? "&" : "?"
                          }s=88`}
                          alt={c.login}
                          width={44}
                          height={44}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="avatar-img"
                        />
                      </a>
                    ))
                  : CONTRIBUTORS.map((c, i) => (
                      <span
                        key={c}
                        className="avatar"
                        style={{
                          background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                        }}
                        aria-hidden="true"
                      >
                        {c}
                      </span>
                    ))}
                <a
                  href="https://github.com/orgs/verana-labs/people"
                  rel="noopener"
                  className="avatar"
                  style={{ background: "#5b5b5b" }}
                  aria-label="More contributors on GitHub"
                >
                  +
                </a>
              </div>
              <p className="text-sm text-muted mt-4">
                Everyone who authors the specs and maintains the software, in
                public.{" "}
                <Link href="/contribute" className="text-purple hover:underline">
                  How to contribute →
                </Link>
              </p>
            </div>
            {/* Working-group board */}
            <div>
              <h3 className="display text-lg mb-4">Working groups</h3>
              <div className="space-y-3">
                {WORKING_GROUPS.map((wg) => (
                  <div key={wg.name} className="wg-tile">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-ink">{wg.name}</p>
                      <span
                        className={`badge flex-shrink-0 ${
                          wg.associateOnly ? "badge-purple" : ""
                        }`}
                      >
                        {wg.requires}
                      </span>
                    </div>
                    <p className="text-sm text-muted mt-1">{wg.desc}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted mt-4">
                <Link href="/contribute" className="text-purple hover:underline">
                  Join a working group →
                </Link>{" "}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Founding members */}
      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="tag mb-3">Founding members</p>
          <h2 className="display text-2xl mb-8">
            The organizations that founded the Foundation
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {FOUNDERS.map((f) => (
              <a
                key={f.name}
                href={f.href}
                rel="noopener"
                className="logo-wall-item"
                title={f.name}
                aria-label={f.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.logo} alt={`${f.name} logo`} loading="lazy" />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Membership — closing section, carries the Join CTA */}
      <section className="reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-3">Membership</p>
          <h2 className="display text-3xl max-w-2xl">
            Two ways to join the Foundation
          </h2>
          <div className="accent-line mt-4 mb-10" />
          <div className="grid md:grid-cols-2 gap-6">
            <div className="card">
              <div className="flex items-center justify-between">
                <h3 className="display text-xl">Associate Member</h3>
                <span className="badge badge-purple">dues by org size</span>
              </div>
              <p className="text-sm text-muted leading-relaxed">
                Organizations that support and align with the mission —
                strategic engagement, advisory input, ecosystem development,
                research. Non-technical.
              </p>
            </div>
            <div className="card">
              <div className="flex items-center justify-between">
                <h3 className="display text-xl">Contributor Member</h3>
                <span className="badge badge-green">free</span>
              </div>
              <p className="text-sm text-muted leading-relaxed">
                Organizations contributing technical &amp; standards work through
                the working groups — software, specs, schemas. Greater technical
                obligations.
              </p>
            </div>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/join" className="btn btn-primary">
              Join the Foundation
            </Link>
            <Link href="/join" className="btn btn-ghost">
              Compare membership →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
