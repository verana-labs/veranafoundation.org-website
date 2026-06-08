"use server";

import { redirect } from "next/navigation";
import { db } from "@/app/lib/db";
import { currentUser, isManagerOf } from "@/app/lib/authz";
import { getStripe } from "@/app/lib/payments/stripe";

/** Open the Stripe Customer Portal for self-serve invoice/payment management. */
export async function openBillingPortal(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const user = await currentUser();
  if (!user?.id || !(await isManagerOf(user.id, memberId))) {
    throw new Error("Forbidden");
  }

  const member = await db.member.findUnique({ where: { id: memberId } });
  const stripe = getStripe();
  if (!stripe || !member?.stripeCustomerId) {
    throw new Error("Billing portal is not available for this organization.");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: member.stripeCustomerId,
    return_url: `${process.env.AUTH_URL ?? "http://localhost:3000"}/account/org/${memberId}/billing`,
  });
  redirect(session.url);
}
