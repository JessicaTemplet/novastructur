import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import Image from "next/image";
import { signIn } from "@/server/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect("/login?error=1");
      }
      throw err;
    }
  }

  return (
    <div className="ns-grid-bg flex min-h-screen w-full items-center justify-center bg-ns-bg px-4">
      <div className="flex w-full max-w-[360px] flex-col items-center gap-4.5 rounded-2xl border border-ns-border-strong bg-ns-bg-sidebar p-9 shadow-[0_0_40px_rgba(0,0,0,.4)]">
        <Image
          src="/assets/novastructur-logo.png"
          alt="NovaStructur"
          width={56}
          height={56}
          className="h-14 w-14 rounded-xl drop-shadow-[0_0_16px_var(--color-ns-accent)]"
        />
        <div className="text-center">
          <h1 className="font-display text-xl font-extrabold tracking-wide text-ns-text">NOVASTRUCTUR</h1>
          <p className="mt-1.5 text-[12.5px] font-medium text-ns-text-dim">
            The tracker that stays out of your way.
          </p>
        </div>

        <form action={login} className="flex w-full flex-col gap-3">
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
              Invalid email or password.
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-[12px] font-medium text-ns-text-dim">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              className="w-full rounded-md border border-ns-border-strong bg-white/[.03] px-3 py-2 text-[13px] text-ns-text-body outline-none placeholder:text-ns-text-faint focus:border-ns-accent/70 focus:ring-1 focus:ring-ns-accent/40"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-[12px] font-medium text-ns-text-dim">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded-md border border-ns-border-strong bg-white/[.03] px-3 py-2 text-[13px] text-ns-text-body outline-none placeholder:text-ns-text-faint focus:border-ns-accent/70 focus:ring-1 focus:ring-ns-accent/40"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="mt-1 w-full rounded-md bg-ns-accent-bg py-2.5 font-display text-[13px] font-bold tracking-wide text-ns-accent shadow-[0_0_16px_-2px_var(--color-ns-accent)] ring-1 ring-ns-accent/70 transition hover:brightness-110"
          >
            Sign in
          </button>
        </form>

        <p className="text-center text-[11px] text-ns-text-faint">Demo: lilith@acme.dev / password123</p>
      </div>
    </div>
  );
}
