import "server-only";
import { db } from "@/lib/db";

/**
 * Activity repository — append-only audit trail. Every meaningful mutation in
 * the CMS should call `logActivity`; the dashboard and per-user logs read it
 * back. Kept deliberately tiny and forgiving: logging must never break the
 * action it is recording, so failures are swallowed.
 */

export async function logActivity(input: {
  userId: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  summary?: string;
}): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        summary: input.summary,
      },
    });
  } catch {
    // Auditing is best-effort — never let it fail the underlying operation.
  }
}

export function recentActivity(limit = 8) {
  return db.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  });
}
