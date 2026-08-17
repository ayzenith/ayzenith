"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { previewImport, runImport, type ImportPreview, type ImportResult } from "@/server/os/excel/import";
import { schemaFor } from "@/server/os/excel/schemas";

/**
 * Business OS — the two steps of an Excel import.
 *
 * The file is uploaded twice on purpose: once to be read and reported back, once
 * to be written with the confirmed column mapping. The alternative is stashing a
 * multi-megabyte upload in a server-side session between steps, which needs
 * storage, expiry and cleanup to solve a problem the browser already solved by
 * still holding the File object.
 *
 * Nothing is written during the preview step.
 */

const MAX_BYTES = 10 * 1024 * 1024;

async function bufferOf(fd: FormData): Promise<{ buffer: Buffer; name: string }> {
  const file = fd.get("file");
  if (!(file instanceof File)) throw new Error("Dosya seçilmedi.");
  if (file.size === 0) throw new Error("Dosya boş.");
  if (file.size > MAX_BYTES) throw new Error("Dosya 10 MB'tan büyük olamaz.");
  if (!/\.xlsx?$/i.test(file.name)) {
    throw new Error("Sadece .xlsx dosyaları okunabiliyor. Excel'de 'Farklı Kaydet → .xlsx' seç.");
  }
  return { buffer: Buffer.from(await file.arrayBuffer()), name: file.name };
}

export type PreviewState =
  | { ok: true; preview: ImportPreview; fields: Array<{ key: string; label: string; required: boolean }> }
  | { ok: false; error: string };

export async function previewImportAction(fd: FormData): Promise<PreviewState> {
  await requireUser();
  const entity = String(fd.get("entity") ?? "");
  const schema = schemaFor(entity);
  if (!schema) return { ok: false, error: "Bilinmeyen içe aktarma türü." };
  try {
    const { buffer } = await bufferOf(fd);
    const preview = await previewImport(entity, buffer);
    return {
      ok: true,
      preview,
      fields: schema.fields.map((f) => ({ key: f.key, label: f.label, required: Boolean(f.required) })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Dosya okunamadı." };
  }
}

export type RunState = { ok: true; result: ImportResult } | { ok: false; error: string };

export async function runImportAction(fd: FormData): Promise<RunState> {
  const user = await requireUser();
  const entity = String(fd.get("entity") ?? "");
  if (!schemaFor(entity)) return { ok: false, error: "Bilinmeyen içe aktarma türü." };

  let mapping: Record<number, string>;
  try {
    mapping = JSON.parse(String(fd.get("mapping") ?? "{}")) as Record<number, string>;
  } catch {
    return { ok: false, error: "Sütun eşleştirmesi okunamadı." };
  }

  try {
    const { buffer, name } = await bufferOf(fd);
    const result = await runImport(entity, buffer, mapping, { fileName: name, userId: user.id });
    // Every screen the import could have touched.
    for (const path of ["/os", "/os/companies", "/os/products", "/os/inventory", "/os/sales", "/os/purchases", "/os/expenses", "/os/finance"]) {
      revalidatePath(path);
    }
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "İçe aktarma başarısız." };
  }
}
