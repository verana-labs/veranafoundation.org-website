import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="display text-2xl">Sign in</h1>
        <p className="text-sm text-muted mt-1 mb-5">
          Passwordless — choose a provider or get a link by email.
        </p>
        <LoginForm callbackUrl={callbackUrl ?? "/account"} />
      </div>
    </div>
  );
}
