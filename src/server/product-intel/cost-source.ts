/**
 * PRODUCT INTELLIGENCE — which cost is the real one (pure: no DB, no network).
 *
 * WHY THIS IS ITS OWN FILE
 *
 * This module runs BEFORE a product is sold, and usually before it is even
 * bought. At that moment the thing every other part of Business OS relies on —
 * `ItemCostState.avgUnitCost`, the moving weighted average — does not exist
 * yet: there are no movements to average. A price screen that quietly invented
 * a cost at that point would be worse than useless, because every band, margin
 * and break-even below it would inherit the invention.
 *
 * So the cost basis is chosen by an explicit, ordered rule and the choice is
 * carried, named, all the way to the screen:
 *
 *   1. ItemCostState.avgUnitCost  — the product has been bought. Real.
 *   2. ImportCase.landedCost      — not bought yet, but a landed-cost case
 *                                   computed duty, freight and taxes. Real
 *                                   arithmetic on real rates.
 *   3. A cost the user typed      — an ASSUMPTION, and labelled as one on
 *                                   every screen it touches.
 *   4. Nothing                    — no price advice at all. No fallback number
 *                                   is ever produced.
 *
 * The cost engine is never bypassed and never re-implemented here: this file
 * only SELECTS between values other modules computed.
 */

import type { Provenance } from "./types";

export type CostSourceKind = "AVERAGE_COST" | "LANDED_COST" | "USER_ASSUMPTION" | "NONE";

export const COST_SOURCE_LABELS: Record<CostSourceKind, string> = {
  AVERAGE_COST: "Hareketli ortalama maliyet",
  LANDED_COST: "İthalat iniş maliyeti",
  USER_ASSUMPTION: "Kullanıcı varsayımı",
  NONE: "Maliyet yok",
};

export type CostBasis = {
  kind: CostSourceKind;
  /** The figure every downstream computation uses, in BASE currency. Null means
   *  no price advice can be given — not zero, not a guess. */
  unitCost: number | null;
  /** Present when the source gives a band rather than a point. `unitCost` is
   *  then the UPPER end: a break-even price must not be optimistic. */
  range: { min: number; max: number } | null;
  currency: string;
  provenance: Provenance;
  label: string;
  note: string;
  /** True only for kind USER_ASSUMPTION. The UI keys its warning off this. */
  isAssumption: boolean;
  warnings: string[];
};

export type AverageCostInput = {
  avgUnitCost: number | null;
  onHand: number;
  /** Units on hand whose cost was never known. A non-zero value means the
   *  average describes only part of the stock, which the operator must know. */
  uncostedQty: number;
};

export type LandedCostInput = {
  perUnitMin: number | null;
  perUnitMax: number | null;
  completeness: "COMPLETE" | "PARTIAL";
  missing: string[];
  unchecked: string[];
};

export type CostBasisInput = {
  averageCost: AverageCostInput | null;
  landed: LandedCostInput | null;
  userUnitCost: number | null;
  baseCurrency: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function resolveCostBasis(input: CostBasisInput): CostBasis {
  const currency = input.baseCurrency;

  // 1 — the real, ledger-checked average.
  const avg = input.averageCost;
  if (avg && avg.avgUnitCost != null && avg.avgUnitCost > 0) {
    const warnings: string[] = [];
    if (avg.uncostedQty > 0) {
      warnings.push(
        `Stoktaki ${avg.uncostedQty} birimin maliyeti hiç bilinmiyor; ortalama yalnızca maliyeti bilinen kısmı temsil ediyor.`,
      );
    }
    if (avg.onHand <= 0) {
      warnings.push("Stok sıfır veya negatif; ortalama son hareketten kalan değerdir.");
    }
    return {
      kind: "AVERAGE_COST",
      unitCost: r2(avg.avgUnitCost),
      range: null,
      currency,
      provenance: "CALCULATED",
      label: COST_SOURCE_LABELS.AVERAGE_COST,
      note: "Stok defterinden hesaplanan SKU bazlı hareketli ağırlıklı ortalama.",
      isAssumption: false,
      warnings,
    };
  }

  // 2 — a landed-cost case: duty, freight and taxes already computed.
  const landed = input.landed;
  if (landed && (landed.perUnitMax != null || landed.perUnitMin != null)) {
    const min = landed.perUnitMin ?? landed.perUnitMax!;
    const max = landed.perUnitMax ?? landed.perUnitMin!;
    const warnings: string[] = [];
    if (landed.completeness === "PARTIAL") {
      const missing = [...landed.missing, ...landed.unchecked].filter(Boolean);
      warnings.push(
        missing.length > 0
          ? `İniş maliyeti eksik kalemler içeriyor: ${missing.join(", ")}. Gerçek maliyet bundan yüksek olabilir.`
          : "İniş maliyeti eksik kalemler içeriyor; gerçek maliyet bundan yüksek olabilir.",
      );
    }
    if (max > min) {
      warnings.push(`İniş maliyeti bir bant (${r2(min)}–${r2(max)} ${currency}); hesaplarda üst uç kullanıldı.`);
    }
    return {
      kind: "LANDED_COST",
      unitCost: r2(max),
      range: max > min ? { min: r2(min), max: r2(max) } : null,
      currency,
      provenance: "CALCULATED",
      label: COST_SOURCE_LABELS.LANDED_COST,
      note: "İthalat analizinden birim iniş maliyeti (ürün bedeli + vergiler + navlun).",
      isAssumption: false,
      warnings,
    };
  }

  // 3 — the operator's own figure. Usable, but never dressed up as measured.
  if (input.userUnitCost != null && input.userUnitCost > 0) {
    return {
      kind: "USER_ASSUMPTION",
      unitCost: r2(input.userUnitCost),
      range: null,
      currency,
      provenance: "USER_ENTERED",
      label: COST_SOURCE_LABELS.USER_ASSUMPTION,
      note: "Elle girilen hedef alış maliyeti. Ölçülmedi — varsayımdır.",
      isAssumption: true,
      warnings: ["Bu maliyet ölçülmedi. Aşağıdaki tüm fiyat ve marj sonuçları bu varsayıma bağlıdır."],
    };
  }

  // 4 — nothing. Say so; never substitute a number.
  return {
    kind: "NONE",
    unitCost: null,
    range: null,
    currency,
    provenance: "UNKNOWN",
    label: COST_SOURCE_LABELS.NONE,
    note: "Bu ürün için ne ortalama maliyet, ne iniş maliyeti, ne de girilmiş bir maliyet var.",
    isAssumption: false,
    warnings: ["Maliyet bilinmiyor; fiyat stratejisi hesaplanamaz. Ürünü bir alışa veya ithalat analizine bağlayın ya da hedef alış maliyetini girin."],
  };
}
