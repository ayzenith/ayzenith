"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import type { Role } from "@prisma/client";
import { navGroups, type NavItem } from "./nav";
import { hasAtLeast } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

/**
 * CMS sidebar. Uses plain next/link (the admin app is NOT localized). Items the
 * user lacks the role for are hidden; "soon" items render disabled with a badge
 * so the roadmap is visible without pretending the feature exists.
 */

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const base =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-small font-medium transition-colors";

  if (item.status === "soon") {
    return (
      <span
        className={cn(base, "cursor-default text-subtle")}
        aria-disabled="true"
        title={item.note}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">{item.label}</span>
        <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
          Yakında
        </span>
      </span>
    );
  }

  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        base,
        active
          ? "bg-navy-950 text-white"
          : "text-muted hover:bg-surface-sunken hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

function NavContent({
  role,
  pathname,
  onNavigate,
}: {
  role: Role;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {navGroups.map((group) => {
        const items = group.items.filter(
          (item) => !item.minRole || hasAtLeast(role, item.minRole),
        );
        if (items.length === 0) return null;
        return (
          <div key={group.heading} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              {group.heading}
            </p>
            {items.map((item) => (
              <NavRow
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar({
  role,
  mobileOpen,
  onClose,
}: {
  role: Role;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: fixed rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <span className="font-sans text-h6 font-semibold tracking-tight text-foreground">
            AYZENITH
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-subtle">
            CMS
          </span>
        </div>
        <NavContent role={role} pathname={pathname} onNavigate={() => {}} />
      </aside>

      {/* Mobile: slide-over drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-navy-950/40"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-surface shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-border px-6">
              <span className="font-sans text-h6 font-semibold tracking-tight text-foreground">
                AYZENITH
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="rounded-md p-1.5 text-muted hover:bg-surface-sunken hover:text-foreground"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <NavContent role={role} pathname={pathname} onNavigate={onClose} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
