import "server-only";
import { db } from "@/lib/db";

/**
 * Dashboard metrics. Only counts tables that exist in the current schema — as
 * later batches add Product, BlogPost, ContactMessage, etc., their counts join
 * here and light up the corresponding cards. Nothing is fabricated.
 */
export async function getDashboardStats(): Promise<{
  users: number;
  activityEvents: number;
  products: number;
  productsPublished: number;
  messages: number;
  messagesUnread: number;
}> {
  const [users, activityEvents, products, productsPublished, messages, messagesUnread] =
    await Promise.all([
      db.user.count(),
      db.activityLog.count(),
      db.product.count(),
      db.product.count({ where: { status: "PUBLISHED" } }),
      db.contactMessage.count(),
      db.contactMessage.count({ where: { status: "NEW" } }),
    ]);
  return { users, activityEvents, products, productsPublished, messages, messagesUnread };
}
