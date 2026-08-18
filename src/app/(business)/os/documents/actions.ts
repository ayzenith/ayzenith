"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TradeDocLanguage, TradeDocType } from "@prisma/client";
import { requireUser } from "@/server/auth";
import {
  createDocument,
  updateDocument,
  updateDocumentLine,
  finalizeDocument,
  cancelDocument,
  deleteDraftDocument,
  createNewVersion,
  duplicateDocument,
  type UpdateDocumentInput,
} from "@/server/os/trade-documents";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function createDocumentAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const saleId = String(fd.get("saleId") || "");
  const docType = String(fd.get("docType") || "") as TradeDocType;
  if (!saleId || !docType) throw new Error("Satış ve belge türü gerekli.");
  const id = await createDocument({ saleId, docType }, u.id);
  revalidatePath(`/os/sales/${saleId}`);
  redirect(`/os/documents/${id}`);
}

/** Called from the client editor on every debounced change. Returns nothing —
 *  the client re-fetches the preview iframe with a fresh cache-busting nonce. */
export async function updateDocumentFieldsAction(id: string, patch: UpdateDocumentInput): Promise<{ ok: boolean; error?: string }> {
  const u = await requireUser();
  try {
    await updateDocument(id, patch, u.id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kaydedilemedi." };
  }
}

export async function updateLineMetaAction(
  documentId: string,
  saleLineId: string,
  patch: { hsCode?: string | null; countryOfOrigin?: string | null; packages?: number | null; netWeight?: number | null; grossWeight?: number | null; dimensions?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  try {
    await updateDocumentLine(documentId, saleLineId, patch);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kaydedilemedi." };
  }
}

export async function finalizeDocumentAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  await finalizeDocument(id, u.id);
  revalidatePath(`/os/documents/${id}`);
  redirect(`/os/documents/${id}`);
}

export async function cancelDocumentAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  await cancelDocument(id, u.id);
  revalidatePath(`/os/documents/${id}`);
  redirect(`/os/documents/${id}`);
}

export async function deleteDraftAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  const saleId = String(fd.get("saleId") || "");
  await deleteDraftDocument(id, u.id);
  revalidatePath(`/os/sales/${saleId}`);
  redirect(`/os/sales/${saleId}?tab=belgeler`);
}

export async function newVersionAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  const newId = await createNewVersion(id, u.id);
  redirect(`/os/documents/${newId}`);
}

export async function duplicateDocumentAction(fd: FormData): Promise<void> {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  const docType = s(fd, "docType") as TradeDocType | null;
  const newId = await duplicateDocument(id, docType ?? undefined, u.id);
  redirect(`/os/documents/${newId}`);
}

export type { TradeDocLanguage };
