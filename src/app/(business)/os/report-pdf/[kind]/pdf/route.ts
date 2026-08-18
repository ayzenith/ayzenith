import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { getCashflowReportPdf, getProductsReportPdf, getInventoryReportPdf } from "@/server/os/report-pdf";
import { signResourceToken } from "@/server/os/document-token";
import { renderUrlToPdf, selfBaseUrl } from "@/lib/pdf/render";
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

  const data = await loader();
  const token = await signResourceToken(`report:${kind}`);
  const url = `${selfBaseUrl()}/doc/report/${kind}/print?token=${token}`;

  let pdf: Buffer;
  try {
    pdf = await renderUrlToPdf(url, {
      orientation: "portrait",
      footerLeft: `${data.title} · ${data.company.companyTradingName ?? "AYZENITH"}`,
      pageOfLabel: "Sayfa",
    });
  } catch (err) {
    console.error("Report PDF generation failed:", err);
    return new NextResponse("PDF generation failed", { status: 500 });
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
      "Content-Disposition": `attachment; filename="AYZENITH-${data.title.replace(/\s+/g, "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
