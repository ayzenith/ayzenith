import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { canManageSettings } from "@/lib/auth/roles";
import { getSearch, listCompaniesForSearch } from "@/server/leads/leads";
import { applyLeadFilters, parseLeadFilters } from "@/server/leads/filter";
import { getCompaniesForExport, buildXlsx, buildCsv } from "@/server/leads/export";
import { db } from "@/lib/db";

/**
 * GET /admin/lead-finder/export — download the CURRENT filtered result set as a
 * real .xlsx (3 sheets: Leads, Contacts, Sources) or .csv (§27/§28).
 *
 * Auth-gated as defence in depth (route handlers don't run page layouts): the
 * user must be an ADMIN, mirroring the module's screens — so only authorised
 * operators can export leads. The active on-screen filters are read from the
 * query and applied with the SAME pure function the results page uses, so the
 * export contains exactly what was on screen — no more, no duplicates.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageSettings(user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const searchId = sp.get("search") ?? "";
  const format = (sp.get("format") ?? "xlsx").toLowerCase() === "csv" ? "csv" : "xlsx";
  if (!searchId) return new Response("Missing search id", { status: 400 });

  const search = await getSearch(searchId);
  if (!search) return new Response("Not found", { status: 404 });

  const filters = parseLeadFilters(Object.fromEntries(sp.entries()));
  const all = await listCompaniesForSearch(searchId);
  const filtered = applyLeadFilters(all, filters);
  const companies = await getCompaniesForExport(filtered.map((c) => c.id));

  // Record the export (auditable; §27).
  try {
    await db.leadExport.create({
      data: {
        searchId,
        format,
        filterJson: filters as object,
        rowCount: companies.length,
        createdById: user.id,
      },
    });
  } catch {
    // Non-fatal: never block a download on an audit-write failure.
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const slug = (search.productQuery || "lead").toLocaleLowerCase("tr").replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "lead";
  const base = `ayzenith-leads-${slug}-${dateStr}`;

  if (format === "csv") {
    const body = "﻿" + buildCsv(search, companies); // UTF-8 BOM for Excel/TR chars
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = await buildXlsx(search, companies);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
