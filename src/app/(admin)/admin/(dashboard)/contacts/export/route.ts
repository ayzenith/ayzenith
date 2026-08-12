import { getCurrentUser } from "@/server/auth";
import { contactMessagesCsv } from "@/server/contact";

/**
 * GET /admin/contacts/export — download all inquiries as CSV. Auth-gated: the
 * /admin middleware already blocks anonymous access, and we re-check the session
 * here as defense in depth (route handlers don't run page layouts).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const csv = await contactMessagesCsv();
  const date = new Date().toISOString().slice(0, 10);
  // Prefix a UTF-8 BOM so Excel opens Turkish characters correctly.
  const body = "﻿" + csv;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ayzenith-mesajlar-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
