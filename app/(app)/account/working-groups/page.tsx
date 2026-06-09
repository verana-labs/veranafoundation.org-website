import type { Metadata } from "next";
import { currentUser } from "@/app/lib/authz";
import { listWorkingGroupsWithAccess } from "@/app/lib/working-groups";
import WorkingGroupCards from "@/app/components/WorkingGroupCards";

export const metadata: Metadata = { title: "Working groups" };

export default async function WorkingGroupsPage() {
  const user = await currentUser();
  const workingGroups = await listWorkingGroupsWithAccess(user?.id ?? null);

  return (
    <div>
      <p className="tag mb-4">Working groups</p>
      <h1 className="display text-4xl sm:text-5xl leading-tight">
        Where the work happens
      </h1>
      <p className="mt-6 text-lg text-muted max-w-2xl leading-relaxed">
        The working groups author the specifications, build and maintain the
        open-source software, and shape the open trust layer. The ones you can
        open are those your membership grants — across every organization you
        belong to.
      </p>
      <div className="accent-line mt-8 mb-10" />

      <WorkingGroupCards groups={workingGroups} />
    </div>
  );
}
