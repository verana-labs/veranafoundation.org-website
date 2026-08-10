import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,
  faFileInvoiceDollar,
  faDiagramProject,
  faChartLine,
  faUserShield,
  faGear,
  faClockRotateLeft,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { currentUser, isAdmin } from "@/app/lib/authz";
import { PageHero, Section } from "@/app/components/PageHero";

export const metadata: Metadata = { title: "Admin" };

const FEATURES: {
  href: string;
  label: string;
  description: string;
  icon: IconDefinition;
}[] = [
  {
    href: "/admin/members",
    label: "Members",
    description: "Browse members and memberships, and open signed agreements.",
    icon: faUsers,
  },
  {
    href: "/admin/invoices",
    label: "Invoices",
    description: "Associate dues invoices and their payment status.",
    icon: faFileInvoiceDollar,
  },
  {
    href: "/admin/working-groups",
    label: "Working groups",
    description: "Create and manage the working groups shown across the site.",
    icon: faDiagramProject,
  },
  {
    href: "/admin/contributors",
    label: "Contributor insights",
    description:
      "GitHub activity across the organizations, compared per contributor.",
    icon: faChartLine,
  },
  {
    href: "/admin/admins",
    label: "Admins",
    description: "Manage the Foundation admin allowlist.",
    icon: faUserShield,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    description: "Membership Agreement versions, integrity, and activation.",
    icon: faGear,
  },
  {
    href: "/admin/audit",
    label: "Audit log",
    description: "Review administrative actions taken in the console.",
    icon: faClockRotateLeft,
  },
];

export default async function AdminPage() {
  const user = await currentUser();
  // Hide existence from non-admins (defence in depth on top of middleware).
  if (!user || !(await isAdmin(user.email))) notFound();

  return (
    <>
      <PageHero
        tag="Admin"
        title="Administration"
        lead="Manage members, billing, working groups, admins, and the Membership Agreement."
      />
      <Section bordered={false}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="card group transition-colors hover:border-purple"
            >
              <FontAwesomeIcon
                icon={f.icon}
                className="text-2xl text-purple"
                aria-hidden="true"
              />
              <h3 className="mt-3 transition-colors group-hover:text-purple">{f.label}</h3>
              <p className="text-sm text-muted leading-relaxed">{f.description}</p>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
