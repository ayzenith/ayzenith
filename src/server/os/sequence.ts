import "server-only";

import type { Prisma } from "@prisma/client";

/**
 * Document numbering. `ALS-2026-0001`, `SAT-2026-0007`.
 *
 * The counter is incremented inside the SAME transaction that writes the
 * document, so two documents created at the same instant cannot collide — the
 * row lock on `OsSequence` serialises them. Codes restart each year, which is
 * what people expect on paperwork.
 */

export async function nextCode(
  tx: Prisma.TransactionClient,
  prefix: string,
  year = new Date().getFullYear(),
): Promise<string> {
  const key = `${prefix}-${year}`;
  const row = await tx.osSequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${year}-${String(row.value).padStart(4, "0")}`;
}
