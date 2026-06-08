import { db } from "@/app/lib/db";

/** The Membership Agreement shown at /apply — the admin-configured active PDF. */
export async function getActiveAgreement() {
  return db.agreementDocument.findFirst({
    where: { active: true },
    orderBy: { effectiveFrom: "desc" },
  });
}
