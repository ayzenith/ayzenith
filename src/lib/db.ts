import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Next.js hot-reloads modules in development, which would otherwise spawn a new
 * database connection on every change and exhaust the pool. We cache the client
 * on `globalThis` outside production so only one instance ever exists.
 *
 * This module is the ONLY place that constructs a Prisma client. Everything else
 * imports `db` from here — and, in practice, goes through the repositories in
 * `src/server/*` rather than touching `db` directly.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
