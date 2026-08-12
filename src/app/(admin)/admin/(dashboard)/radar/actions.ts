"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { canManageSettings } from "@/lib/auth/roles";
import { logActivity } from "@/server/activity";
import { RADAR_CATEGORIES } from "@/config/radar";
import { runAnalysis } from "@/server/radar/run";
import { matchVerifiedProducts, type HsMatch } from "@/server/radar/hs";
import { suggestHsForProduct, type HsSuggestion } from "@/server/radar/ai";
import { createWatch, removeWatch, refreshWatch } from "@/server/radar/watch";

/**
 * AYZENITH RADAR — UI actions.
 *
 * The ONLY bridge between the RADAR screens and the backend. Every action is
 * ADMIN-gated and delegates straight to the server pipeline (run/watch); the UI
 * never touches a provider, the database or the scoring engine directly, and it
 * never receives raw API payloads — only the computed, sourced result.
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !canManageSettings(user.role)) return null;
  return user;
}

function categoryLabel(key: string): string {
  return RADAR_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

// ---------------------------------------------------------------------------
// Start an analysis
// ---------------------------------------------------------------------------

const startSchema = z.object({
  categoryKey: z.string().trim().min(1),
  scope: z.enum(["country", "region"]),
  countryCode: z.string().trim().optional(),
  region: z.string().trim().optional(),
  supplyMarket: z.string().trim().default("TR"),
  tradeModel: z.string().trim().default("B2B"),
  analysisType: z.enum(["category", "product"]).default("category"),
  productName: z.string().trim().optional(),
  hsCode: z.string().trim().optional(),
});

export type StartState = {
  error?: string;
  snapshotId?: string;
  regionUrl?: string;
};

export async function startAnalysisAction(
  _prev: StartState,
  formData: FormData,
): Promise<StartState> {
  const user = await requireAdmin();
  if (!user) return { error: "Bu işlem için yetkiniz yok." };

  const parsed = startSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Form eksik veya hatalı." };
  const { categoryKey, scope, countryCode, region, supplyMarket, tradeModel, analysisType, productName, hsCode } = parsed.data;

  // Region scope → exploratory ranking page (no snapshots saved here; the owner
  // opens a country from the ranking to run a full, saved analysis). Product-scope
  // is always single-country, so region + product is not offered.
  if (scope === "region" && analysisType !== "product") {
    if (!region) return { error: "Lütfen bir bölge seçin." };
    const params = new URLSearchParams({ category: categoryKey, region, model: tradeModel || "B2B" });
    return { regionUrl: `/admin/radar/region?${params.toString()}` };
  }

  if (!countryCode) return { error: "Lütfen bir ülke seçin." };

  // Product scope requires a CONFIRMED verified HS-6 (chosen from the match list).
  if (analysisType === "product" && !hsCode) {
    return { error: "Spesifik ürün analizi için doğrulanmış bir HS-6 kodu seçin." };
  }

  try {
    const { snapshotId } = await runAnalysis({
      categoryKey,
      countryCode,
      geoScope: "country",
      supplyMarket: supplyMarket || "TR",
      tradeModel: tradeModel || "B2B",
      analysisType,
      productName: productName || undefined,
      hsCode: hsCode || undefined,
    });
    await logActivity({
      userId: user.id,
      action: "radar.analyze",
      entity: "radar",
      summary: `RADAR analizi: ${categoryLabel(categoryKey)} · ${countryCode}`,
    });
    revalidatePath("/admin/radar");
    return { snapshotId };
  } catch (e) {
    return { error: `Analiz çalıştırılamadı: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Product → HS matching (the specific-product flow). Step 1 of the product
// analysis: turn a typed product name into VERIFIED HS candidates the owner can
// pick from. If none match, the AI may SUGGEST codes — clearly advisory, never
// auto-analysed; the owner must add + verify them in HS Eşlemeleri first.
// ---------------------------------------------------------------------------

export type MatchState = {
  query?: string;
  matches?: HsMatch[];
  suggestions?: HsSuggestion[];
  aiNote?: string;
  error?: string;
};

export async function matchProductAction(
  _prev: MatchState,
  formData: FormData,
): Promise<MatchState> {
  const user = await requireAdmin();
  if (!user) return { error: "Bu işlem için yetkiniz yok." };

  const query = String(formData.get("productQuery") ?? "").trim();
  if (!query) return { error: "Lütfen bir ürün adı yazın." };

  const matches = await matchVerifiedProducts(query);
  if (matches.length > 0) {
    return { query, matches };
  }

  // No verified match → advisory AI suggestion (must be verified before use).
  const { suggestions, disabledReason } = await suggestHsForProduct(query);
  return {
    query,
    matches: [],
    suggestions,
    aiNote:
      disabledReason ??
      "Doğrulanmış eşleşme bulunamadı. Aşağıdakiler AI önerisidir — analize girmeden önce HS Eşlemeleri'nde eklenip doğrulanmalıdır.",
  };
}

/**
 * Run a full, saved single-country analysis and go straight to its result.
 * Used by the region ranking rows ("Tam analiz"). Delegates to the same
 * pipeline as everything else.
 */
export async function analyzeCountryAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const categoryKey = String(formData.get("categoryKey") ?? "");
  const countryCode = String(formData.get("countryCode") ?? "");
  const tradeModel = String(formData.get("tradeModel") ?? "B2B") || "B2B";
  if (!categoryKey || !countryCode) return;

  const { snapshotId } = await runAnalysis({
    categoryKey,
    countryCode,
    geoScope: "country",
    tradeModel,
  });
  await logActivity({
    userId: user.id,
    action: "radar.analyze",
    entity: "radar",
    summary: `RADAR analizi: ${categoryLabel(categoryKey)} · ${countryCode}`,
  });
  revalidatePath("/admin/radar");
  redirect(`/admin/radar/analysis/${snapshotId}`);
}

// ---------------------------------------------------------------------------
// Watch management
// ---------------------------------------------------------------------------

export type WatchState = { error?: string; ok?: boolean };

export async function addWatchAction(
  _prev: WatchState,
  formData: FormData,
): Promise<WatchState> {
  const user = await requireAdmin();
  if (!user) return { error: "Bu işlem için yetkiniz yok." };

  const categoryKey = String(formData.get("categoryKey") ?? "");
  const countryCode = String(formData.get("countryCode") ?? "");
  if (!categoryKey || !countryCode) return { error: "Kategori/ülke eksik." };

  await createWatch(categoryKey, countryCode, categoryLabel(categoryKey));
  await logActivity({
    userId: user.id,
    action: "radar.watch.add",
    entity: "radar",
    summary: `Takibe alındı: ${categoryLabel(categoryKey)} · ${countryCode}`,
  });
  revalidatePath("/admin/radar");
  return { ok: true };
}

export async function removeWatchAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await removeWatch(id);
  revalidatePath("/admin/radar");
}

export async function refreshWatchAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await refreshWatch(id);
    await logActivity({
      userId: user.id,
      action: "radar.watch.refresh",
      entity: "radar",
      summary: "Takip yenilendi",
    });
  } catch {
    // Surfaced on next page load; a failed refresh must not crash the action.
  }
  revalidatePath("/admin/radar");
}
