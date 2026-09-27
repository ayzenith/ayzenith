/**
 * PRODUCT INTELLIGENCE — price strategy (pure: no DB, no network).
 *
 * THE MODEL, STATED ONCE SO NOTHING BELOW IS A BLACK BOX
 *
 * `P` is the price the customer sees on the marketplace: VAT INCLUDED. Every
 * cost input is the VAT-excluded amount the seller actually bears. With
 * `v = 1 + vat/100` and `c = commission/100`:
 *
 *   netRevenue = P / v                       what is left after VAT
 *   commission = P * c        (GROSS base)   Turkish marketplaces bill on the
 *              = (P / v) * c  (NET base)     shown price; declared per channel
 *   returnCost = returnRate * (shipping * 2 + packaging)
 *                                            a returned unit costs the leg out,
 *                                            the leg back and the box. The
 *                                            GOODS are not lost — they come
 *                                            back and are sold again — so COGS
 *                                            is deliberately NOT in this term.
 *   fixed      = cost + shipping + packaging + returnCost
 *   profit(P)  = netRevenue - commission - fixed
 *   margin(P)  = profit / netRevenue
 *
 * Break-even (profit = 0) and target-margin prices are the closed-form
 * solutions of that equation, not a search. Where the denominator is zero or
 * negative — commission alone eats the whole net — there IS no profitable
 * price, and the result says so rather than returning a huge number.
 *
 * Nothing here decides a price. It draws the four bands and lets the operator
 * see where the market sits against their own cost. No automatic repricing.
 */

import type { CommissionBase } from "@/config/product-intel";
import type { CostBasis } from "./cost-source";

export type PriceBand = "RED" | "YELLOW" | "GREEN" | "GRAY";

export const PRICE_BAND_LABELS: Record<PriceBand, string> = {
  RED: "Zarar",
  YELLOW: "Kârlı ama hedefin altında",
  GREEN: "Hedef marj bölgesi",
  GRAY: "Pazar aralığının üzerinde",
};

export const PRICE_BAND_DESCRIPTIONS: Record<PriceBand, string> = {
  RED: "Minimum kârlı fiyatın altında — her satış zarar yazar.",
  YELLOW: "Masrafları karşılıyor, hedeflediğin marja ulaşmıyor.",
  GREEN: "Hedef marjı karşılıyor ve gözlenen pazar aralığının içinde.",
  GRAY: "Taranan ilanların en yükseğinin üzerinde — satış hacmi riski.",
};

export type PriceStatus = "OK" | "NO_COST" | "IMPOSSIBLE";

export type PriceInputs = {
  /** Per unit, base currency, VAT excluded. */
  shipping: number;
  packaging: number;
  /** Percent, e.g. 5 means 5% of units come back. */
  returnRatePct: number;
  /** Percent, e.g. 20. */
  vatRatePct: number;
  /** Percent, e.g. 21.5 — from Channel.commissionRate. */
  commissionPct: number;
  commissionBase: CommissionBase;
  /** Percent of net revenue the operator wants to keep. */
  targetMarginPct: number;
};

export type PriceScenario = {
  key: string;
  label: string;
  price: number;
  netRevenue: number;
  commission: number;
  profit: number;
  marginPct: number;
  band: PriceBand;
};

export type BandRange = { band: PriceBand; from: number | null; to: number | null; label: string; description: string };

export type PriceStrategy = {
  status: PriceStatus;
  costBasis: CostBasis;
  inputs: PriceInputs;
  /** Per-unit cost terms, spelled out so the total can be checked by hand. */
  breakdown: Array<{ key: string; label: string; amount: number; note: string }>;
  fixedPerUnit: number | null;
  minProfitablePrice: number | null;
  targetPrice: number | null;
  /** Highest price observed among the scanned offers. Null with no market data,
   *  and then there is no GRAY band — we do not invent a ceiling. */
  marketCeiling: number | null;
  marketFloor: number | null;
  bands: BandRange[];
  scenarios: PriceScenario[];
  notes: string[];
  warnings: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export type MarketAnchor = { key: string; label: string; price: number };

/** Everything the profit equation needs, derived once. */
function terms(inputs: PriceInputs) {
  const v = 1 + inputs.vatRatePct / 100;
  const c = inputs.commissionPct / 100;
  const m = inputs.targetMarginPct / 100;
  return { v, c, m };
}

export function profitAtPrice(price: number, fixedPerUnit: number, inputs: PriceInputs): { netRevenue: number; commission: number; profit: number; marginPct: number } {
  const { v, c } = terms(inputs);
  const netRevenue = price / v;
  const commission = inputs.commissionBase === "GROSS" ? price * c : netRevenue * c;
  const profit = netRevenue - commission - fixedPerUnit;
  const marginPct = netRevenue === 0 ? 0 : (profit / netRevenue) * 100;
  return { netRevenue: r2(netRevenue), commission: r2(commission), profit: r2(profit), marginPct: Math.round(marginPct * 10) / 10 };
}

/** Price at which profit is exactly `marginFraction` of net revenue. */
function priceForMargin(fixedPerUnit: number, inputs: PriceInputs, marginFraction: number): number | null {
  const { v, c } = terms(inputs);
  const denom = inputs.commissionBase === "GROSS" ? (1 - marginFraction) / v - c : (1 - marginFraction - c) / v;
  if (!(denom > 0)) return null;
  return r2(fixedPerUnit / denom);
}

export function classifyPrice(
  price: number,
  minProfitable: number | null,
  target: number | null,
  ceiling: number | null,
): PriceBand {
  if (ceiling != null && price > ceiling) return "GRAY";
  if (minProfitable != null && price < minProfitable) return "RED";
  if (target != null && price < target) return "YELLOW";
  return "GREEN";
}

export function computePriceStrategy(args: {
  costBasis: CostBasis;
  inputs: PriceInputs;
  /** Prices observed in the scanned market, unsorted, already in base currency. */
  marketPrices: number[];
  /** Named market points to show as scenarios (median, quartiles…). */
  marketAnchors: MarketAnchor[];
}): PriceStrategy {
  const { costBasis, inputs } = args;
  const notes: string[] = [];
  const warnings: string[] = [...costBasis.warnings];

  const prices = args.marketPrices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  const marketFloor = prices.length > 0 ? r2(prices[0]!) : null;
  const marketCeiling = prices.length > 0 ? r2(prices[prices.length - 1]!) : null;
  if (marketCeiling == null) {
    notes.push("Rakip fiyatı girilmediği için pazar tavanı ve GRİ bant hesaplanmadı.");
  }

  // No cost means no price advice. This is the whole point of cost-source.ts.
  if (costBasis.unitCost == null) {
    return {
      status: "NO_COST",
      costBasis,
      inputs,
      breakdown: [],
      fixedPerUnit: null,
      minProfitablePrice: null,
      targetPrice: null,
      marketCeiling,
      marketFloor,
      bands: [],
      scenarios: [],
      notes,
      warnings,
    };
  }

  const returnCost = (inputs.returnRatePct / 100) * (inputs.shipping * 2 + inputs.packaging);
  const breakdown = [
    { key: "COGS", label: "Birim maliyet", amount: r2(costBasis.unitCost), note: costBasis.label },
    { key: "SHIPPING", label: "Kargo", amount: r2(inputs.shipping), note: "Birim başına, KDV hariç" },
    { key: "PACKAGING", label: "Paketleme", amount: r2(inputs.packaging), note: "Birim başına, KDV hariç" },
    {
      key: "RETURN",
      label: "İade karşılığı",
      amount: r2(returnCost),
      note: `%${inputs.returnRatePct} iade × (kargo × 2 + paketleme). Ürün geri geldiği için maliyeti dahil değil.`,
    },
  ];
  const fixedPerUnit = r2(breakdown.reduce((s, b) => s + b.amount, 0));

  const minProfitablePrice = priceForMargin(fixedPerUnit, inputs, 0);
  const targetPrice = priceForMargin(fixedPerUnit, inputs, inputs.targetMarginPct / 100);

  if (minProfitablePrice == null) {
    warnings.push(
      `Bu kanalda kârlı bir fiyat yok: %${inputs.commissionPct} komisyon, %${inputs.vatRatePct} KDV sonrası kalan net gelirin tamamını alıyor. Komisyon veya KDV oranını kontrol edin.`,
    );
    return {
      status: "IMPOSSIBLE",
      costBasis,
      inputs,
      breakdown,
      fixedPerUnit,
      minProfitablePrice: null,
      targetPrice: null,
      marketCeiling,
      marketFloor,
      bands: [],
      scenarios: [],
      notes,
      warnings,
    };
  }

  if (targetPrice == null) {
    warnings.push(
      `%${inputs.targetMarginPct} hedef marj bu komisyon ve KDV oranlarıyla matematiksel olarak ulaşılamıyor; yalnızca başabaş fiyat gösteriliyor.`,
    );
  }
  if (targetPrice != null && marketCeiling != null && targetPrice > marketCeiling) {
    warnings.push(
      `Hedef marj fiyatın (${targetPrice}) taranan en yüksek rakip fiyatının (${marketCeiling}) üzerinde. Bu ürün bu maliyet yapısıyla bu pazarda hedeflenen marjla rekabet edemiyor olabilir.`,
    );
  }
  if (minProfitablePrice != null && marketCeiling != null && minProfitablePrice > marketCeiling) {
    warnings.push(
      `Başabaş fiyat (${minProfitablePrice}) taranan tüm rakip fiyatlarının üzerinde — bu maliyetle bu pazarda kârlı satış görünmüyor.`,
    );
  }

  const bands: BandRange[] = [
    { band: "RED", from: null, to: minProfitablePrice, label: PRICE_BAND_LABELS.RED, description: PRICE_BAND_DESCRIPTIONS.RED },
    { band: "YELLOW", from: minProfitablePrice, to: targetPrice, label: PRICE_BAND_LABELS.YELLOW, description: PRICE_BAND_DESCRIPTIONS.YELLOW },
    { band: "GREEN", from: targetPrice ?? minProfitablePrice, to: marketCeiling, label: PRICE_BAND_LABELS.GREEN, description: PRICE_BAND_DESCRIPTIONS.GREEN },
  ];
  if (marketCeiling != null) {
    bands.push({ band: "GRAY", from: marketCeiling, to: null, label: PRICE_BAND_LABELS.GRAY, description: PRICE_BAND_DESCRIPTIONS.GRAY });
  }

  const points: MarketAnchor[] = [
    { key: "BREAKEVEN", label: "Başabaş fiyat", price: minProfitablePrice },
    ...(targetPrice != null ? [{ key: "TARGET", label: `Hedef marj (%${inputs.targetMarginPct})`, price: targetPrice }] : []),
    ...args.marketAnchors,
  ];

  const seen = new Set<number>();
  const scenarios: PriceScenario[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.price) || p.price <= 0) continue;
    const rounded = r2(p.price);
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    const at = profitAtPrice(rounded, fixedPerUnit, inputs);
    scenarios.push({
      key: p.key,
      label: p.label,
      price: rounded,
      netRevenue: at.netRevenue,
      commission: at.commission,
      profit: at.profit,
      marginPct: at.marginPct,
      band: classifyPrice(rounded, minProfitablePrice, targetPrice, marketCeiling),
    });
  }
  scenarios.sort((a, b) => a.price - b.price);

  notes.push(
    inputs.commissionBase === "GROSS"
      ? "Komisyon, KDV dahil satış fiyatı üzerinden hesaplandı."
      : "Komisyon, KDV hariç net tutar üzerinden hesaplandı.",
  );
  notes.push("Marj, KDV hariç net gelire oranla verilmiştir.");

  return {
    status: "OK",
    costBasis,
    inputs,
    breakdown,
    fixedPerUnit,
    minProfitablePrice,
    targetPrice,
    marketCeiling,
    marketFloor,
    bands,
    scenarios,
    notes,
    warnings,
  };
}
