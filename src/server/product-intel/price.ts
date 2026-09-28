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
 *   adCost     = P * a                       advertising as a SHARE of the shown
 *                                            price — the ACoS the marketplace's
 *                                            own ad report quotes. Always on the
 *                                            gross price, on both commission
 *                                            bases, because that is what the ad
 *                                            panel measures against.
 *   fixed      = cost + shipping + packaging + returnCost + adPerUnit + otherOps
 *   profit(P)  = netRevenue - commission - adCost - fixed
 *   margin(P)  = profit / netRevenue
 *
 * ADVERTISING IS ACCEPTED TWO WAYS, ON PURPOSE. A marketplace ad report states a
 * percentage (ACoS); a budget divided by expected units states an amount. Both
 * are real ways an operator knows this number, and they behave DIFFERENTLY: a
 * per-unit amount is fixed and shifts the break-even up by itself, while a
 * percentage scales with the price and can make a profitable price impossible
 * no matter how high you go. Forcing one into the other would hide that. They
 * may be used together; each defaults to zero and changes nothing when unset.
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
  /** Advertising as a flat amount per unit, base currency, VAT excluded — a
   *  budget the operator has already divided by the units they expect to sell. */
  adPerUnit: number;
  /** Advertising as a percent of the shown price (ACoS), e.g. 8 means 8%. */
  adPctOfPrice: number;
  /** Anything else the operator bears per unit that is not listed above. */
  otherOpsPerUnit: number;
  /** Percent of net revenue the operator wants to keep. */
  targetMarginPct: number;
};

export type PriceScenario = {
  key: string;
  label: string;
  price: number;
  netRevenue: number;
  commission: number;
  /** The price-proportional advertising term only. The flat per-unit part is
   *  inside `fixedPerUnit`, so adding these two would double-count it. */
  adCost: number;
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
  const a = inputs.adPctOfPrice / 100;
  const m = inputs.targetMarginPct / 100;
  return { v, c, a, m };
}

export function profitAtPrice(price: number, fixedPerUnit: number, inputs: PriceInputs): { netRevenue: number; commission: number; adCost: number; profit: number; marginPct: number } {
  const { v, c, a } = terms(inputs);
  const netRevenue = price / v;
  const commission = inputs.commissionBase === "GROSS" ? price * c : netRevenue * c;
  const adCost = price * a;
  const profit = netRevenue - commission - adCost - fixedPerUnit;
  const marginPct = netRevenue === 0 ? 0 : (profit / netRevenue) * 100;
  return { netRevenue: r2(netRevenue), commission: r2(commission), adCost: r2(adCost), profit: r2(profit), marginPct: Math.round(marginPct * 10) / 10 };
}

/** Price at which profit is exactly `marginFraction` of net revenue.
 *
 *  Both bases carry `- a`: percentage advertising is charged on the shown price
 *  whichever way the marketplace bills its commission. */
function priceForMargin(fixedPerUnit: number, inputs: PriceInputs, marginFraction: number): number | null {
  const { v, c, a } = terms(inputs);
  const denom =
    inputs.commissionBase === "GROSS"
      ? (1 - marginFraction) / v - c - a
      : (1 - marginFraction - c) / v - a;
  if (!(denom > 0)) return null;
  return r2(fixedPerUnit / denom);
}

/**
 * The range a price slider should span, derived from the points that actually
 * matter rather than from a guessed constant.
 *
 * It is a pure function and lives here, beside the formula, for one reason: the
 * simulator is a CLIENT component, and everything it computes has to be the
 * same arithmetic the frozen analysis used. A bound invented inside the
 * component would be untestable and would drift.
 *
 * The span always contains every anchor it was given, with room on both sides,
 * so break-even, target and the observed market are all reachable by dragging.
 */
export function simulatorBounds(a: {
  minProfitablePrice: number | null;
  targetPrice: number | null;
  marketFloor: number | null;
  marketCeiling: number | null;
  currentPrice: number;
}): { min: number; max: number; step: number } {
  const anchors = [a.minProfitablePrice, a.targetPrice, a.marketFloor, a.marketCeiling, a.currentPrice].filter(
    (n): n is number => n != null && Number.isFinite(n) && n > 0,
  );
  if (anchors.length === 0) return { min: 0, max: 100, step: 1 };

  const lo = Math.min(...anchors);
  const hi = Math.max(...anchors);
  // Half an order below the cheapest anchor and half again above the dearest —
  // enough to drag into loss on one side and out of the market on the other.
  const min = Math.max(0, Math.floor((lo * 0.5) / 10) * 10);
  const max = Math.max(Math.ceil((hi * 1.5) / 10) * 10, min + 10);
  const step = Math.max(1, Math.round((max - min) / 400));
  return { min, max, step };
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
    {
      key: "AD_UNIT",
      label: "Reklam (sabit)",
      amount: r2(inputs.adPerUnit),
      note: "Birim başına sabit reklam payı. Yüzde olarak girilen reklam bu satırda değil, fiyatla birlikte değişir.",
    },
    {
      key: "OTHER_OPS",
      label: "Diğer operasyonel gider",
      amount: r2(inputs.otherOpsPerUnit),
      note: "Birim başına, KDV hariç.",
    },
  ];
  const fixedPerUnit = r2(breakdown.reduce((s, b) => s + b.amount, 0));

  const minProfitablePrice = priceForMargin(fixedPerUnit, inputs, 0);
  const targetPrice = priceForMargin(fixedPerUnit, inputs, inputs.targetMarginPct / 100);

  if (minProfitablePrice == null) {
    warnings.push(
      inputs.adPctOfPrice > 0
        ? `Bu kanalda kârlı bir fiyat yok: %${inputs.commissionPct} komisyon + %${inputs.adPctOfPrice} reklam, %${inputs.vatRatePct} KDV sonrası kalan net gelirin tamamını alıyor. Fiyatı yükseltmek bunu çözmez — bu kalemler fiyatla birlikte büyüyor. Reklam oranını düşürün veya komisyonu kontrol edin.`
        : `Bu kanalda kârlı bir fiyat yok: %${inputs.commissionPct} komisyon, %${inputs.vatRatePct} KDV sonrası kalan net gelirin tamamını alıyor. Komisyon veya KDV oranını kontrol edin.`,
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
      adCost: at.adCost,
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
  if (inputs.adPctOfPrice > 0) {
    notes.push(
      `Reklam, satış fiyatının %${inputs.adPctOfPrice}'i olarak hesaplandı (pazaryeri reklam raporlarının ACoS tanımı). Fiyat arttıkça bu tutar da artar.`,
    );
  }

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
