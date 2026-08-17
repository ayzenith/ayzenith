import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { buildErrorReport, buildTemplate } from "@/server/os/excel/import";
import { schemaFor } from "@/server/os/excel/schemas";

/**
 * Business OS — import templates and error reports.
 *
 * `?entity=party` downloads a blank file with the right headers, a filled
 * example row, and a second sheet explaining every column. `?errors=<batchId>`
 * downloads exactly the rows that were rejected, with the reason next to each —
 * fix them in place and re-upload the same file.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Yetkisiz", { status: 401 });

  const p = request.nextUrl.searchParams;
  const batchId = p.get("errors");

  if (batchId) {
    const report = await buildErrorReport(batchId);
    if (!report) return new NextResponse("Kayıt bulunamadı", { status: 404 });
    return new NextResponse(new Uint8Array(report.buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="AYZENITH-Hatali-Satirlar-${report.entity}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const entity = p.get("entity") ?? "";
  const schema = schemaFor(entity);
  if (!schema) return new NextResponse("Bilinmeyen şablon", { status: 400 });

  const buffer = await buildTemplate(entity);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="AYZENITH-Sablon-${entity}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
