import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { getDocument } from "@/server/os/trade-documents";
import { signDocumentToken } from "@/server/os/document-token";
import { renderUrlToPdf, selfBaseUrl } from "@/lib/pdf/render";
import { docOrientation, t } from "@/config/trade-documents";
import { logActivity } from "@/server/activity";

/**
 * Generates the PDF for one trade document version. Same auth model as the
 * Excel export route (src/app/(business)/os/export/route.ts): re-checks
 * requireUser() itself (401, not a redirect) so a bookmarked link never
 * silently downloads an HTML login page, and every download is logged.
 */

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const token = await signDocumentToken(id);
  const url = `${selfBaseUrl()}/doc/${id}/print?token=${token}`;
  console.log(`[PDF] Generated URL for document ${id}: ${url}`);

  let pdf: Buffer;
  try {
    pdf = await renderUrlToPdf(url, {
      orientation: docOrientation(doc.docType),
      footerLeft: `${doc.code} · ${doc.company.companyTradingName ?? "AYZENITH"}`,
      pageOfLabel: t(doc.language, "page"),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PDF] Document PDF generation failed for ${id}: ${msg}`);
    return new NextResponse(`PDF generation failed: ${msg}`, { status: 500 });
  }

  await logActivity({
    userId: user.id,
    action: "os.document.pdf",
    entity: "TradeDocument",
    entityId: id,
    summary: `PDF indirildi (${doc.code})`,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="AYZENITH-${doc.code}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
