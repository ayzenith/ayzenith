import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChargeableWeight } from "../src/server/logistics/normalize";
import { evaluateMarketReferenceMatch, type MatchableMarketReference } from "../src/server/logistics/market-reference-match";

const deRef: MatchableMarketReference = {
  id: "ref-de",
  originCity: "Istanbul",
  originCountry: "TR",
  destCity: null,
  destCountry: "DE",
  unitCount: 1,
  weightScopeType: "UP_TO",
  weightScopeMinKg: null,
  weightScopeMaxKg: 500,
  shipmentType: "LTL",
  periodStart: new Date("2026-01-01"),
  periodEnd: new Date("2026-12-31"),
};
const q = {
  originCountry: "TR",
  destCountry: "DE",
  destCity: "Berlin",
  chargeableWeightKg: 500,
  shipmentType: "LTL" as const,
  unitCount: 1,
  queryDate: new Date("2026-09-19"),
};

test("chargeable weight: actual beats volumetric from m³", () => {
  assert.deepEqual(computeChargeableWeight({ weightKg: 500, volumeM3: 1.2 }), { value: 500, method: "AS_REPORTED" });
});

test("chargeable weight: volume alone gives volumetric weight", () => {
  const r = computeChargeableWeight({ volumeM3: 3 });
  assert.equal(r.method, "VOLUMETRIC_COMPUTED");
  assert.equal(r.value, 1000);
});

test("chargeable weight: nothing given stays missing", () => {
  assert.deepEqual(computeChargeableWeight({}), { value: null, method: "MISSING" });
});

test("İstanbul→Berlin 500 kg / 1 palet matches the DE reference at country level only", () => {
  const r = evaluateMarketReferenceMatch(deRef, q);
  assert.equal(r.matches, true);
  assert.equal(r.citySpecific, false);
});

test("501 kg falls outside a ≤500 kg reference", () => {
  assert.equal(evaluateMarketReferenceMatch(deRef, { ...q, chargeableWeightKg: 501 }).matches, false);
});

test("a 1-pallet reference is never scaled to 2 pallets", () => {
  assert.equal(evaluateMarketReferenceMatch(deRef, { ...q, unitCount: 2 }).matches, false);
});

test("no LTL→FTL fallback", () => {
  assert.equal(evaluateMarketReferenceMatch(deRef, { ...q, shipmentType: "FTL" }).matches, false);
});
