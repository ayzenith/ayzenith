"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import { logActivity } from "@/server/activity";
import { saveOverride, CONTENT_TAG } from "@/server/content";

/**
 * Content-editor mutation. Saves one leaf's three languages (empty = fall back
 * to default), busts the content cache tag and refreshes the public tree so the
 * edit shows across the site immediately.
 */
export type ContentSaveResult = { ok: boolean; error?: string };

export async function saveContentAction(formData: FormData): Promise<ContentSaveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Oturum bulunamadı." };

  const key = (formData.get("key") as string | null)?.trim();
  if (!key) return { ok: false, error: "Geçersiz alan." };

  const values = {
    en: (formData.get("en") as string | null) ?? "",
    tr: (formData.get("tr") as string | null) ?? "",
    de: (formData.get("de") as string | null) ?? "",
  };

  try {
    await saveOverride(key, values);
  } catch {
    return { ok: false, error: "Kaydedilemedi. Lütfen tekrar deneyin." };
  }

  await logActivity({
    userId: user.id,
    action: "content.update",
    entity: "content",
    entityId: key,
    summary: `Metin güncellendi: ${key}`,
  });

  revalidateTag(CONTENT_TAG);
  revalidatePath("/", "layout");
  return { ok: true };
}
