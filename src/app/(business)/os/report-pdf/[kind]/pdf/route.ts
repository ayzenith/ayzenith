import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { getCashflowReportPdf, getProductsReportPdf, getInventoryReportPdf } from "@/server/os/report-pdf";
import { signResourceToken } from "@/server/os/document-token";
import { renderUrlToPdf, selfBaseUrl } from "@/lib/pdf/render";
import { asciiFilename } from "@/lib/pdf/filename";
import { logActivity } from "@/server/activity";

export const dynamic = "force-dynamic";

const LOADERS = {
  "finance-cashflow": getCashflowReportPdf,
  products: getProductsReportPdf,
  inventory: getInventoryReportPdf,
} as const;

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { kind } = await params;
  const loader = LOADERS[kind as keyof typeof LOADERS];
  if (!loader) return new NextResponse("Not found", { status: 404 });

  let data;
  try {
    data = await loader();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PDF] Report data loading failed (${kind}): ${msg}`);
    return new NextResponse(`Report data loading failed: ${msg}`, { status: 500 });
  }

  const token = await signResourceToken(`report:${kind}`);
  const url = `${selfBaseUrl()}/doc/report/${kind}/print?token=${token}`;
  console.log(`[PDF] Generated URL for ${kind}: ${url}`);

  let pdf: Buffer;
  try {
    pdf = await renderUrlToPdf(url, {
      orientation: "portrait",
      footerLeft: `${data.title} · ${data.company.companyTradingName ?? "AYZENITH"}`,
      pageOfLabel: "Sayfa",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PDF] Report PDF generation failed for ${kind}: ${msg}`);
    return new NextResponse(`PDF generation failed: ${msg}`, { status: 500 });
  }

  await logActivity({
    userId: user.id,
    action: "os.report.pdf",
    entity: "Report",
    entityId: kind,
    summary: `Rapor PDF indirildi (${data.title})`,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="AYZENITH-${asciiFilename(data.title, "rapor")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
