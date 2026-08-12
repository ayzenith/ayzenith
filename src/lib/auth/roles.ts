import type { Role } from "@prisma/client";

/**
 * Role model. Higher rank ⇒ more capability. A user "has at least" a role when
 * their rank meets or exceeds the required rank.
 *
 * - EDITOR      — create/edit content (products, blog, pages), but not settings
 *                 or user management.
 * - ADMIN       — everything an editor can do, plus settings, SEO, contacts.
 * - SUPER_ADMIN — everything, plus user management and destructive actions.
 */

export const ROLE_RANK: Record<Role, number> = {
  EDITOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export const ROLE_LABEL: Record<Role, string> = {
  EDITOR: "Editör",
  ADMIN: "Yönetici",
  SUPER_ADMIN: "Süper Yönetici",
};

export function hasAtLeast(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** Only Super Admins may manage other users. */
export function canManageUsers(role: Role): boolean {
  return hasAtLeast(role, "SUPER_ADMIN");
}

/** Admins and above may edit site-wide settings and SEO. */
export function canManageSettings(role: Role): boolean {
  return hasAtLeast(role, "ADMIN");
}
