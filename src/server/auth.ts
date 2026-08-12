import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { verifyPassword } from "@/lib/auth/password";
import { readSessionCookie } from "@/lib/auth/session-cookie";
import { hasAtLeast } from "@/lib/auth/roles";
import { findUserByEmailWithHash, getUserById, type SafeUser } from "./users";

/**
 * Server-side authentication + authorization helpers.
 *
 * The middleware provides a fast Edge gate (valid signed cookie?). These helpers
 * are the authoritative check: they re-load the user from the database on every
 * request so a deactivated or demoted account loses access immediately, even if
 * its cookie is still cryptographically valid. `getCurrentUser` is wrapped in
 * React `cache` so multiple calls within one request hit the DB only once.
 */

/** Verify credentials for login. Returns the user only if active. */
export async function authenticate(
  email: string,
  password: string,
): Promise<SafeUser | null> {
  const user = await findUserByEmailWithHash(email);
  if (!user || !user.active) return null;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

/** The signed-in user, re-validated against the database, or null. */
export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  const session = await readSessionCookie();
  if (!session) return null;

  const user = await getUserById(session.sub);
  if (!user || !user.active) return null;
  return user;
});

/** Require any signed-in user; redirect to login otherwise. */
export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  return user;
}

/** Require at least `role`; send insufficient users to the dashboard. */
export async function requireRole(role: Role): Promise<SafeUser> {
  const user = await requireUser();
  if (!hasAtLeast(user.role, role)) redirect("/admin");
  return user;
}
