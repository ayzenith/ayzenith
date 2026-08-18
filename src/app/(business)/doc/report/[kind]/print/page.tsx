import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { verifyResourceToken } from "@/server/os/document-token";
import { getCashflowReportPdf, getProductsReportPdf, getInventoryReportPdf } from "@/server/os/report-pdf";
import { ReportTemplate } from "@/components/trade-docs/report-template";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LOADERS = {
  "finance-cashflow": getCashflowReportPdf,
  products: getProductsReportPdf,
  inventory: getInventoryReportPdf,
} as const;

export default async function ReportPrint({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { kind } = await params;
  const { token } = await searchParams;
  const loader = LOADERS[kind as keyof typeof LOADERS];
  if (!loader) notFound();

  const resource = `report:${kind}`;
  const user = await getCurrentUser();
  if (!user) {
    const ok = await verifyResourceToken(token, resource);
    if (!ok) notFound();
  }

  const data = await loader();

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        html, body { background: #E9EBEF; }
        @media print { html, body { background: #fff; } }
      `}</style>
      <ReportTemplate data={data} />
    </>
  );
}
