import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { logActivity } from "@/server/activity";
import {
  exportChannels, exportExpenses, exportItems, exportMovements, exportParties,
  exportPayments, exportPurchases, exportReport, exportSales, exportStock, exportTax,
  type ExportResult,
} from "@/server/os/excel/export";
import { exportTradeDocument } from "@/server/os/excel/trade-documents-export";

/**
 * Business OS — one download endpoint for every spreadsheet.
 *
 * A route handler rather than a server action because the browser must receive a
 * file, and because `?kind=sales&from=…` makes an export a bookmarkable URL: the
 * owner can keep "this month's sales" in their bookmarks bar and it stays right
 * every month.
 *
 * Authentication is re-checked here. The middleware gate covers /os/*, but a
 * download route is exactly the kind of URL that gets pasted somewhere, so it
 * verifies the session against the database itself and returns 401 rather than
 * redirecting — a redirect would download an HTML login page named .xlsx.
 */

export const dynamic = "force-dynamic";

function dateParam(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Yetkisiz", { status: 401 });

  const p = request.nextUrl.searchParams;
  const kind = p.get("kind") ?? "";
  const from = dateParam(p.get("from"));
  const to = dateParam(p.get("to"));

  let result: ExportResult;
  try {
    switch (kind) {
      case "parties":
        result = await exportParties({
          search: p.get("q") ?? undefined,
          role: p.get("role") ?? undefined,
          country: p.get("country") ?? undefined,
        });
        break;
      case "items":
        result = await exportItems({
          search: p.get("q") ?? undefined,
          category: p.get("category") ?? undefined,
        });
        break;
      case "stock":
        result = await exportStock();
        break;
      case "movements":
        result = await exportMovements(p.get("itemId") ?? undefined);
        break;
      case "channels":
        result = await exportChannels();
        break;
      case "purchases":
        result = await exportPurchases({ from, to, supplierId: p.get("supplierId") ?? undefined });
        break;
      case "sales":
        result = await exportSales({
          from, to,
          customerId: p.get("customerId") ?? undefined,
          channelId: p.get("channelId") ?? undefined,
        });
        break;
      case "payments":
        result = await exportPayments({
          direction: (p.get("direction") as "IN" | "OUT" | null) ?? undefined,
          overdueOnly: p.get("overdue") === "1",
        });
        break;
      case "expenses":
        result = await exportExpenses({ from, to });
        break;
      case "tax":
        result = await exportTax();
        break;
      case "report":
        result = await exportReport(p.get("report") ?? "sales", {
          from, to,
          partyId: p.get("partyId") ?? undefined,
          itemId: p.get("itemId") ?? undefined,
          channelId: p.get("channelId") ?? undefined,
          country: p.get("country") ?? undefined,
          currency: p.get("currency") ?? undefined,
        });
        break;
      case "trade-document": {
        const id = p.get("id");
        if (!id) return new NextResponse("Belge id gerekli", { status: 400 });
        result = await exportTradeDocument(id);
        break;
      }
      default:
        return new NextResponse("Bilinmeyen dışa aktarma türü", { status: 400 });
    }
  } catch (e) {
    return new NextResponse(
      `Dışa aktarma başarısız: ${e instanceof Error ? e.message : "bilinmeyen hata"}`,
      { status: 500 },
    );
  }

  await logActivity({
    userId: user.id,
    action: "os.export",
    entity: "Excel",
    summary: `Excel indirildi: ${kind}${p.get("report") ? ` (${p.get("report")})` : ""}`,
  });

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
