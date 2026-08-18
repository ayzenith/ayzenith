import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { verifyResourceToken } from "@/server/os/document-token";
import { getPaymentReceipt, getExpenseReceipt, getTaxReceipt } from "@/server/os/receipts";
import { ReceiptTemplate } from "@/components/trade-docs/receipt-template";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LOADERS = { payment: getPaymentReceipt, expense: getExpenseReceipt, tax: getTaxReceipt } as const;

export default async function ReceiptPrint({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { kind, id } = await params;
  const { token } = await searchParams;
  const loader = LOADERS[kind as keyof typeof LOADERS];
  if (!loader) notFound();

  const resource = `${kind}:${id}`;
  const user = await getCurrentUser();
  if (!user) {
    const ok = await verifyResourceToken(token, resource);
    if (!ok) notFound();
  }

  const data = await loader(id);
  if (!data) notFound();

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        html, body { background: #E9EBEF; }
        @media print { html, body { background: #fff; } }
      `}</style>
      <ReceiptTemplate data={data} />
    </>
  );
}
