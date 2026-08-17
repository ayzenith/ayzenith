"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, LogOut, Plus, LayoutGrid } from "lucide-react";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/server/auth-actions";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { osNavGroups, quickActions } from "./nav";

/**
 * Business OS application shell.
 *
 * Structurally the same as the CMS shell — fixed rail, mobile drawer, sticky
 * topbar — but it wears its own identity: a dark navigation rail against the
 * light workspace, and a gold marker on the active row. That difference is
 * functional, not decorative: the owner switches between two products in one
 * browser, and the chrome should say which one they are in before they read a
 * single word.
 *
 * The only client state here is the mobile drawer. Everything it wraps stays a
 * Server Component.
 */

export type OsUser = { name: string; email: string; role: Role };

function isActive(pathname: string, href: string): boolean {
  const base = href.split("?")[0] ?? href;
  if (base === "/os") return pathname === "/os";
  return pathname === base || pathname.startsWith(`${base}/`);
}

function initialsOf(name: string): string {
  return name.split(" ").map((w) => w.charAt(0)).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {osNavGroups.map((group) => (
        <div key={group.heading} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-navy-300/70">
            {group.heading}
          </p>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={item.hint}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-small font-medium transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-navy-200 hover:bg-white/5 hover:text-white",
                )}
              >
                {active ? (
                  <span
                    className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                ) : null}
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Wordmark() {
  return (
    <span className="flex flex-col leading-none">
      <span className="font-sans text-body font-semibold tracking-tight text-white">AYZENITH</span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
        Business OS
      </span>
    </span>
  );
}

export function OsShell({ user, children }: { user: OsUser; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-surface-sunken text-foreground">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-navy-950 lg:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <Wordmark />
        </div>
        <NavList pathname={pathname} onNavigate={() => {}} />
        <div className="border-t border-white/10 px-3 py-3">
          <Link
            href="/admin"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-caption font-medium text-navy-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LayoutGrid className="size-3.5" aria-hidden="true" />
            CMS &amp; RADAR paneline dön
          </Link>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-navy-950/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-navy-950 shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
              <Wordmark />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Menüyü kapat"
                className="rounded-md p-1.5 text-navy-300 hover:bg-white/10 hover:text-white"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <NavList pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Menüyü aç"
            className="rounded-md p-2 text-muted hover:bg-surface-sunken hover:text-foreground lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>

          <div className="flex-1" />

          {/* Global quick-create — one door into every record type. */}
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg bg-navy-950 px-3 py-2 text-small font-semibold text-white transition-colors hover:bg-navy-900">
              <Plus className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Yeni</span>
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
              {quickActions.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="block px-4 py-2 text-small text-muted transition-colors hover:bg-surface-sunken hover:text-foreground"
                >
                  {a.label}
                </Link>
              ))}
            </div>
          </details>

          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-sunken">
              <span className="flex size-8 items-center justify-center rounded-full bg-navy-950 text-caption font-semibold text-white">
                {initialsOf(user.name)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-small font-medium text-foreground">{user.name}</span>
                <span className="block text-caption text-subtle">{ROLE_LABEL[user.role]}</span>
              </span>
              <ChevronDown className="size-4 text-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
              <div className="border-b border-border px-4 py-3">
                <p className="text-small font-medium text-foreground">{user.name}</p>
                <p className="truncate text-caption text-subtle">{user.email}</p>
              </div>
              <Link
                href="/admin"
                className="flex items-center gap-2.5 px-4 py-2.5 text-small font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-foreground"
              >
                <LayoutGrid className="size-4" aria-hidden="true" />
                CMS &amp; RADAR
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 border-t border-border px-4 py-2.5 text-left text-small font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-foreground"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Çıkış yap
                </button>
              </form>
            </div>
          </details>
        </header>

        <main className="mx-auto max-w-[88rem] px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
