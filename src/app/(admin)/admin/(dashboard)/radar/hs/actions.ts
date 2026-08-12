"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { canManageSettings } from "@/lib/auth/roles";
import { logActivity } from "@/server/activity";
import {
  createHsMapping,
  updateHsMapping,
  deleteHsMapping,
  seedHsMappings,
} from "@/server/radar/hs";

/**
 * AYZENITH RADAR — HS mapping editor actions (Admin → Radar → HS Eşlemeleri).
 *
 * The owner is the source of truth for what is VERIFIED. A code marked
 * NEEDS_REVIEW never enters scoring (enforced in the repository), so the editor
 * can safely hold uncertain codes without corrupting any analysis.
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !canManageSettings(user.role)) return null;
  return user;
}

const mappingSchema = z.object({
  categoryKey: z.string().trim().min(1),
  hs6: z.string().trim().regex(/^\d{6}$/, "HS kodu tam 6 haneli olmalı."),
  productGroup: z.string().trim().min(2, "Ürün grubu adı girin.").max(120),
  verification: z.enum(["VERIFIED", "NEEDS_REVIEW"]),
  source: z.string().trim().max(200).optional().or(z.literal("")),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export type HsFormState = { error?: string; ok?: boolean };

export async function createHsMappingAction(
  _prev: HsFormState,
  formData: FormData,
): Promise<HsFormState> {
  const user = await requireAdmin();
  if (!user) return { error: "Bu işlem için yetkiniz yok." };

  const parsed = mappingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Form hatalı." };

  try {
    await createHsMapping({
      categoryKey: parsed.data.categoryKey,
      hs6: parsed.data.hs6,
      productGroup: parsed.data.productGroup,
      verification: parsed.data.verification,
      source: parsed.data.source || null,
      note: parsed.data.note || null,
    });
  } catch {
    return { error: "Bu kod bu kategoride zaten var olabilir." };
  }
  await logActivity({ userId: user.id, action: "radar.hs.create", entity: "radar", summary: `HS eklendi: ${parsed.data.hs6}` });
  revalidatePath("/admin/radar/hs");
  return { ok: true };
}

export async function updateHsMappingAction(
  _prev: HsFormState,
  formData: FormData,
): Promise<HsFormState> {
  const user = await requireAdmin();
  if (!user) return { error: "Bu işlem için yetkiniz yok." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Kayıt bulunamadı." };
  const parsed = mappingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Form hatalı." };

  await updateHsMapping(id, {
    hs6: parsed.data.hs6,
    productGroup: parsed.data.productGroup,
    verification: parsed.data.verification,
    source: parsed.data.source || null,
    note: parsed.data.note || null,
  });
  await logActivity({ userId: user.id, action: "radar.hs.update", entity: "radar", summary: `HS güncellendi: ${parsed.data.hs6}` });
  revalidatePath("/admin/radar/hs");
  return { ok: true };
}

export async function deleteHsMappingAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteHsMapping(id);
  await logActivity({ userId: user.id, action: "radar.hs.delete", entity: "radar", summary: "HS silindi" });
  revalidatePath("/admin/radar/hs");
}

export async function seedHsAction(): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const res = await seedHsMappings();
  await logActivity({ userId: user.id, action: "radar.hs.seed", entity: "radar", summary: `HS tohumlandı: ${res.created} eklendi` });
  revalidatePath("/admin/radar/hs");
}
