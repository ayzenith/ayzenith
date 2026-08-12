import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

/**
 * Stateless session tokens (signed JWT via `jose`).
 *
 * WHY jose: it runs on the Edge runtime, so the SAME verify logic works in
 * middleware (which gates /admin before a request reaches the server) and in
 * Node server components. This module is intentionally pure — no Prisma, no
 * next/headers — so it can be imported from anywhere. Cookie plumbing lives in
 * `session-cookie.ts` (server-only).
 *
 * The token carries only identity claims. Authorization that must reflect the
 * live database (a user being deactivated or demoted) is re-checked server-side
 * in the protected layout — the token is a fast gate, not the final word.
 */

export const SESSION_COOKIE = "ayzenith_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds.

export type SessionPayload = {
  sub: string; // user id
  email: string;
  name: string;
  role: Role;
};

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short (needs ≥32 chars). Set it in your .env.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecretKey());
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const { sub, email, name, role } = payload as Record<string, unknown>;
    if (
      typeof sub === "string" &&
      typeof email === "string" &&
      typeof name === "string" &&
      (role === "SUPER_ADMIN" || role === "ADMIN" || role === "EDITOR")
    ) {
      return { sub, email, name, role };
    }
    return null;
  } catch {
    return null;
  }
}
