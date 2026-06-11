import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/app/lib/authz";
import { db } from "@/app/lib/db";
import SettingsForm from "./SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user?.id) redirect("/login");
  const record = await db.user.findUnique({ where: { id: user.id } });

  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="tag mb-4">Settings</p>
          <h1 className="display text-4xl sm:text-5xl leading-tight max-w-3xl">
            How you appear
          </h1>
          <div className="accent-line mt-6" />
        </div>
      </section>

      <section>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <SettingsForm
            displayName={record?.displayName ?? null}
            providerName={record?.name ?? null}
          />
        </div>
      </section>
    </>
  );
}
