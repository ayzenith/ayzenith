import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { verifyDocumentToken } from "@/server/os/document-token";
import { getDocument } from "@/server/os/trade-documents";
import { docOrientation } from "@/config/trade-documents";
import { DocumentTemplate } from "@/components/trade-docs/document-template";

/**
 * The ONE rendered surface for a trade document — loaded directly by the live
 * A4 preview iframe (browser session cookie authorizes it) AND navigated to by
 * Puppeteer for PDF generation (a short-lived, document-scoped token in the
 * query string authorizes it — see src/server/os/document-token.ts). No shell
 * chrome, no nav: just the printable page, so "what you see is what prints"
 * is not a promise, it's the same DOM.
 */

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DocumentPrint({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  const user = await getCurrentUser();
  if (!user) {
    const ok = await verifyDocumentToken(token, id);
    if (!ok) notFound();
  }

  const doc = await getDocument(id);
  if (!doc) notFound();

  const orientation = docOrientation(doc.docType);

  return (
    <>
      <style>{`
        @page { size: A4 ${orientation}; margin: 0; }
        html, body { background: #E9EBEF; }
        @media print { html, body { background: #fff; } }
      `}</style>
      <DocumentTemplate data={doc} />
    </>
  );
}
