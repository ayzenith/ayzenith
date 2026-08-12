"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import { logActivity } from "@/server/activity";
import {
  createMediaFromUpload,
  deleteMedia,
  renameMedia,
} from "@/server/media";
import type { MediaDTO } from "@/config/media";

/**
 * Media Library mutations. Uploads flow through the server (the service-role key
 * never reaches the browser): the client sends the File(s) in FormData, we push
 * the bytes to Supabase Storage and record a MediaAsset row.
 */

export type UploadResult =
  | { ok: true; assets: MediaDTO[] }
  | { ok: false; error: string };

export async function uploadMediaAction(formData: FormData): Promise<UploadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Dosya seçilmedi." };

  const assets: MediaDTO[] = [];
  try {
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const asset = await createMediaFromUpload({
        bytes,
        originalName: file.name,
        mime: file.type,
        userId: user.id,
      });
      assets.push(asset);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Yükleme başarısız." };
  }

  await logActivity({
    userId: user.id,
    action: "media.upload",
    entity: "media",
    summary: `${assets.length} görsel yüklendi`,
  });
  revalidatePath("/admin/media");
  return { ok: true, assets };
}

export async function deleteMediaAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = (formData.get("id") as string | null)?.trim();
  if (!id) return;

  await deleteMedia(id);
  await logActivity({
    userId: user.id,
    action: "media.delete",
    entity: "media",
    entityId: id,
    summary: "Görsel silindi",
  });
  revalidatePath("/admin/media");
}

export async function renameMediaAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = (formData.get("id") as string | null)?.trim();
  const name = (formData.get("name") as string | null)?.trim();
  if (!id || !name) return;

  await renameMedia(id, name);
  await logActivity({
    userId: user.id,
    action: "media.rename",
    entity: "media",
    entityId: id,
    summary: `Görsel adı değişti: ${name}`,
  });
  revalidatePath("/admin/media");
}
