import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./login-form";

/**
 * CMS login — the only unauthenticated route under /admin. Already-signed-in
 * users are bounced straight to the dashboard. Reading the session (via
 * getCurrentUser → cookies()) makes this route dynamic, so it is never
 * prerendered at build time.
 */

export const metadata: Metadata = { title: "Giriş · AYZENITH Panel" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const existing = await getCurrentUser();
  if (existing) redirect("/admin");

  const { from } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-sans text-h4 font-semibold tracking-tight text-foreground">
            AYZENITH
          </p>
          <p className="mt-1 text-caption uppercase tracking-[0.2em] text-subtle">
            Yönetim Paneli
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <h1 className="text-h6 font-semibold text-foreground">Giriş yap</h1>
          <p className="mt-1 mb-6 text-small text-muted">
            Erişim yalnızca yetkili kullanıcılara açıktır.
          </p>
          <LoginForm from={from} />
        </div>

        <p className="mt-6 text-center text-caption text-subtle">
          Korumalı alan · Kayıt yok
        </p>
      </div>
    </main>
  );
}
