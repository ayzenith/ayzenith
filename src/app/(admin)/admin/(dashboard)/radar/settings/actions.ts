"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { canManageSettings } from "@/lib/auth/roles";
import { logActivity } from "@/server/activity";
import { updateRadarSettings } from "@/server/radar/settings";
import { RADAR_CRITERIA, RADAR_CATEGORIES } from "@/config/radar";
import type { CertificationBurden, RadarWeights } from "@/config/radar";

/**
 * AYZENITH RADAR — settings actions.
 *
 * Weights are validated to sum to exactly 100 (server-side, non-negotiable).
 * Changing any setting only affects FUTURE analyses — every past snapshot froze
 * the weights it was scored with, so history is never rewritten here.
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !canManageSettings(user.role)) return null;
  return user;
}

const BURDENS = ["low", "medium", "high", "very-high"] as const;

export type RadarSettingsState = { error?: string; ok?: boolean };

export async function updateRadarSettingsAction(
  _prev: RadarSettingsState,
  formData: FormData,
): Promise<RadarSettingsState> {
  const user = await requireAdmin();
  if (!user) return { error: "Bu işlem için yetkiniz yok." };

  // Weights
  const weights = {} as RadarWeights;
  let sum = 0;
  for (const key of RADAR_CRITERIA) {
    const v = Number(formData.get(`w_${key}`));
    if (!Number.isFinite(v) || v < 0 || v > 100) return { error: "Ağırlıklar 0–100 arası olmalı." };
    weights[key] = Math.round(v);
    sum += weights[key];
  }
  if (sum !== 100) return { error: `Ağırlıkların toplamı 100 olmalı (şu an ${sum}).` };

  // Thresholds
  const worth = Number(formData.get("th_worth"));
  const monitor = Number(formData.get("th_monitor"));
  if (!Number.isFinite(worth) || !Number.isFinite(monitor)) return { error: "Karar eşikleri sayısal olmalı." };
  if (!(worth > monitor && monitor > 0 && worth <= 100)) {
    return { error: "Eşikler: 0 < İzlenmeli < Araştırmaya Değer ≤ 100 olmalı." };
  }

  // Alert + cache
  const alertThreshold = Number(formData.get("alertThreshold"));
  const cacheTtlDays = Number(formData.get("cacheTtlDays"));
  if (!Number.isFinite(alertThreshold) || alertThreshold < 1 || alertThreshold > 50) {
    return { error: "Uyarı eşiği 1–50 arası olmalı." };
  }
  if (!Number.isFinite(cacheTtlDays) || cacheTtlDays < 1 || cacheTtlDays > 365) {
    return { error: "Önbellek süresi 1–365 gün arası olmalı." };
  }

  // Certification burden per category
  const certificationBurden: Record<string, CertificationBurden> = {};
  for (const c of RADAR_CATEGORIES) {
    const raw = String(formData.get(`cert_${c.key}`) ?? "");
    const parsed = z.enum(BURDENS).safeParse(raw);
    if (parsed.success) certificationBurden[c.key] = parsed.data;
  }

  await updateRadarSettings({
    weights,
    thresholds: { worth: Math.round(worth), monitor: Math.round(monitor) },
    alertThreshold: Math.round(alertThreshold),
    cacheTtlDays: Math.round(cacheTtlDays),
    certificationBurden,
  });
  await logActivity({ userId: user.id, action: "radar.settings.update", entity: "radar", summary: "RADAR ayarları güncellendi" });
  revalidatePath("/admin/radar");
  return { ok: true };
}
