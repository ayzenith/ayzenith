/**
 * AYZENITH LEAD FINDER — confidence benchmark (accuracy Phase 4).
 *
 * Model C, chosen after running all three candidate models over 1183 real leads.
 * These cases lock in the two properties that decided it:
 *   • scarce data must not become wrong data (the `min()` model failed this);
 *   • a strong dimension must not pay for a broken one (the weighted model
 *     failed this, scoring C&A-on-cunda.de at 66).
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveConfidence, resolveIdentity, coverageRatio, emptyCoverage,
  type EvidenceCoverage,
} from "../src/server/leads/evidence";
import { CONFIDENCE_MODEL, FRESHNESS_FACTOR } from "../src/config/leads";

/** The two rejected models, restated so the comparison is executable rather
 *  than a claim in a commit message. */
const modelMin = (i: number, p: number | null, cov: number, fr: number) =>
  Math.round(Math.min(...[i, p, cov * 100, fr * 100].filter((x): x is number => x !== null)));
const modelWeighted = (i: number, p: number | null, cov: number, fr: number) => {
  const parts: Array<[number, number]> = [[i, 0.35], [cov * 100, 0.20], [fr * 100, 0.10]];
  if (p !== null) parts.push([p, 0.35]);
  const w = parts.reduce((s, [, k]) => s + k, 0);
  return Math.round(parts.reduce((s, [v, k]) => s + v * k, 0) / w);
};

const C = (i: number | null, p: number | null, cov: number, fr = 1, status?: "MISMATCH") =>
  resolveConfidence({ identity: i, product: p, coverage: cov, freshness: fr, identityStatus: status ?? null }).overall;

const cov = (n: number) => n / CONFIDENCE_MODEL.maxChecks;

const report: Array<{ n: number; name: string; expected: string; actual: string; pass: boolean }> = [];
function record(n: number, name: string, expected: string, actual: string) {
  report.push({ n, name, expected, actual, pass: expected === actual });
}

// ---------------------------------------------------------------------------
// 77–82 — source coverage: scarce data is not wrong data
// ---------------------------------------------------------------------------

test("77. Full coverage (10/10) with strong evidence scores high", () => {
  const v = C(96, 88, cov(10))!;
  record(77, "10/10 coverage, strong evidence", ">=88", String(v));
  assert.ok(v >= 88, `expected >=88, got ${v}`);
});

test("78. Half coverage (4/10) costs some confidence but not the lead", () => {
  const v = C(96, 88, cov(4))!;
  record(78, "4/10 coverage", "75-85", String(v));
  assert.ok(v >= 75 && v <= 85, `expected 75-85, got ${v}`);
  assert.ok(v > modelMin(96, 88, cov(4), 1), "must beat the rejected min() model");
});

test("79. Two sources (2/10) — still a usable lead", () => {
  const v = C(96, 88, cov(2))!;
  record(79, "2/10 coverage", ">=70", String(v));
  assert.ok(v >= 70, `scarce data must not be treated as wrong data, got ${v}`);
  assert.equal(modelMin(96, 88, cov(2), 1), 20, "the rejected min() model collapsed to 20 here");
});

test("80. One source (1/10)", () => {
  const v = C(96, 88, cov(1))!;
  record(80, "1/10 coverage", ">=70", String(v));
  assert.ok(v >= 70);
});

test("81. Zero coverage still keeps the documented floor", () => {
  const v = C(96, 88, 0)!;
  const core = CONFIDENCE_MODEL.coreWeakestWeight * 88 + CONFIDENCE_MODEL.coreMeanWeight * 92;
  record(81, "0/10 coverage", `~${Math.round(core * CONFIDENCE_MODEL.coverageFloor)}`, String(v));
  assert.equal(v, Math.round(core * CONFIDENCE_MODEL.coverageFloor), "coverage may shave only the configured amount");
});

test("82. Coverage is monotonic — more sources never lowers confidence", () => {
  const vals = [0, 1, 2, 4, 6, 8, 10].map((n) => C(96, 88, cov(n))!);
  record(82, "Coverage monotonicity", "monotonic", vals.every((v, i) => i === 0 || v >= vals[i - 1]!) ? "monotonic" : vals.join(","));
  assert.ok(vals.every((v, i) => i === 0 || v >= vals[i - 1]!), vals.join(","));
});

// ---------------------------------------------------------------------------
// 83–88 — core: a strong dimension must not pay for a broken one
// ---------------------------------------------------------------------------

test("83. Strong identity + strong product", () => {
  const v = C(96, 88, cov(9))!;
  record(83, "Strong + strong", ">=85", String(v));
  assert.ok(v >= 85);
});

test("84. WEAK identity + strong product — the C&A/cunda.de shape", () => {
  const v = C(20, 88, cov(9))!;
  record(84, "Weak identity, strong product", "<=45", String(v));
  assert.ok(v <= 45, `a broken identity must not be paid for by product evidence, got ${v}`);
  assert.ok(modelWeighted(20, 88, cov(9), 1) > 60, "the rejected weighted model called this reliable");
});

test("85. MISMATCH identity is hard-capped — the Expert/tilly-gmbh.de shape", () => {
  const v = C(10, 88, cov(8), 1, "MISMATCH")!;
  record(85, "Identity MISMATCH", `<=${CONFIDENCE_MODEL.mismatchCeiling}`, String(v));
  assert.ok(v <= CONFIDENCE_MODEL.mismatchCeiling);
});

test("86. MISMATCH cannot be rescued by perfect coverage and freshness", () => {
  const v = C(10, 100, 1, 1, "MISMATCH")!;
  record(86, "MISMATCH + perfect everything", `<=${CONFIDENCE_MODEL.mismatchCeiling}`, String(v));
  assert.ok(v <= CONFIDENCE_MODEL.mismatchCeiling);
});

test("87. Strong identity + WEAK product is also held down", () => {
  const v = C(96, 25, cov(9))!;
  record(87, "Strong identity, weak product", "<=50", String(v));
  assert.ok(v <= 50, "the weaker core dimension dominates in both directions");
});

test("88. Both middling", () => {
  const v = C(60, 60, cov(6))!;
  record(88, "Both middling", "45-65", String(v));
  assert.ok(v >= 45 && v <= 65);
});

// ---------------------------------------------------------------------------
// 89–94 — unmeasured dimensions, freshness, contradiction
// ---------------------------------------------------------------------------

test("89. UNMEASURED product is excluded, never counted as zero", () => {
  const v = C(96, null, cov(7))!;
  record(89, "Product not measured, identity strong", ">=85", String(v));
  assert.ok(v >= 85, `"not measured" must not read as "measured as zero", got ${v}`);
});

test("90. Unmeasured product does not rescue a weak identity either", () => {
  const v = C(20, null, cov(7))!;
  record(90, "Product not measured, identity weak", "<=30", String(v));
  assert.ok(v <= 30);
});

test("91. Neither core dimension measured → confidence is NULL, not zero", () => {
  const r = resolveConfidence({ identity: null, product: null, coverage: 0.5, freshness: 1 });
  record(91, "Nothing measured", "null", String(r.overall));
  assert.equal(r.overall, null, "no confidence is not the same as zero confidence");
  assert.equal(r.core, null);
});

test("92. Stale evidence costs only the configured amount", () => {
  const fresh = C(96, 88, cov(9), FRESHNESS_FACTOR.FRESH)!;
  const stale = C(96, 88, cov(9), FRESHNESS_FACTOR.STALE)!;
  record(92, "Stale vs fresh", "stale lower, >=85% of fresh", `${stale}/${fresh}`);
  assert.ok(stale < fresh, "stale evidence must score lower");
  assert.ok(stale / fresh >= 0.85, "…but old evidence is still evidence");
});

test("93. Contradiction lowers the PRODUCT input, which the core then reflects", () => {
  // Negative signals cap the evidence level in Phase 2; here we assert the
  // confidence consequence of that lower product number.
  const clean = C(90, 88, cov(9))!;
  const contradicted = C(90, 25, cov(9))!;
  record(93, "Contradicted evidence", "much lower", contradicted < clean - 30 ? "much lower" : String(contradicted));
  assert.ok(contradicted < clean - 30);
});

test("94. Every coefficient comes from config, none inline", () => {
  const M = CONFIDENCE_MODEL;
  assert.equal(M.coreWeakestWeight + M.coreMeanWeight, 1, "core weights must sum to 1");
  assert.ok(M.coverageFloor > 0 && M.coverageFloor < 1);
  assert.ok(M.freshnessFloor > M.coverageFloor, "freshness must cost less than coverage");
  record(94, "Config integrity", "OK", "OK");
});

// ---------------------------------------------------------------------------
// 95–100 — coverage bookkeeping and the real regression firms
// ---------------------------------------------------------------------------

test("95. missing and failed are NOT the same bucket", () => {
  const c: EvidenceCoverage = { consulted: ["a", "b"], available: ["a"], failed: ["b"], missing: ["c"] };
  record(95, "missing vs failed", "distinct", c.failed[0] !== c.missing[0] ? "distinct" : "merged");
  assert.equal(c.failed.length, 1, "asked, no answer — retryable");
  assert.equal(c.missing.length, 1, "not applicable to this firm — nothing to retry");
  assert.ok(!c.consulted.includes("c"), "a source that does not apply was never consulted");
});

test("96. coverageRatio counts only what actually answered", () => {
  const c = emptyCoverage();
  c.available.push(...Array.from({ length: 5 }, (_, i) => `k${i}`));
  c.failed.push("x", "y");
  record(96, "coverageRatio", "0.5", String(coverageRatio(c)));
  assert.equal(coverageRatio(c), 5 / CONFIDENCE_MODEL.maxChecks, "failures are not credit");
});

test("97. REGRESSION — C&A / cunda.de stays low-confidence", () => {
  const id = resolveIdentity({ candidateName: "C&A", legalName: null, domain: "cunda.de" });
  const v = C(id.confidence, 80, cov(9), 1, id.status === "MISMATCH" ? "MISMATCH" : undefined)!;
  record(97, "C&A → cunda.de", "<=45", String(v));
  assert.ok(v <= 45, `got ${v}`);
});

test("98. REGRESSION — Expert / tilly-gmbh.de stays capped", () => {
  const id = resolveIdentity({ candidateName: "Expert", legalName: "Suchvorschläge Günter Tilly GmbH", domain: "tilly-gmbh.de" });
  assert.equal(id.status, "MISMATCH");
  const v = C(id.confidence, 88, cov(8), 1, "MISMATCH")!;
  record(98, "Expert → tilly-gmbh.de", `<=${CONFIDENCE_MODEL.mismatchCeiling}`, String(v));
  assert.ok(v <= CONFIDENCE_MODEL.mismatchCeiling);
});

test("99. REGRESSION — genuine firms keep usable confidence", () => {
  const cases: Array<[string, ReturnType<typeof resolveIdentity>, number]> = [
    ["Loveco", resolveIdentity({ candidateName: "Loveco", legalName: "loveco GmbH", domain: "loveco-shop.de" }), 80],
    ["KiK", resolveIdentity({ candidateName: "KiK", legalName: "Textilien und Non-Food GmbH", domain: "kik-textilien.com" }), 55],
    ["Bang & Olufsen", resolveIdentity({ candidateName: "Bang & Olufsen", legalName: null, domain: "stores.bang-olufsen.com" }), 80],
    ["FALKE", resolveIdentity({ candidateName: "FALKE", legalName: null, domain: "falke.com" }), 80],
  ];
  const out: string[] = [];
  for (const [name, id, prod] of cases) {
    const v = C(id.confidence, prod, cov(8))!;
    out.push(`${name}:${v}`);
    assert.ok(v >= 45, `${name} must stay a usable lead, got ${v}`);
    assert.notEqual(id.status, "MISMATCH", `${name} must not read as an impostor`);
  }
  record(99, "Genuine firms stay usable", "all >=45", out.join(" "));
});

test("100. A VERIFIED product fit can carry very different confidence", () => {
  const high = C(96, 95, cov(10))!;
  const low = C(55, 80, cov(4))!;
  record(100, "VERIFIED at two confidences", "clearly different", `${low} vs ${high}`);
  assert.ok(high - low >= 20, "the UI must be able to tell these apart — that is why both are shown");
});

// ---------------------------------------------------------------------------

test("CONFIDENCE BENCHMARK REPORT", () => {
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log("\n   #  SCENARIO                                  EXPECTED           ACTUAL");
  console.log("  " + "-".repeat(86));
  for (const r of report.sort((a, b) => a.n - b.n)) {
    console.log(`  ${String(r.n).padStart(3)} ${pad(r.name, 40)}  ${pad(r.expected, 17)}  ${r.actual}`);
  }
  console.log("  " + "-".repeat(86));
  console.log(`  ${report.length} senaryo\n`);
});
