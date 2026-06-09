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
    <div className="flex justify-center px-4 py-16 sm:py-24">
      <div className="w-full max-w-sm">
        <div className="card">
          <div className="flex justify-center mb-5">
            <svg width="40" height="38" viewBox="0 0 54 52" aria-hidden="true">
              <path
                fill="#763EF0"
                d="M26.9932 51.6972L5.805 11.0977L2.91263 16.2161L0 10.6048L5.98725 0L26.9932 40.2483L47.9993 0L54 10.6217L51.0773 16.2161L48.1849 11.0977L26.9932 51.6972Z"
              />
              <path
                fill="#1FB57A"
                d="M13.696 0L26.9935 25.4637L39.9367 0H13.696Z"
              />
            </svg>
          </div>
          <h1 className="display text-2xl text-center">Sign in</h1>
          <p className="text-sm text-muted text-center mt-1 mb-6">
            Continue to your Verana Foundation account — passwordless.
          </p>
          <LoginForm callbackUrl={callbackUrl ?? "/account"} />
        </div>
        <p className="text-center text-xs text-muted mt-4">
          New here? Signing in creates your account.
        </p>
      </div>
    </div>
  );
}
