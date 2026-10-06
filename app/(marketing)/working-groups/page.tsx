import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/app/lib/authz";
import {
  listWorkingGroupsWithAccess,
  userActiveClasses,
} from "@/app/lib/working-groups";
import WorkingGroupCards from "@/app/components/WorkingGroupCards";
import { WG_REGIONS, regionLabel } from "@/app/lib/regions";
import { languageNative } from "@/app/lib/languages";
import type { WgRegion } from "@prisma/client";

export const metadata: Metadata = {
  title: "Working groups",
  description:
    "The Verana Foundation's working groups author the specifications and build the open-source software of the open trust layer. Participation requires Foundation membership (Associate or Contributor).",
};

// Per-user content (join state, membership notice) makes this page dynamic.
export const dynamic = "force-dynamic";

/** One row of filter chips; `all` is the link that clears the filter. */
function FilterChips({
  label,
  options,
  active,
  hrefFor,
}: {
  label: string;
  options: { value: string; label: string }[];
  active: string | null;
  hrefFor: (value: string | null) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">{label}:</span>
      <Link href={hrefFor(null)} className={`badge ${active ? "" : "badge-purple"}`}>
        All
      </Link>
      {options.map((o) => (
        <Link
          key={o.value}
          href={hrefFor(o.value)}
          className={`badge ${active === o.value ? "badge-purple" : ""}`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export default async function WorkingGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; language?: string }>;
}) {
  const user = await currentUser();
  const [allGroups, classes, params] = await Promise.all([
    listWorkingGroupsWithAccess(user?.id ?? null),
    user?.id
      ? userActiveClasses(user.id)
      : Promise.resolve(new Set<"contributor" | "associate">()),
    searchParams,
  ]);

  // Regional groups: filter chips appear only once there is something to filter.
  const regions = WG_REGIONS.filter((r) => allGroups.some((g) => g.region === r.code));
  const languages = [...new Set(allGroups.map((g) => g.language))];
  const region = regions.some((r) => r.code === params.region) ? (params.region as WgRegion) : null;
  const language = languages.includes(params.language ?? "") ? params.language! : null;
  const workingGroups = allGroups.filter(
    (g) => (!region || g.region === region) && (!language || g.language === language),
  );
  const hrefFor = (next: { region?: string | null; language?: string | null }) => {
    const q = new URLSearchParams();
    const r = next.region === undefined ? region : next.region;
    const l = next.language === undefined ? language : next.language;
    if (r) q.set("region", r);
    if (l) q.set("language", l);
    const qs = q.toString();
    return `/working-groups${qs ? `?${qs}` : ""}`;
  };
  // Signed-out visitors and signed-in users without an active membership get
  // the "membership required" explainer; members don't need it.
  const showMembershipNotice = !user || classes.size === 0;

  return (
    <>
      {/* Hero */}
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Working groups</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">
            Where the work happens
          </h1>
          <div className="accent-line mt-6" />
          <p className="mt-8 text-lg text-muted max-w-2xl leading-relaxed">
            The working groups author the specifications, build and maintain the
            open-source software, and shape the open trust layer. Join the ones
            your membership grants — across every organization you belong to —
            and the meetings land straight in your calendar.
          </p>
        </div>
      </section>

      {/* Membership-required notice — only for visitors who can't join yet */}
      {showMembershipNotice && (
        <section className="border-b border-rule reveal">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="card border-l-[3px]" style={{ borderLeftColor: "var(--color-purple)" }}>
              <h2 className="display text-xl">
                Working-group participation requires membership
              </h2>
              <p className="text-sm text-muted leading-relaxed">
                Joining a working group requires Foundation membership. Most are open
                to <strong className="text-ink">Associate</strong> or{" "}
                <strong className="text-ink">Contributor</strong> members; the{" "}
                <strong className="text-ink">Business Cases WG</strong> requires{" "}
                <strong className="text-ink">Associate</strong> membership.{" "}
                <Link href="/join" className="text-purple hover:underline">
                  Compare &amp; join →
                </Link>{" "}
                Anyone may still use, fork, read, and file issues against the public
                open-source code and specifications; working-group participation and
                formal contributions are members-only.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Working-group board */}
      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {(regions.length > 1 || languages.length > 1) && (
            <div className="mb-6 space-y-2">
              {regions.length > 1 && (
                <FilterChips
                  label="Region"
                  options={regions.map((r) => ({ value: r.code, label: regionLabel(r.code) }))}
                  active={region}
                  hrefFor={(v) => hrefFor({ region: v })}
                />
              )}
              {languages.length > 1 && (
                <FilterChips
                  label="Language"
                  options={languages.map((l) => ({ value: l, label: languageNative(l) }))}
                  active={language}
                  hrefFor={(v) => hrefFor({ language: v })}
                />
              )}
            </div>
          )}
          <WorkingGroupCards groups={workingGroups} />
          <p className="text-xs text-muted mt-4">
            Each group's page shows its leads, meeting schedule and published
            minutes; members join and are invited to the meetings in their own
            calendar.
          </p>
        </div>
      </section>

      {/* Ways to contribute */}
      <section className="border-b border-rule reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="card">
              <span className="badge">no membership needed</span>
              <h3>Use the open-source software</h3>
              <p className="text-sm text-muted leading-relaxed">
                Public repos, issue trackers, and releases. Apache 2.0
                (AGPL-3.0 for the Verifiable Public Registry); copyright held by
                contributors.
              </p>
              <a
                href="https://github.com/verana-labs"
                rel="noopener"
                className="text-sm text-purple hover:underline mt-auto self-end"
              >
                github.com/verana-labs ↗
              </a>
            </div>
            <div className="card">
              <span className="badge">no membership needed</span>
              <h3>Implement the specifications</h3>
              <p className="text-sm text-muted leading-relaxed">
                Build to Verifiable Trust and VPR. Both specs are published for
                implementers.
              </p>
              <a
                href="https://verana-labs.github.io/verifiable-trust-spec/"
                rel="noopener"
                className="text-sm text-purple hover:underline mt-auto self-end"
              >
                Read the specs ↗
              </a>
            </div>
            <div className="card">
              <span className="badge badge-green">members</span>
              <h3>Join to contribute</h3>
              <p className="text-sm text-muted leading-relaxed">
                Participate in a working group and submit formal contributions.
                Recurring technical work joins as a{" "}
                <strong className="text-ink">Contributor Member</strong> (free).
              </p>
              <Link
                href="/join"
                className="text-sm text-purple hover:underline mt-auto self-end"
              >
                Join the Foundation →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Build on Verana */}
      <section className="reveal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="card">
            <h3>Building an app or agent on Verana?</h3>
            <p className="text-sm text-muted leading-relaxed">
              The Foundation stewards the standards; the builder docs live
              elsewhere. Start at{" "}
              <a href="https://verana.io" rel="noopener" className="text-purple hover:underline">
                verana.io
              </a>{" "}
              and{" "}
              <a href="https://docs.verana.io" rel="noopener" className="text-purple hover:underline">
                docs.verana.io
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
