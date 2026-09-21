/**
 * IMPORT INTELLIGENCE — landed cost and margin (pure).
 *
 * PRODUCT + FREIGHT + INSURANCE + CUSTOMS DUTY + ADDITIONAL DUTIES + OTHER
 * TAXES + BROKER + HANDLING + OTHER, every line tagged USER_ENTERED /
 * OFFICIAL / CALCULATED / ESTIMATED / UNKNOWN. An unknown line is never
 * replaced with a guess: the total becomes PARTIAL and names what is missing.
 * A freight ESTIMATE is only ever a Logistics Intelligence band built from real
 * observations — never a market reference (architecture freeze, 2026-08-24).
 * Import VAT is shown beside the total, not in it: a VAT-registered importer
 * deducts it, so it is cash out and back, not cost.
 */

import type { TaxResult } from "./tax";
import { toBase, type CostInput, type FxTable } from "./tax";
import type { CostValueStatus } from "./types";

export type LandedLine = {
  key: string;
  label: string;
  min: number | null;
  max: number | null;
  status: CostValueStatus;
  note: string;
  /** True when the amount is unknown because a SOURCE is not loaded (ÖTV,
   *  gözetim), not because the user left a field empty. The total is still
   *  given, with these lines named as excluded — the two kinds of "unknown"
   *  must not be mixed. */
  unchecked?: boolean;
};

export type LandedCost = {
  lines: LandedLine[];
  totalMin: number | null;
  totalMax: number | null;
  knownTotal: number;
  completeness: "COMPLETE" | "PARTIAL";
  missing: string[];
  unchecked: string[];
  quantity: number | null;
  perUnitMin: number | null;
  perUnitMax: number | null;
  vatCash: { amount: number | null; lowerBound: number | null; note: string };
  margin: { salePrice: number | null; salePriceBase: number | null; marginMinPct: number | null; marginMaxPct: number | null; status: string } | null;
  baseCurrency: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function costLine(key: string, label: string, c: CostInput, fx: FxTable, base: string, includedNote: string | null): LandedLine {
  if (includedNote) return { key, label, min: 0, max: 0, status: "CALCULATED", note: includedNote };
  if (c.status === "ESTIMATED" && c.min != null && c.max != null) {
    const lo = toBase(c.min, c.currency, fx, base);
    const hi = toBase(c.max, c.currency, fx, base);
    if (lo != null && hi != null) return { key, label, min: r2(lo), max: r2(hi), status: "ESTIMATED", note: c.note ?? "Tahmini bant" };
  }
  const v = toBase(c.amount, c.currency, fx, base);
  if (v == null) return { key, label, min: null, max: null, status: "UNKNOWN", note: c.amount == null ? c.note ?? "VERİ YETERSİZ" : `${c.currency} kuru yok` };
  return { key, label, min: r2(v), max: r2(v), status: c.status, note: c.note ?? "" };
}

export function computeLandedCost(input: {
  quantity: number | null;
  unitPrice: number | null;
  currency: string;
  incoterm: string | null;
  freight: CostInput;
  insurance: CostInput;
  broker: CostInput;
  handling: CostInput;
  other: CostInput;
  tax: TaxResult;
  fx: FxTable;
  baseCurrency: string;
  salePrice: { amount: number | null; currency: string } | null;
}): LandedCost {
  const base = input.baseCurrency;
  const lines: LandedLine[] = [];
  const goodsAmount = input.quantity != null && input.unitPrice != null ? input.quantity * input.unitPrice : null;
  lines.push(costLine("GOODS", "Ürün bedeli", { amount: goodsAmount, currency: input.currency, status: "USER_ENTERED", note: goodsAmount == null ? "Adet veya birim fiyat girilmedi" : `${input.quantity} × ${input.unitPrice} ${input.currency}` }, input.fx, base, null));

  const inc = (input.incoterm ?? "").toUpperCase();
  const freightIncluded = ["CFR", "CPT", "CIF", "CIP", "DAP", "DPU", "DDP"].includes(inc) ? `${inc}: ürün bedeline dahil` : null;
  const insuranceIncluded = ["CIF", "CIP", "DAP", "DPU", "DDP"].includes(inc) ? `${inc}: ürün bedeline dahil` : null;
  lines.push(costLine("FREIGHT", "Navlun", input.freight, input.fx, base, freightIncluded));
  lines.push(costLine("INSURANCE", "Sigorta", input.insurance, input.fx, base, insuranceIncluded));

  for (const t of input.tax.lines) {
    if (!t.inLandedCost) continue;
    if (t.status === "NOT_APPLICABLE") {
      lines.push({ key: t.key, label: t.label, min: 0, max: 0, status: "OFFICIAL", note: "Uygulanmaz" });
      continue;
    }
    if (t.status === "NOT_CHECKED") {
      lines.push({ key: t.key, label: t.label, min: null, max: null, status: "UNKNOWN", note: "Kontrol edilmedi — kaynak yüklenmedi", unchecked: true });
      continue;
    }
    if (t.amount != null) {
      lines.push({ key: t.key, label: t.label, min: t.amount, max: t.amount, status: "CALCULATED", note: t.ratePct != null ? `%${t.ratePct} × gümrük kıymeti` : "" });
    } else {
      lines.push({ key: t.key, label: t.label, min: null, max: null, status: "UNKNOWN", note: t.lowerBound != null ? `En az ${t.lowerBound.toLocaleString("tr-TR")} ${base} (navlun/sigorta hariç kıymetle)` : "VERİ YETERSİZ" });
    }
  }
  lines.push(costLine("BROKER", "Gümrük müşaviri", input.broker, input.fx, base, null));
  lines.push(costLine("HANDLING", "Liman / ardiye / elleçleme", input.handling, input.fx, base, null));
  // "Diğer masraflar" empty means there are no others — the field is the place
  // to name anything else, so an empty one is a statement, not a gap.
  lines.push(
    input.other.amount == null
      ? { key: "OTHER", label: "Diğer masraflar", min: 0, max: 0, status: "USER_ENTERED" as const, note: "Girilmedi — 0 kabul edildi" }
      : costLine("OTHER", "Diğer masraflar", input.other, input.fx, base, null),
  );

  const missing = lines.filter((l) => l.min == null && !l.unchecked).map((l) => l.label);
  const unchecked = lines.filter((l) => l.unchecked).map((l) => l.label);
  const knownTotal = r2(lines.reduce((s, l) => s + (l.min ?? 0), 0));
  const computable = missing.length === 0;
  const complete = computable && unchecked.length === 0;
  const totalMin = computable ? r2(lines.reduce((s, l) => s + (l.min ?? 0), 0)) : null;
  const totalMax = computable ? r2(lines.reduce((s, l) => s + (l.max ?? 0), 0)) : null;
  const q = input.quantity && input.quantity > 0 ? input.quantity : null;

  let margin: LandedCost["margin"] = null;
  if (input.salePrice && input.salePrice.amount != null) {
    const sp = toBase(input.salePrice.amount, input.salePrice.currency, input.fx, base);
    if (sp == null) margin = { salePrice: input.salePrice.amount, salePriceBase: null, marginMinPct: null, marginMaxPct: null, status: `${input.salePrice.currency} kuru yok` };
    else if (!q || totalMin == null || totalMax == null) margin = { salePrice: input.salePrice.amount, salePriceBase: r2(sp), marginMinPct: null, marginMaxPct: null, status: "Landed cost eksik — marj hesaplanamadı" };
    else {
      const worst = ((sp - totalMax / q) / sp) * 100;
      const best = ((sp - totalMin / q) / sp) * 100;
      margin = { salePrice: input.salePrice.amount, salePriceBase: r2(sp), marginMinPct: Math.round(worst * 10) / 10, marginMaxPct: Math.round(best * 10) / 10, status: "HESAPLANDI" };
    }
  }

  return {
    lines,
    totalMin,
    totalMax,
    knownTotal,
    completeness: complete ? "COMPLETE" : "PARTIAL",
    missing,
    unchecked,
    quantity: q,
    perUnitMin: totalMin != null && q ? r2(totalMin / q) : null,
    perUnitMax: totalMax != null && q ? r2(totalMax / q) : null,
    vatCash: { amount: input.tax.vat.amount, lowerBound: input.tax.vat.lowerBound, note: "İthalat KDV'si — indirilebilir, maliyete dahil edilmedi" },
    margin,
    baseCurrency: base,
  };
}
