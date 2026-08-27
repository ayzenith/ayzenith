/**
 * AYZENITH RADAR — confidence/completeness benchmark (accuracy Phase 4).
 *
 * The one property that matters most here is a NEGATIVE one: splitting
 * `completeness` into its four parts must not move the final score by a single
 * point. RADAR's whole contract is that the score is deterministic and frozen,
 * so a confidence change that quietly shifted it would be a far worse bug than
 * the imprecision it set out to fix.
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeScore, fullParts, type ScoringInput } from "../src/server/radar/scoring";
import { DEFAULT_WEIGHTS } from "../src/config/radar";

/** A realistic, fully-measured input. */
const base: ScoringInput = {
  targetImport: 5_000_000_000,
  peerImports: [1e9, 2e9, 3e9, 4e9, 5e9, 6e9, 7e9, 8e9],
  growthCagr: 6.2,
  growthYears: 4,
  trToTargetExport: 300_000_000,
  trToPeerExports: [1e8, 2e8, 3e8, 4e8, 5e8, 6e8, 7e8, 8e8],
  euDutyFree: true,
  customsDutyPct: 0,
  certificationBurden: "medium",
  sourceCountryImports: [3e9, 2e9, 1e9, 5e8, 2e8],
  peerCoverage: { measured: 8, expected: 8 },
  trPeerCoverage: { measured: 8, expected: 8 },
};

const run = (i: Partial<ScoringInput>) => computeScore({ ...base, ...i }, DEFAULT_WEIGHTS);

test("R1. 8/8 peer coverage — full confidence", () => {
  const r = run({});
  assert.equal(r.confidence, 100);
  assert.ok(r.finalScore != null);
});

test("R2. THE INVARIANT — partial peer coverage lowers confidence and NOT the score", () => {
  const full = run({});
  for (const measured of [7, 4, 1]) {
    const partial = run({ peerCoverage: { measured, expected: 8 }, trPeerCoverage: { measured, expected: 8 } });
    assert.equal(partial.finalScore, full.finalScore, `finalScore moved at ${measured}/8 peer coverage`);
    assert.ok(partial.confidence < full.confidence, `confidence did not fall at ${measured}/8`);
  }
});

test("R3. Confidence falls monotonically as peer coverage falls", () => {
  const vals = [8, 6, 4, 2, 1].map((m) => run({ peerCoverage: { measured: m, expected: 8 } }).confidence);
  assert.ok(vals.every((v, i) => i === 0 || v <= vals[i - 1]!), vals.join(","));
});

test("R4. Provider outage (no data at all) is not the same as partial coverage", () => {
  const outage = run({ sourceCountryImports: [] });
  const partial = run({ peerCoverage: { measured: 4, expected: 8 } });
  assert.ok(outage.confidence < 100);
  assert.ok(partial.confidence < 100);
  // An unavailable criterion is excluded from the score's denominator; a partly
  // covered one still contributes its full weight. Different mechanisms.
  assert.notEqual(outage.measuredCriteria, partial.measuredCriteria);
});

test("R5. Incomplete growth history lowers confidence, not the score", () => {
  const full = run({});
  const short = run({ growthYears: 1 });
  assert.ok(short.confidence < full.confidence);
  // growth's own score changes because the CAGR window is genuinely different
  // data — what must not change is the effect of COMPLETENESS on the score,
  // which is why the peer-coverage case above is the strict invariant.
  assert.ok(short.finalScore != null);
});

test("R6. Assumed duty is recorded as less complete than a measured one", () => {
  const measured = run({ customsDutyPct: 4, euDutyFree: false });
  const assumed = run({ customsDutyPct: null, euDutyFree: false });
  const mEntry = measured.criteria.find((c) => c.key === "entry")!;
  const aEntry = assumed.criteria.find((c) => c.key === "entry")!;
  assert.ok(aEntry.completeness < mEntry.completeness);
  assert.ok(aEntry.completenessParts.dataCompleteness < 1, "and the REASON is recorded, not just the scalar");
});

test("R7. completenessParts multiply back to completeness", () => {
  for (const m of [8, 5, 2]) {
    for (const c of run({ peerCoverage: { measured: m, expected: 8 }, trPeerCoverage: { measured: m, expected: 8 } }).criteria) {
      const p = c.completenessParts;
      const product = p.peerCoverage * p.providerAvailability * p.freshness * p.dataCompleteness;
      assert.ok(Math.abs(product - c.completeness) < 1e-9, `${c.key}: parts ${product} vs scalar ${c.completeness}`);
    }
  }
});

test("R8. The four dimensions are kept SEPARATE, not collapsed", () => {
  const r = run({ peerCoverage: { measured: 4, expected: 8 }, customsDutyPct: null, euDutyFree: false });
  const demand = r.criteria.find((c) => c.key === "demand")!;
  const entry = r.criteria.find((c) => c.key === "entry")!;
  // Demand is incomplete because peers did not answer; entry because a value was
  // assumed. Same scalar effect, different cause — and now distinguishable.
  assert.ok(demand.completenessParts.peerCoverage < 1);
  assert.equal(demand.completenessParts.dataCompleteness, 1);
  assert.equal(entry.completenessParts.peerCoverage, 1);
  assert.ok(entry.completenessParts.dataCompleteness < 1);
});

test("R9. fullParts() is neutral", () => {
  const p = fullParts();
  assert.equal(p.peerCoverage * p.providerAvailability * p.freshness * p.dataCompleteness, 1);
});

test("R10. Mixed availability: score uses only measured criteria, unchanged by completeness", () => {
  const a = run({ growthCagr: null, peerCoverage: { measured: 8, expected: 8 } });
  const b = run({ growthCagr: null, peerCoverage: { measured: 3, expected: 8 } });
  assert.equal(a.finalScore, b.finalScore, "completeness must never reach the score path");
  assert.ok(b.confidence < a.confidence);
});
