"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { canManageSettings } from "@/lib/auth/roles";
import { logActivity } from "@/server/activity";
import { runDiscovery } from "@/server/leads/run";
import { verifyPendingBatch } from "@/server/leads/reverify";
import { COUNTRY_LABELS } from "@/config/leads";

/**
 * AYZENITH LEAD FINDER — UI actions.
 *
 * The ONLY bridge between the Lead Finder screens and the backend pipeline. Every
 * action is ADMIN-gated (mirrors RADAR) and delegates straight to the server
 * pipeline; the UI never touches a provider, the database or the scoring engine
 * directly, and never receives raw source payloads — only the saved search id.
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !canManageSettings(user.role)) return null;
  return user;
}

const startSchema = z.object({
  countryCode: z.string().trim().min(2),
  city: z.string().trim().optional(),
  productQuery: z.string().trim().min(2),
  businessModel: z.enum(["B2B", "B2C"]).default("B2B"),
  leadTypes: z.string().trim().optional(), // comma-separated role keys ("" = all)
  // RADAR linkage (§2) — optional; present only when opened from an analysis.
  radarSnapshotId: z.string().trim().optional(),
  categoryKey: z.string().trim().optional(),
  hs6: z.string().trim().optional(),
  radarScore: z.string().trim().optional(),
  radarDecision: z.string().trim().optional(),
});

export type StartSearchState = { error?: string; searchId?: string };

export async function startSearchAction(
  _prev: StartSearchState,
  formData: FormData,
): Promise<StartSearchState> {
  const user = await requireAdmin();
  if (!user) return { error: "Bu işlem için yetkiniz yok." };

  const parsed = startSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Form eksik veya hatalı. Lütfen ülke ve ürün alanlarını doldurun." };
  }
  const d = parsed.data;
  const countryIso = d.countryCode.toUpperCase();
  if (!COUNTRY_LABELS[countryIso]) {
    return { error: "Desteklenmeyen ülke kodu." };
  }

  const leadTypes = (d.leadTypes ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const { searchId, discovered } = await runDiscovery({
      countryIso,
      city: d.city || undefined,
      productQuery: d.productQuery,
      businessModel: d.businessModel,
      leadTypes,
      radarSnapshotId: d.radarSnapshotId || null,
      categoryKey: d.categoryKey || null,
      hs6: d.hs6 || null,
      radarScore: d.radarScore ? Number(d.radarScore) : null,
      radarDecision: d.radarDecision || null,
      createdById: user.id,
    });

    await logActivity({
      userId: user.id,
      action: "lead.discover",
      entity: "lead",
      summary: `Lead araması: ${d.productQuery} · ${COUNTRY_LABELS[countryIso]} (${discovered} aday)`,
    });
    revalidatePath("/admin/lead-finder");
    return { searchId };
  } catch (e) {
    return { error: `Arama çalıştırılamadı: ${(e as Error).message}` };
  }
}

/**
 * Verify the next batch of firms a search never got to (§V3.4).
 *
 * Discovery stops reading websites once it hits its request budget, so a large
 * search ends with most firms marked "kontrol edilmedi". This lets the owner
 * push that forward from the results screen instead of waiting for the hourly
 * cron. It only ever reads sites already on file — it never re-discovers.
 */
export type ContinueVerifyState = {
  error?: string;
  attempted?: number;
  reachable?: number;
  remaining?: number;
};

export async function continueVerificationAction(
  _prev: ContinueVerifyState,
  formData: FormData,
): Promise<ContinueVerifyState> {
  const user = await requireAdmin();
  if (!user) return { error: "Bu işlem için yetkiniz yok." };

  const searchId = String(formData.get("searchId") ?? "").trim();
  if (!searchId) return { error: "Arama bulunamadı." };

  try {
    const r = await verifyPendingBatch(searchId);
    revalidatePath(`/admin/lead-finder/${searchId}`);
    return { attempted: r.attempted, reachable: r.reachable, remaining: r.remaining };
  } catch (e) {
    return { error: `Doğrulama sürdürülemedi: ${(e as Error).message}` };
  }
}
