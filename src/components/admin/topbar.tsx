"use client";

import { Menu, ChevronDown, LogOut } from "lucide-react";
import { logoutAction } from "@/server/auth-actions";
import { ROLE_LABEL } from "@/lib/auth/roles";
import type { ShellUser } from "./admin-shell";

/**
 * Sticky topbar with the mobile menu trigger and a user dropdown. The dropdown
 * is a native <details> element — accessible and JS-light. Sign-out posts to the
 * `logoutAction` server action.
 */

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((word) => word.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Topbar({
  user,
  onMenu,
}: {
  user: ShellUser;
  onMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="rounded-md p-2 text-muted hover:bg-surface-sunken hover:text-foreground lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      <div className="flex-1" />

      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-sunken">
          <span className="flex size-8 items-center justify-center rounded-full bg-navy-950 text-caption font-semibold text-white">
            {initialsOf(user.name)}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-small font-medium text-foreground">
              {user.name}
            </span>
            <span className="block text-caption text-subtle">
              {ROLE_LABEL[user.role]}
            </span>
          </span>
          <ChevronDown
            className="size-4 text-subtle transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <p className="text-small font-medium text-foreground">{user.name}</p>
            <p className="truncate text-caption text-subtle">{user.email}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-small font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-foreground"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Çıkış yap
            </button>
          </form>
        </div>
      </details>
    </header>
  );
}
