import { NextResponse } from "next/server";
import { listHomeWorkingGroups, personName } from "@/app/lib/working-groups";

// Live data for the home "Working groups" board. The home page is ISR-cached
// (and at build there's no DB), so the board is fetched client-side from here —
// otherwise a stale/empty build snapshot would be served after a container
// restart until the next on-demand revalidation.
export const dynamic = "force-dynamic";

export async function GET() {
  const groups = await listHomeWorkingGroups();
  return NextResponse.json(
    groups.map((g) => ({
      id: g.id,
      slug: g.slug,
      name: g.name,
      description: g.description,
      requiredClass: g.requiredClass,
      leads: g.leads.map((l) => ({
        userId: l.user.id,
        name: personName(l.user),
        image: l.user.image,
      })),
    })),
  );
}
