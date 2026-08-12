"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import { logActivity } from "@/server/activity";
import { saveAssetOverride, ASSET_TAG } from "@/server/assets";
import { EDITABLE_ASSET_KEYS } from "@/config/asset-schema";
import type { AssetKey } from "@/config/assets";

/**
 * Image-slot mutation for the "Görseller" panel. Sets (or clears, when url is
 * empty) one semantic asset's override, busts the asset cache tag and refreshes
 * the public tree so the new image shows across the site immediately.
 */
export type AssetSaveResult = { ok: boolean; error?: string };

export async function saveAssetAction(formData: FormData): Promise<AssetSaveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Oturum bulunamadı." };

  const key = (formData.get("key") as string | null)?.trim();
  if (!key || !EDITABLE_ASSET_KEYS.includes(key as AssetKey)) {
    return { ok: false, error: "Geçersiz görsel alanı." };
  }
  const url = (formData.get("url") as string | null)?.trim() ?? "";

  try {
    await saveAssetOverride(key as AssetKey, url);
  } catch {
    return { ok: false, error: "Kaydedilemedi. Lütfen tekrar deneyin." };
  }

  await logActivity({
    userId: user.id,
    action: "asset.update",
    entity: "asset",
    entityId: key,
    summary: url ? `Görsel değiştirildi: ${key}` : `Görsel orijinaline döndürüldü: ${key}`,
  });

  revalidateTag(ASSET_TAG);
  revalidatePath("/", "layout");
  return { ok: true };
}
