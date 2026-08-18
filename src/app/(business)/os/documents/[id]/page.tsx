import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDocument } from "@/server/os/trade-documents";
import { listSignatories } from "@/server/os/signatories";
import { listBankAccounts } from "@/server/os/bank-accounts";
import { docTitle } from "@/config/trade-documents";
import { DocumentEditor } from "@/components/trade-docs/document-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const doc = await getDocument(id);
  return { title: doc ? `${docTitle("TR", doc.docType)} ${doc.code} · Business OS` : "Belge · Business OS" };
}

export default async function DocumentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [doc, signatories, bankAccounts] = await Promise.all([
    getDocument(id),
    listSignatories({ activeOnly: true }),
    listBankAccounts({ activeOnly: true }),
  ]);
  if (!doc) notFound();

  return (
    <DocumentEditor
      doc={doc}
      signatories={signatories.map((s) => ({ id: s.id, name: [s.firstName, s.lastName].filter(Boolean).join(" "), title: s.jobTitle }))}
      bankAccounts={bankAccounts.map((b) => ({ id: b.id, label: `${b.bankName} — ${b.currency}`, currency: b.currency }))}
    />
  );
}
