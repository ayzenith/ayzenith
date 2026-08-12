"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Role } from "@prisma/client";
import { ROLE_LABEL } from "@/lib/auth/roles";
import {
  setUserActiveAction,
  setUserRoleAction,
} from "@/app/(admin)/admin/(dashboard)/users/actions";

/**
 * Inline role switch + active toggle for a user row. `locked` disables controls
 * that would break an invariant (self, or the last active Super Admin) — the
 * server enforces the same rules regardless.
 */
export function UserRowActions({
  id,
  role,
  active,
  locked,
}: {
  id: string;
  role: Role;
  active: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function changeRole(next: string) {
    if (next === role) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("role", next);
    startTransition(async () => {
      await setUserRoleAction(fd);
      router.refresh();
    });
  }

  function toggleActive() {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("active", (!active).toString());
    startTransition(async () => {
      await setUserActiveAction(fd);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <select
        aria-label="Rol"
        value={role}
        disabled={pending || locked}
        onChange={(e) => changeRole(e.target.value)}
        className="h-8 rounded-md border border-border bg-surface px-2 text-caption text-foreground outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="EDITOR">{ROLE_LABEL.EDITOR}</option>
        <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
        <option value="SUPER_ADMIN">{ROLE_LABEL.SUPER_ADMIN}</option>
      </select>

      <button
        type="button"
        onClick={toggleActive}
        disabled={pending || locked}
        className={
          "inline-flex h-8 items-center rounded-md border px-3 text-caption font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
          (active
            ? "border-border text-muted hover:border-[#e0b4b4] hover:text-[#8a2b2b]"
            : "border-[#3f9c5a]/40 text-[#2f7a48] hover:bg-[#e8f3ec]")
        }
      >
        {active ? "Devre dışı bırak" : "Etkinleştir"}
      </button>
    </div>
  );
}
