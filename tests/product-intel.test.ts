import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveCostBasis } from "../src/server/product-intel/cost-source";
import { classifyPrice, computePriceStrategy, profitAtPrice, type PriceInputs } from "../src/server/product-intel/price";
import { computeGapFindings } from "../src/server/product-intel/gap";
import { readFacets, ourFacets, readFacetsFromText } from "../src/server/product-intel/facets";
import { extractClaims, supportedClaimsFor, validateTitle, checkTitleCandidates } from "../src/server/product-intel/title";
import { parseMoneyLoose, parseOfferBlock } from "../src/server/product-intel/offers";
import { computeConfidence, decideStatus } from "../src/server/product-intel/confidence";
import { computeMarketProfile } from "../src/server/product-intel/market";
import { extractKeywords } from "../src/server/product-intel/keywords";
import { buildEvidence, buildSwot } from "../src/server/product-intel/swot";
import { extractAttributes } from "../src/server/import/attributes";
import { normalizeText } from "../src/server/import/text";
import type { OfferView } from "../src/server/product-intel/types";

// ---------------------------------------------------------------------------
// 1. COST SOURCE PRIORITY
// ---------------------------------------------------------------------------

test("cost source: the real moving average wins over everything else", () => {
  const b = resolveCostBasis({
    averageCost: { avgUnitCost: 1271.4, onHand: 135, uncostedQty: 0 },
    landed: { perUnitMin: 900, perUnitMax: 950, completeness: "COMPLETE", missing: [], unchecked: [] },
    userUnitCost: 500,
    baseCurrency: "TRY",
  });
  assert.equal(b.kind, "AVERAGE_COST");
  assert.equal(b.unitCost, 1271.4);
  assert.equal(b.provenance, "CALCULATED");
  assert.equal(b.isAssumption, false);
});

test("cost source: landed cost is used when the product has not been bought yet", () => {
  const b = resolveCostBasis({
    averageCost: null,
    landed: { perUnitMin: 900, perUnitMax: 950, completeness: "COMPLETE", missing: [], unchecked: [] },
    userUnitCost: 500,
    baseCurrency: "TRY",
  });
  assert.equal(b.kind, "LANDED_COST");
  // The UPPER end of the band: a break-even price must not be optimistic.
  assert.equal(b.unitCost, 950);
  assert.deepEqual(b.range, { min: 900, max: 950 });
  assert.equal(b.isAssumption, false);
});

test("cost source: a typed cost is used last and is always flagged an assumption", () => {
  const b = resolveCostBasis({ averageCost: null, landed: null, userUnitCost: 500, baseCurrency: "TRY" });
  assert.equal(b.kind, "USER_ASSUMPTION");
  assert.equal(b.unitCost, 500);
  assert.equal(b.provenance, "USER_ENTERED");
  assert.equal(b.isAssumption, true);
  assert.ok(b.warnings.length > 0);
});

test("cost source: with nothing to go on it refuses rather than inventing a number", () => {
  const b = resolveCostBasis({ averageCost: null, landed: null, userUnitCost: null, baseCurrency: "TRY" });
  assert.equal(b.kind, "NONE");
  assert.equal(b.unitCost, null);
  assert.ok(b.warnings.length > 0);
});

test("cost source: an average that covers only part of the stock says so", () => {
  const b = resolveCostBasis({
    averageCost: { avgUnitCost: 1000, onHand: 100, uncostedQty: 60 },
    landed: null,
    userUnitCost: null,
    baseCurrency: "TRY",
  });
  assert.equal(b.kind, "AVERAGE_COST");
  assert.ok(b.warnings.some((w) => w.includes("60")));
});

test("cost source: an incomplete landed cost names what is missing", () => {
  const b = resolveCostBasis({
    averageCost: null,
    landed: { perUnitMin: 900, perUnitMax: 900, completeness: "PARTIAL", missing: ["Navlun"], unchecked: ["ÖTV"] },
    userUnitCost: null,
    baseCurrency: "TRY",
  });
  assert.ok(b.warnings.some((w) => w.includes("Navlun") && w.includes("ÖTV")));
});

test("cost source: a zero or negative average is not a cost", () => {
  const b = resolveCostBasis({
    averageCost: { avgUnitCost: 0, onHand: 0, uncostedQty: 0 },
    landed: null,
    userUnitCost: 400,
    baseCurrency: "TRY",
  });
  assert.equal(b.kind, "USER_ASSUMPTION");
});

// ---------------------------------------------------------------------------
// 2. PRICE BANDS
// ---------------------------------------------------------------------------

const INPUTS: PriceInputs = {
  shipping: 20,
  packaging: 5,
  returnRatePct: 10,
  vatRatePct: 20,
  commissionPct: 10,
  commissionBase: "GROSS",
  adPerUnit: 0,
  adPctOfPrice: 0,
  otherOpsPerUnit: 0,
  targetMarginPct: 25,
};

function strategy(over: Partial<PriceInputs> = {}, marketPrices: number[] = []) {
  return computePriceStrategy({
    costBasis: resolveCostBasis({ averageCost: null, landed: null, userUnitCost: 100, baseCurrency: "TRY" }),
    inputs: { ...INPUTS, ...over },
    marketPrices,
    marketAnchors: [],
  });
}

test("price: the per-unit cost is cost + shipping + packaging + return allowance", () => {
  const p = strategy();
  // 10% of (20 shipped out + 20 back + 5 box) = 4.50; the GOODS come back and
  // are sold again, so COGS is deliberately not in the return term.
  assert.equal(p.breakdown.find((b) => b.key === "RETURN")!.amount, 4.5);
  assert.equal(p.fixedPerUnit, 129.5);
});

test("price: break-even price solves profit = 0 exactly", () => {
  const p = strategy();
  assert.equal(p.status, "OK");
  // 129.50 / (1/1.2 - 0.10) = 176.59
  assert.equal(p.minProfitablePrice, 176.59);
  const at = profitAtPrice(p.minProfitablePrice!, p.fixedPerUnit!, INPUTS);
  assert.ok(Math.abs(at.profit) < 0.01, `profit at break-even should be ~0, got ${at.profit}`);
});

test("price: the target price really delivers the target margin", () => {
  const p = strategy();
  assert.equal(p.targetPrice, 246.67);
  const at = profitAtPrice(p.targetPrice!, p.fixedPerUnit!, INPUTS);
  assert.ok(Math.abs(at.marginPct - 25) < 0.1, `margin should be ~25%, got ${at.marginPct}`);
});

test("price: charging commission on the net rather than the gross changes the break-even", () => {
  const p = strategy({ commissionBase: "NET" });
  // 129.50 * 1.2 / 0.9 = 172.67 — cheaper than the GROSS base, as it must be.
  assert.equal(p.minProfitablePrice, 172.67);
  assert.ok(p.minProfitablePrice! < 176.59);
});

test("price: when commission swallows the whole net there is NO profitable price", () => {
  const p = strategy({ commissionPct: 90 });
  assert.equal(p.status, "IMPOSSIBLE");
  assert.equal(p.minProfitablePrice, null);
  assert.ok(p.warnings.some((w) => w.includes("kârlı bir fiyat yok")));
});

// --- advertising and other operating costs ---------------------------------
// The two advertising inputs are deliberately NOT interchangeable: a flat
// amount per unit sits in the fixed cost, a percentage scales with the price.
// These tests pin that difference, because collapsing one into the other would
// silently change every break-even on the screen.

test("price: a flat advertising amount lands in the per-unit cost", () => {
  const p = strategy({ adPerUnit: 10 });
  assert.equal(p.breakdown.find((b) => b.key === "AD_UNIT")!.amount, 10);
  assert.equal(p.fixedPerUnit, 139.5);
  // 139.50 / (1/1.2 - 0.10) = 190.23
  assert.equal(p.minProfitablePrice, 190.23);
});

test("price: other operating cost lands in the per-unit cost too", () => {
  const p = strategy({ otherOpsPerUnit: 15 });
  assert.equal(p.breakdown.find((b) => b.key === "OTHER_OPS")!.amount, 15);
  assert.equal(p.fixedPerUnit, 144.5);
});

test("price: percentage advertising sits beside commission, not in the fixed cost", () => {
  const p = strategy({ adPctOfPrice: 10 });
  // The per-unit cost is untouched — the ad is charged on the price.
  assert.equal(p.fixedPerUnit, 129.5);
  // 129.50 / (1/1.2 - 0.10 - 0.10) = 204.47
  assert.equal(p.minProfitablePrice, 204.47);
  const at = profitAtPrice(p.minProfitablePrice!, p.fixedPerUnit!, { ...INPUTS, adPctOfPrice: 10 });
  assert.ok(Math.abs(at.profit) < 0.01, `profit at break-even should be ~0, got ${at.profit}`);
  assert.equal(at.adCost, 20.45);
});

test("price: the same advertising spend costs more as a percentage than as a flat amount", () => {
  // Both describe "about 20 lira of advertising" at a ~200 TRY price, but the
  // percentage keeps growing with the price, so it needs a higher break-even.
  const flat = strategy({ adPerUnit: 20 });
  const pct = strategy({ adPctOfPrice: 10 });
  assert.ok(
    pct.minProfitablePrice! > flat.minProfitablePrice!,
    `percentage ${pct.minProfitablePrice} should exceed flat ${flat.minProfitablePrice}`,
  );
});

test("price: percentage advertising can make every price unprofitable, and says so", () => {
  const p = strategy({ adPctOfPrice: 75 });
  assert.equal(p.status, "IMPOSSIBLE");
  assert.equal(p.minProfitablePrice, null);
  assert.ok(p.warnings.some((w) => w.includes("reklam")), "the warning must name advertising as the cause");
  assert.ok(p.warnings.some((w) => w.includes("Fiyatı yükseltmek bunu çözmez")));
});

test("price: a flat advertising amount never makes a price impossible", () => {
  // However large, a fixed amount is escaped by charging more — the opposite of
  // the percentage case above. This is the whole reason they are separate.
  const p = strategy({ adPerUnit: 100_000 });
  assert.equal(p.status, "OK");
  assert.ok(p.minProfitablePrice! > 0);
});

test("price: advertising is charged on the gross price on the NET commission base too", () => {
  const p = strategy({ commissionBase: "NET", adPctOfPrice: 10 });
  // 129.50 / ((1 - 0.10)/1.2 - 0.10) = 129.50 / 0.65 = 199.23
  assert.equal(p.minProfitablePrice, 199.23);
});

test("price: the target margin still holds exactly once advertising is in", () => {
  const p = strategy({ adPctOfPrice: 10 });
  assert.equal(p.targetPrice, 304.71);
  const at = profitAtPrice(p.targetPrice!, p.fixedPerUnit!, { ...INPUTS, adPctOfPrice: 10 });
  assert.ok(Math.abs(at.marginPct - 25) < 0.1, `margin should be ~25%, got ${at.marginPct}`);
});

test("price: zero advertising leaves every existing figure unchanged", () => {
  // The regression guard for analyses created before these fields existed.
  const before = strategy();
  const explicitZero = strategy({ adPerUnit: 0, adPctOfPrice: 0, otherOpsPerUnit: 0 });
  assert.equal(explicitZero.minProfitablePrice, before.minProfitablePrice);
  assert.equal(explicitZero.targetPrice, before.targetPrice);
  assert.equal(explicitZero.fixedPerUnit, before.fixedPerUnit);
});

test("price: no cost means no price advice at all", () => {
  const p = computePriceStrategy({
    costBasis: resolveCostBasis({ averageCost: null, landed: null, userUnitCost: null, baseCurrency: "TRY" }),
    inputs: INPUTS,
    marketPrices: [200, 300],
    marketAnchors: [],
  });
  assert.equal(p.status, "NO_COST");
  assert.equal(p.minProfitablePrice, null);
  assert.equal(p.bands.length, 0);
  assert.equal(p.scenarios.length, 0);
});

test("price: the four bands classify a price the way the labels promise", () => {
  const min = 176.59;
  const target = 246.67;
  const ceiling = 400;
  assert.equal(classifyPrice(100, min, target, ceiling), "RED");
  assert.equal(classifyPrice(200, min, target, ceiling), "YELLOW");
  assert.equal(classifyPrice(300, min, target, ceiling), "GREEN");
  assert.equal(classifyPrice(500, min, target, ceiling), "GRAY");
  // Exact boundaries belong to the friendlier band.
  assert.equal(classifyPrice(min, min, target, ceiling), "YELLOW");
  assert.equal(classifyPrice(target, min, target, ceiling), "GREEN");
  assert.equal(classifyPrice(ceiling, min, target, ceiling), "GREEN");
});

test("price: with no market data there is no GRAY band — a ceiling is never invented", () => {
  const p = strategy();
  assert.equal(p.marketCeiling, null);
  assert.ok(!p.bands.some((b) => b.band === "GRAY"));
  assert.ok(p.notes.some((n) => n.includes("GRİ")));
});

test("price: a target above every observed competitor price is called out", () => {
  const p = strategy({}, [150, 180, 200]);
  assert.equal(p.marketCeiling, 200);
  assert.ok(p.warnings.some((w) => w.includes("Hedef marj fiyatın")));
});

test("price: a break-even above the whole market is the harshest and clearest finding", () => {
  const p = computePriceStrategy({
    costBasis: resolveCostBasis({ averageCost: null, landed: null, userUnitCost: 1000, baseCurrency: "TRY" }),
    inputs: INPUTS,
    marketPrices: [150, 180, 200],
    marketAnchors: [],
  });
  assert.ok(p.warnings.some((w) => w.includes("kârlı satış görünmüyor")));
});

// ---------------------------------------------------------------------------
// 3. INSUFFICIENT DATA vs BLOCKED
// ---------------------------------------------------------------------------

test("status: nothing pasted is INSUFFICIENT_DATA, not BLOCKED", () => {
  assert.equal(decideStatus({ offerCount: 0, attemptedSources: 0, failedSources: 0 }), "INSUFFICIENT_DATA");
});

test("status: every source refused us is BLOCKED — a different fact entirely", () => {
  assert.equal(decideStatus({ offerCount: 0, attemptedSources: 3, failedSources: 3 }), "BLOCKED");
});

test("status: some data through is OK; a thin sample is INSUFFICIENT_DATA", () => {
  assert.equal(decideStatus({ offerCount: 12, attemptedSources: 1, failedSources: 0 }), "OK");
  assert.equal(decideStatus({ offerCount: 3, attemptedSources: 1, failedSources: 0 }), "INSUFFICIENT_DATA");
});

test("confidence: a hundred listings with no readable price buy little confidence", () => {
  const rich = computeConfidence({
    offerCount: 100,
    pricedCount: 0,
    gapFindings: [],
    costBasis: resolveCostBasis({ averageCost: null, landed: null, userUnitCost: null, baseCurrency: "TRY" }),
  });
  assert.equal(rich.components.find((c) => c.key === "PRICE_READ")!.points, 0);
  assert.ok(rich.score <= 40, `expected a low score, got ${rich.score}`);
});

// ---------------------------------------------------------------------------
// 4. GAP COVERAGE DENOMINATOR — the rule the whole module rests on
// ---------------------------------------------------------------------------

/** 20 offers; only 8 of them say anything readable about their connector. */
function connectorOffers(): Array<{ rank: number; normalized: string }> {
  const rows: string[] = [];
  rows.push("sarjli mini fan usb c girisli");           // USB-C  (matches us)
  rows.push("tasinabilir vantilator type c sarj");      // USB-C  (matches us)
  for (let i = 0; i < 4; i += 1) rows.push(`el vantilatoru micro usb sarjli model ${i}`); // Micro-USB
  rows.push("mini fan usb a baglantili");               // USB-A
  rows.push("vantilator lightning girisli");            // Lightning
  // 12 listings that never mention a connector at all.
  for (let i = 0; i < 12; i += 1) rows.push(`sessiz masa vantilatoru guclu motor model ${i}`);
  return rows.map((normalized, i) => ({ rank: i + 1, normalized }));
}

test("gap: the denominator is the READABLE offers, never the scanned offers", () => {
  const ours = readFacets("el vantilatoru usb c 4000 mah 5 kademe", "USER_ENTERED", "test");
  const offers = connectorOffers();
  const findings = computeGapFindings({ ourFacets: ours, offers, minSample: 8 });
  const connector = findings.find((f) => f.facetKey === "CONNECTOR")!;

  assert.equal(connector.totalOffers, 20);
  assert.equal(connector.readableCount, 8, "only 8 listings state a connector");
  assert.equal(connector.matchCount, 2);
  // 2/8 = 25%, NOT 2/20 = 10%. Dividing by 20 would treat silence as absence.
  assert.equal(connector.coveragePct, 25);
  assert.equal(connector.band, "MINORITY");
});

test("gap: the scope sentence states the denominator, so a figure can never travel alone", () => {
  const ours = readFacets("el vantilatoru usb c", "USER_ENTERED", "test");
  const connector = computeGapFindings({ ourFacets: ours, offers: connectorOffers(), minSample: 8 }).find(
    (f) => f.facetKey === "CONNECTOR",
  )!;
  assert.ok(connector.scopeSentence.includes("20"), "must state what was scanned");
  assert.ok(connector.scopeSentence.includes("8"), "must state what was readable");
  assert.ok(!/pazarda yok|hiçbir/i.test(connector.scopeSentence), "must never claim absence from the market");
});

test("gap: too few readable observations reports VERİ YETERSİZ, not a percentage", () => {
  const ours = readFacets("el vantilatoru usb c", "USER_ENTERED", "test");
  const offers = [
    { rank: 1, normalized: "mini fan usb c" },
    { rank: 2, normalized: "mini fan micro usb" },
    { rank: 3, normalized: "sessiz vantilator" },
  ];
  const connector = computeGapFindings({ ourFacets: ours, offers, minSample: 8 }).find((f) => f.facetKey === "CONNECTOR")!;
  assert.equal(connector.band, "INSUFFICIENT_DATA");
  assert.equal(connector.coveragePct, null, "no percentage may be reported from a thin sample");
});

test("gap: nobody matching is 'not observed in what we scanned', never 'does not exist'", () => {
  const ours = readFacets("vantilator lightning girisli", "USER_ENTERED", "test");
  const g = computeGapFindings({ ourFacets: ours, offers: connectorOffers(), minSample: 4 }).find((f) => f.facetKey === "CONNECTOR")!;
  assert.equal(g.matchCount, 1);
  const ours2 = readFacets("vantilator oled ekranli", "USER_ENTERED", "test");
  const display = computeGapFindings({
    ourFacets: ours2,
    offers: [...Array(10)].map((_, i) => ({ rank: i + 1, normalized: "vantilator lcd ekran" })),
    minSample: 8,
  }).find((f) => f.facetKey === "DISPLAY")!;
  assert.equal(display.band, "NOT_OBSERVED");
  assert.ok(display.headline.includes("taranan kapsamda gözlenmedi"));
});

test("gap: a numeric facet matches when the rival meets OR beats us, not on equality", () => {
  const ours = readFacets("powerbank 4000 mah", "USER_ENTERED", "test");
  const offers = [
    { rank: 1, normalized: "powerbank 3800 mah" },
    { rank: 2, normalized: "powerbank 4000 mah" },
    { rank: 3, normalized: "powerbank 5000 mah" },
    { rank: 4, normalized: "powerbank 2000 mah" },
  ];
  const g = computeGapFindings({ ourFacets: ours, offers, minSample: 4 }).find((f) => f.facetKey === "BATTERY_MAH")!;
  assert.equal(g.readableCount, 4);
  assert.equal(g.matchCount, 2, "4000 and 5000 meet or beat 4000 mAh");
  assert.equal(g.coveragePct, 50);
});

test("gap: what the rivals use instead is reported, which is what makes a gap actionable", () => {
  const ours = readFacets("el vantilatoru usb c", "USER_ENTERED", "test");
  const g = computeGapFindings({ ourFacets: ours, offers: connectorOffers(), minSample: 8 }).find((f) => f.facetKey === "CONNECTOR")!;
  assert.equal(g.otherValues[0]!.value, "Micro-USB");
  assert.equal(g.otherValues[0]!.count, 4);
});

test("facets: micro-USB is never mistaken for USB-A", () => {
  assert.equal(readFacets("mini fan micro usb sarj").find((f) => f.key === "CONNECTOR")!.value, "Micro-USB");
  assert.equal(readFacets("mini fan usb a girisi").find((f) => f.key === "CONNECTOR")!.value, "USB-A");
  assert.equal(readFacets("mini fan usb type c").find((f) => f.key === "CONNECTOR")!.value, "USB-C");
});

test("facets: a text that says nothing about a facet produces NO facet, not an empty one", () => {
  const facets = readFacets("sessiz masa vantilatoru guclu motor");
  assert.equal(facets.find((f) => f.key === "CONNECTOR"), undefined);
  assert.equal(facets.find((f) => f.key === "BATTERY_MAH"), undefined);
});

test("facets: our own product is read by the same ruler as the competitors", () => {
  const attrs = extractAttributes({ name: "El Vantilatörü USB-C 4000 mAh 5 Kademe Dijital Ekran" }, []);
  const mine = ourFacets(attrs);
  const theirs = readFacetsFromText("El Vantilatörü USB-C 4000 mAh 5 Kademe Dijital Ekran", "WEB_EXTRACTED", "rakip");
  assert.deepEqual(
    mine.map((f) => `${f.key}=${f.value}`).sort(),
    theirs.map((f) => `${f.key}=${f.value}`).sort(),
  );
  assert.ok(mine.some((f) => f.key === "BATTERY_MAH" && f.num === 4000));
  assert.ok(mine.some((f) => f.key === "SPEED_LEVELS" && f.num === 5));
});

// ---------------------------------------------------------------------------
// 5. TITLE VALIDATION — arithmetic, not prompt discipline
// ---------------------------------------------------------------------------

const OUR_TEXT = "El Vantilatörü USB-C 4000 mAh 5 Kademe Dijital Ekran";

test("title: a specification the product does not have is rejected", () => {
  const supported = supportedClaimsFor(OUR_TEXT);
  const r = validateTitle({
    title: "Şarjlı El Vantilatörü USB-C 6000mAh 5 Kademeli Dijital Ekranlı Mini Fan",
    maxChars: 100,
    supportedClaims: supported,
  });
  const bad = r.violations.filter((v) => v.code === "UNSUPPORTED_CLAIM");
  assert.equal(bad.length, 1);
  assert.equal(bad[0]!.detail, "6000 mah");
});

test("title: the product's real specification passes", () => {
  const r = validateTitle({
    title: "Şarjlı El Vantilatörü USB-C 4000mAh 5 Kademeli Dijital Ekranlı Mini Fan",
    maxChars: 100,
    supportedClaims: supportedClaimsFor(OUR_TEXT),
  });
  assert.deepEqual(r.violations, []);
});

test("title: a stated battery capacity entails 'şarjlı' — the one documented implication", () => {
  const supported = supportedClaimsFor(OUR_TEXT);
  assert.ok(supported.includes("sarjli"), "4000 mAh entails a rechargeable product");
  assert.ok(!supportedClaimsFor("Masa Vantilatörü Kablolu 25 W").includes("sarjli"), "no capacity, no entailment");
});

test("title: a thousands separator is the same claim, not a different one", () => {
  assert.deepEqual(extractClaims("4.000 mAh"), extractClaims("4000mAh"));
  const r = validateTitle({ title: "Mini Fan 4.000 mAh", maxChars: 100, supportedClaims: extractClaims(OUR_TEXT) });
  assert.equal(r.violations.filter((v) => v.code === "UNSUPPORTED_CLAIM").length, 0);
});

test("title: the character ceiling is enforced", () => {
  const r = validateTitle({ title: "x".repeat(120), maxChars: 100, supportedClaims: [] });
  assert.ok(r.violations.some((v) => v.code === "TOO_LONG"));
});

test("title: marketplace-banned wording is caught", () => {
  const r = validateTitle({ title: "En Ucuz Mini Fan Ücretsiz Kargo", maxChars: 100, supportedClaims: [] });
  const codes = r.violations.map((v) => v.code);
  assert.ok(codes.includes("BANNED_PHRASE"));
});

test("title: a word hammered three times is flagged", () => {
  const r = validateTitle({ title: "Vantilatör Vantilatör Vantilatör Mini", maxChars: 100, supportedClaims: [] });
  assert.ok(r.violations.some((v) => v.code === "REPEATED_WORD"));
});

test("title: a rejected draft is kept with its reason, never silently dropped", () => {
  const candidates = checkTitleCandidates(
    [
      { title: "Şarjlı El Vantilatörü USB-C 4000mAh 5 Kademeli", rationale: "gerçek" },
      { title: "El Vantilatörü 9000mAh Süper Güçlü", rationale: "uydurma" },
    ],
    { maxChars: 100, supportedClaims: supportedClaimsFor(OUR_TEXT) },
  );
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0]!.accepted, true);
  assert.equal(candidates[1]!.accepted, false);
  assert.ok(candidates[1]!.violations.length > 0);
});

test("title: a connector the product lacks cannot be smuggled in", () => {
  const r = validateTitle({
    title: "El Vantilatörü Micro USB 4000mAh",
    maxChars: 100,
    supportedClaims: supportedClaimsFor(OUR_TEXT),
  });
  assert.ok(r.violations.some((v) => v.code === "UNSUPPORTED_CLAIM" && v.detail === "micro usb"));
});

// ---------------------------------------------------------------------------
// 6. PARSING PASTED COMPETITOR DATA
// ---------------------------------------------------------------------------

test("offers: Turkish and English money formats are both read correctly", () => {
  assert.equal(parseMoneyLoose("1.299,90"), 1299.9);
  assert.equal(parseMoneyLoose("1,299.90"), 1299.9);
  assert.equal(parseMoneyLoose("249,90"), 249.9);
  assert.equal(parseMoneyLoose("249.90"), 249.9);
  assert.equal(parseMoneyLoose("1.299"), 1299);
  assert.equal(parseMoneyLoose("1299"), 1299);
  assert.equal(parseMoneyLoose("₺ 1.299,90 TL"), 1299.9);
  assert.equal(parseMoneyLoose(""), null);
  assert.equal(parseMoneyLoose("—"), null);
});

test("offers: a header row is recognised and columns are mapped by name", () => {
  const block = [
    "Başlık\tFiyat\tSatıcı\tMarka\tPuan\tYorum",
    "Şarjlı Mini Fan USB-C 4000mAh\t249,90\tABC Mağaza\tNoName\t4,3\t512",
    "El Vantilatörü Micro USB\t199,00\tXYZ Store\tGeneric\t4,1\t88",
  ].join("\n");
  const r = parseOfferBlock(block, "TRY");
  assert.equal(r.headerDetected, true);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0]!.price, 249.9);
  assert.equal(r.rows[0]!.sellerName, "ABC Mağaza");
  assert.equal(r.rows[1]!.ratingCount, 88);
});

test("offers: a listing whose price we cannot read is STILL an offer", () => {
  const r = parseOfferBlock("Başlık\tFiyat\nMini Fan USB-C\tfiyat sorunuz", "TRY");
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0]!.price, null, "the listing exists even where the number does not");
});

test("offers: plain lines with no delimiter still yield titles", () => {
  const r = parseOfferBlock("Şarjlı Mini Fan USB-C\nEl Vantilatörü Micro USB\n", "TRY");
  assert.equal(r.delimiter, null);
  assert.equal(r.rows.length, 2);
  assert.ok(r.notes.some((n) => n.includes("ayrac")) || r.notes.some((n) => n.includes("ayracı")));
});

test("offers: rows that cannot be used are reported, not hidden", () => {
  const r = parseOfferBlock("Başlık\tFiyat\n\t249,90\nMini Fan\t199", "TRY");
  assert.equal(r.rows.length, 1);
  assert.equal(r.skipped.length, 1);
  assert.ok(r.skipped[0]!.reason.length > 0);
});

// ---------------------------------------------------------------------------
// 7. PROVENANCE AND EVIDENCE
// ---------------------------------------------------------------------------

function sampleOffers(): OfferView[] {
  const titles = [
    ["Şarjlı Mini Fan Micro USB 2000mAh", "ABC", 199],
    ["El Vantilatörü Micro USB 2500mAh", "ABC", 229],
    ["Taşınabilir Fan Micro USB", "DEF", 189],
    ["Mini Vantilatör USB-C 4000mAh", "GHI", 349],
    ["Sessiz Masa Vantilatörü", "JKL", 279],
    ["El Fanı Micro USB 3 Kademe", "ABC", 209],
  ] as const;
  return titles.map(([title, seller, price], i) => ({
    rank: i + 1,
    title,
    brand: null,
    sellerName: seller,
    price,
    currency: "TRY",
    ratingAvg: 4.2,
    ratingCount: 100 + i * 50,
    normalized: normalizeText(title),
    provenance: "USER_ENTERED" as const,
    sourceUrl: null,
  }));
}

test("evidence: every derived row carries a provenance and its measurement", () => {
  const offers = sampleOffers();
  const market = computeMarketProfile(offers, "TRY");
  const ours = readFacets(normalizeText(OUR_TEXT), "USER_ENTERED", "test");
  const gapFindings = computeGapFindings({ ourFacets: ours, offers: offers.map((o) => ({ rank: o.rank, normalized: o.normalized })), minSample: 4 });
  const keywords = extractKeywords({ offers: offers.map((o) => ({ title: o.title, sellerName: o.sellerName })), ourText: OUR_TEXT });
  const price = strategy({}, offers.map((o) => o.price!));
  const costBasis = price.costBasis;
  const swot = buildSwot({ gapFindings, market, price, keywords, costBasis });
  const evidence = buildEvidence({ gapFindings, market, price, keywords, swot });

  assert.ok(evidence.length > 0);
  for (const e of evidence) {
    assert.ok(e.provenance, "every evidence row needs a provenance");
    assert.ok(e.text.trim().length > 0);
    assert.ok(["PRODUCT", "MARKET", "COMPETITOR", "GAP", "KEYWORD", "PRICE", "SWOT", "LAUNCH"].includes(e.area));
  }
  // A gap row must drag its scope sentence along with it.
  const gapRow = evidence.find((e) => e.area === "GAP");
  assert.ok(gapRow && gapRow.text.includes("okunabilen"), "a gap claim must state its denominator");
});

test("evidence: an assumed cost is recorded as a negative, not quietly accepted", () => {
  const offers = sampleOffers();
  const market = computeMarketProfile(offers, "TRY");
  const price = strategy({}, offers.map((o) => o.price!));
  const keywords = extractKeywords({ offers: [], ourText: OUR_TEXT });
  const swot = buildSwot({ gapFindings: [], market, price, keywords, costBasis: price.costBasis });
  const evidence = buildEvidence({ gapFindings: [], market, price, keywords, swot });
  const costRow = evidence.find((e) => e.kind === "COST_BASIS")!;
  assert.equal(costRow.polarity, "NEGATIVE");
  assert.ok(swot.weaknesses.some((w) => w.text.includes("varsayıldı")));
});

test("swot: a quadrant with no measurement behind it stays empty and says so", () => {
  const market = computeMarketProfile([], "TRY");
  const price = computePriceStrategy({
    costBasis: resolveCostBasis({ averageCost: null, landed: null, userUnitCost: null, baseCurrency: "TRY" }),
    inputs: INPUTS,
    marketPrices: [],
    marketAnchors: [],
  });
  const keywords = extractKeywords({ offers: [], ourText: OUR_TEXT });
  const swot = buildSwot({ gapFindings: [], market, price, keywords, costBasis: price.costBasis });
  assert.equal(swot.strengths.length, 0);
  assert.ok(swot.emptyQuadrants.includes("Güçlü yönler"));
  assert.ok(swot.emptyQuadrants.includes("Fırsatlar"));
});

test("market: offers with no price are counted as offers but never priced", () => {
  const offers = sampleOffers();
  offers[0]!.price = null;
  const m = computeMarketProfile(offers, "TRY");
  assert.equal(m.offerCount, 6);
  assert.equal(m.pricedCount, 5);
  assert.equal(m.priceStats!.count, 5);
});

test("keywords: ranking is by DISTINCT sellers, so one shop cannot invent a convention", () => {
  const r = extractKeywords({
    offers: [
      { title: "Mini Fan Turbo Model A", sellerName: "TekSatici" },
      { title: "Mini Fan Turbo Model B", sellerName: "TekSatici" },
      { title: "Mini Fan Turbo Model C", sellerName: "TekSatici" },
      { title: "Mini Fan Sessiz", sellerName: "Ikinci" },
      { title: "Mini Fan Sessiz Plus", sellerName: "Ucuncu" },
    ],
    ourText: "mini fan",
  });
  const turbo = r.terms.find((t) => t.term === "turbo");
  const sessiz = r.terms.find((t) => t.term === "sessiz");
  assert.ok(turbo && sessiz);
  assert.equal(turbo!.offerCount, 3);
  assert.equal(turbo!.sellerCount, 1);
  assert.equal(sessiz!.sellerCount, 2);
  assert.ok(r.terms.indexOf(sessiz!) < r.terms.indexOf(turbo!), "two sellers outrank one seller's habit");
});

// ---------------------------------------------------------------------------
// 8. THE ANALYSIS IS IMMUTABLE
// ---------------------------------------------------------------------------

function schemaBlock(model: string): string {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const start = schema.indexOf(`model ${model} {`);
  assert.ok(start >= 0, `${model} must exist in the schema`);
  return schema.slice(start, schema.indexOf("\n}", start));
}

test("immutable: ProductAnalysis has no updatedAt — a re-run makes a new row", () => {
  const block = schemaBlock("ProductAnalysis");
  assert.ok(!/\bupdatedAt\b/.test(block), "a frozen snapshot must not carry an updatedAt");
  assert.ok(/\bcreatedAt\b/.test(block));
});

test("immutable: the repository offers no way to update a stored analysis", () => {
  const repo = readFileSync(new URL("../src/server/product-intel/repo.ts", import.meta.url), "utf8");
  assert.ok(!/productAnalysis\.update/.test(repo), "repo must never update an analysis");
  assert.ok(!/productAnalysis\.upsert/.test(repo), "repo must never upsert an analysis");
  assert.ok(/productAnalysis\.findUnique/.test(repo));
});

test("immutable: nothing outside the writer mutates an analysis or its evidence", () => {
  for (const file of ["analyze.ts", "repo.ts"]) {
    const src = readFileSync(new URL(`../src/server/product-intel/${file}`, import.meta.url), "utf8");
    assert.ok(!/productEvidence\.update/.test(src), `${file} must not update evidence`);
    assert.ok(!/competitorOffer\.update/.test(src), `${file} must not update offers`);
    assert.ok(!/productScanSource\.update/.test(src), `${file} must not rewrite the scan ledger`);
  }
});
