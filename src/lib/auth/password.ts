import bcrypt from "bcryptjs";

/**
 * Password hashing. Passwords are NEVER stored or logged in plain text — only
 * the bcrypt hash is persisted (see User.passwordHash). Cost factor 12 is a
 * sensible 2020s default for interactive logins.
 */

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
