import "server-only";
import type { Role, User } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

/**
 * User repository — the ONLY module that reads/writes the User table.
 *
 * This is the repository boundary: server actions and components call these
 * functions, never Prisma directly. Swapping the datastore later (or adding
 * caching) happens here without touching any UI. `SafeUser` never carries the
 * password hash, so it is safe to pass to client components.
 */

export type SafeUser = Omit<User, "passwordHash">;

function toSafe(user: User): SafeUser {
  // Strip the hash before a user object ever leaves the server boundary.
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Full record incl. password hash — for authentication only. */
export function findUserByEmailWithHash(email: string): Promise<User | null> {
  return db.user.findUnique({ where: { email: normalizeEmail(email) } });
}

export async function getUserById(id: string): Promise<SafeUser | null> {
  const user = await db.user.findUnique({ where: { id } });
  return user ? toSafe(user) : null;
}

export async function listUsers(): Promise<SafeUser[]> {
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" } });
  return users.map(toSafe);
}

export function countUsers(): Promise<number> {
  return db.user.count();
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
  active?: boolean;
}): Promise<SafeUser> {
  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: {
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      passwordHash,
      role: input.role,
      active: input.active ?? true,
    },
  });
  return toSafe(user);
}

export async function setUserActive(
  id: string,
  active: boolean,
): Promise<SafeUser> {
  const user = await db.user.update({ where: { id }, data: { active } });
  return toSafe(user);
}

export async function updateUserRole(
  id: string,
  role: Role,
): Promise<SafeUser> {
  const user = await db.user.update({ where: { id }, data: { role } });
  return toSafe(user);
}

export function recordLogin(id: string): Promise<User> {
  return db.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
}

/** Does a user already exist with this email? */
export async function emailExists(email: string): Promise<boolean> {
  const found = await db.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true },
  });
  return Boolean(found);
}

/** Count of ACTIVE Super Admins — used to guard the "last admin" invariant. */
export function countActiveSuperAdmins(): Promise<number> {
  return db.user.count({ where: { role: "SUPER_ADMIN", active: true } });
}
