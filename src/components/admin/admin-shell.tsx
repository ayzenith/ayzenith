"use client";

import { useState } from "react";
import type { Role } from "@prisma/client";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * Admin application shell — fixed sidebar on desktop, slide-over drawer on
 * mobile, sticky topbar with the user menu. A thin client wrapper that holds
 * only the mobile-drawer open state; the page content it wraps stays a Server
 * Component (passed through as `children`).
 */

export type ShellUser = { name: string; email: string; role: Role };

export function AdminShell({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-surface-sunken text-foreground">
      <Sidebar
        role={user.role}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="lg:pl-64">
        <Topbar user={user} onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
