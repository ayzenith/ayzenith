import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { getPaymentReceipt, getExpenseReceipt, getTaxReceipt } from "@/server/os/receipts";
import { signResourceToken } from "@/server/os/document-token";
import { renderUrlToPdf, selfBaseUrl } from "@/lib/pdf/render";
import { asciiFilename } from "@/lib/pdf/filename";
import { logActivity } from "@/server/activity";

/**
 * PDF for a Payment/Expense/Tax receipt — same pattern as the trade-document
 * PDF route (src/app/(business)/os/documents/[id]/pdf/route.ts): re-checks
 * auth, mints a short-lived resource-scoped token for Puppeteer, streams the
 * result, logs the download.
 */

export const dynamic = "force-dynamic";

const LOADERS = { payment: getPaymentReceipt, expense: getExpenseReceipt, tax: getTaxReceipt } as const;

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { kind, id } = await params;
  const loader = LOADERS[kind as keyof typeof LOADERS];
  if (!loader) return new NextResponse("Not found", { status: 404 });

  let data;
  try {
    data = await loader(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PDF] Receipt data loading failed (${kind}/${id}): ${msg}`);
    return new NextResponse(`Receipt data loading failed: ${msg}`, { status: 500 });
  }
  if (!data) return new NextResponse("Not found", { status: 404 });

  const token = await signResourceToken(`${kind}:${id}`);
  const url = `${selfBaseUrl()}/doc/receipt/${kind}/${id}/print?token=${token}`;
  console.log(`[PDF] Generated URL for ${kind} receipt ${id}: ${url}`);

  let pdf: Buffer;
  try {
    pdf = await renderUrlToPdf(url, {
      orientation: "portrait",
      footerLeft: `${data.receiptNo} · ${data.company.companyTradingName ?? "AYZENITH"}`,
      pageOfLabel: "Sayfa",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PDF] Receipt PDF generation failed (${kind}/${id}): ${msg}`);
    return new NextResponse(`PDF generation failed: ${msg}`, { status: 500 });
  }

  await logActivity({
    userId: user.id,
    action: "os.receipt.pdf",
    entity: kind,
    entityId: id,
    summary: `Belge indirildi (${data.receiptNo})`,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="AYZENITH-${asciiFilename(data.receiptNo, "makbuz")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
