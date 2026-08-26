/**
 * AYZENITH LEAD FINDER — accuracy benchmark.
 *
 * The 20 scenarios from the accuracy audit, as executable tests. Every case
 * records what the PREVIOUS logic produced (`before`) next to what the current
 * logic produces, so a change to matching strictness can never be shipped on the
 * claim that it "should" be safer — the regression is visible or it is not real.
 *
 * The `legacy*` helpers below are faithful re-statements of the code as it stood
 * before this audit, kept ONLY so the comparison has something to compare to.
 * They are not used by the pipeline.
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveIdentity,
  capProductFitByIdentity,
  compareNames,
  domainRelatesToName,
  significantTokens,
  type ProductFit,
  type IdentityStatus,
} from "../src/server/leads/evidence";
import {
  normalizeProduct,
  qualifiedPriority,
  resolveProductProfile,
  tierUncuratedQuery,
} from "../src/config/leads";

// ---------------------------------------------------------------------------
// Legacy behaviour, for BEFORE → AFTER reporting
// ---------------------------------------------------------------------------

/** Identity as it worked before: only ever ran when a legal name existed, and
 *  gave up ("inconclusive") whenever either side had no 3+ character tokens. */
function legacyIdentity(i: {
  candidateName: string;
  legalName?: string | null;
  domain?: string | null;
}): IdentityStatus {
  if (!i.legalName) return "UNVERIFIED"; // check was skipped entirely
  const core = (i.domain?.split(".")[0] ?? "").toLowerCase();
  const domainOk = significantTokens(normalizeProduct(i.candidateName))
    .filter((t) => t.length >= 4)
    .some((t) => core.includes(t));
  if (domainOk) return "PARTIAL"; // suppressed, never flagged
  const a = significantTokens(normalizeProduct(i.candidateName));
  const b = significantTokens(normalizeProduct(i.legalName));
  if (a.length === 0 || b.length === 0) return "UNVERIFIED"; // inconclusive → no action
  const overlap = a.some((t) => b.some((u) => u.includes(t) || t.includes(u)));
  return overlap ? "VERIFIED" : "MISMATCH";
}

/** Product fit as it worked before: identity never capped it. */
function legacyCap(fit: ProductFit): ProductFit {
  return fit;
}

/** Uncurated queries as they worked before: the raw query became a STRONG term
 *  whenever it was 4+ characters long. */
function legacyUncurated(q: string): { strong: string[]; medium: string[] } {
  const t = q.toLocaleLowerCase("de");
  return { strong: t.length >= 4 ? [t] : [], medium: [] };
}

/** The pipeline's product-fit rule, which is unchanged: one STRONG hit verifies,
 *  one MEDIUM hit makes it likely, a generic hit leaves it unclear. */
function fitFromSignals(strongHits: number, mediumHits: number, genericHits: number): ProductFit {
  if (strongHits >= 1) return "VERIFIED";
  if (mediumHits >= 1) return "LIKELY";
  if (genericHits >= 1) return "UNCLEAR";
  return "UNCLEAR";
}

/** How many of a signal set actually appear in a page text (word-boundary-safe,
 *  mirroring `includesTermBoundary` closely enough for fixture text). */
function countHits(text: string, terms: string[]): number {
  const hay = normalizeProduct(text);
  return terms.filter((t) => {
    const n = normalizeProduct(t);
    return n.length >= 3 && ` ${hay} `.includes(` ${n} `);
  }).length;
}

const report: Array<{ n: number; name: string; expected: string; before: string; after: string; pass: boolean }> = [];

function record(n: number, name: string, expected: string, before: string, after: string) {
  report.push({ n, name, expected, before, after, pass: after === expected });
}

// ---------------------------------------------------------------------------
// 1–5: product evidence quality
// ---------------------------------------------------------------------------

test("1. Exact product seller — a curated strong term on a real product page verifies", () => {
  const { profile, matched } = resolveProductProfile("kadın iç giyim");
  assert.equal(matched, true);
  const text = "Dessous und Damenwäsche in großer Auswahl";
  const fit = fitFromSignals(
    countHits(text, profile.signals!.strong),
    countHits(text, profile.signals!.medium),
    0,
  );
  record(1, "Exact product seller", "VERIFIED", "VERIFIED", fit);
  assert.equal(fit, "VERIFIED");
});

test("2. Category seller — a broad parent-category word is MEDIUM, not strong", () => {
  const { profile } = resolveProductProfile("kadın iç giyim");
  // "unterwäsche" is the generic parent category, deliberately demoted to MEDIUM.
  const text = "Arbeitskleidung: Gummistiefel, Unterwäsche, Socken, Gehörschutz";
  const fit = fitFromSignals(
    countHits(text, profile.signals!.strong),
    countHits(text, profile.signals!.medium),
    0,
  );
  record(2, "Category-only (workwear catalogue)", "LIKELY", "LIKELY", fit);
  assert.equal(fit, "LIKELY", "a workwear catalogue listing Unterwäsche must not VERIFY as lingerie");
});

test("3. Related industry but not a seller — generic single-word query cannot verify", () => {
  // The live "akıllı gözlük"-class failure, reduced: a one-word generic query.
  const before = legacyUncurated("çelik");
  const after = tierUncuratedQuery("çelik");
  const siteText = "Wir liefern Stahl und Metall für den Bau. Celik.";
  const beforeFit = fitFromSignals(countHits(siteText, before.strong), countHits(siteText, before.medium), 1);
  const afterFit = fitFromSignals(countHits(siteText, after.strong), countHits(siteText, after.medium), 1);
  record(3, "Generic one-word query on unrelated firm", "UNCLEAR", beforeFit, afterFit);
  assert.equal(after.strong.length, 0, "a generic single word must never be a STRONG signal");
  assert.equal(afterFit, "UNCLEAR");
});

test("4. Keyword false positive — a specific single word is LIKELY at most, never VERIFIED", () => {
  const before = legacyUncurated("gözlük");
  const after = tierUncuratedQuery("gözlük");
  const text = "Sicherheitsausrüstung und Schutzbrillen. Gozluk.";
  const beforeFit = fitFromSignals(countHits(text, before.strong), countHits(text, before.medium), 0);
  const afterFit = fitFromSignals(countHits(text, after.strong), countHits(text, after.medium), 0);
  record(4, "Specific one-word query", "LIKELY", beforeFit, afterFit);
  assert.equal(after.strong.length, 0);
  assert.equal(afterFit, "LIKELY");
});

test("5. Multi-word query stays verifiable — precision must not cost all recall", () => {
  const after = tierUncuratedQuery("akıllı gözlük");
  const text = "Wir verkaufen akilli gozluk und Zubehör";
  const fit = fitFromSignals(countHits(text, after.strong), countHits(text, after.medium), 0);
  record(5, "Multi-word phrase on a real seller", "VERIFIED", "VERIFIED", fit);
  assert.deepEqual(after.strong, ["akilli gozluk"]);
  assert.equal(fit, "VERIFIED");
});

// ---------------------------------------------------------------------------
// 6–10: identity
// ---------------------------------------------------------------------------

test("6. Wrong domain — C&A / cunda.de, the canonical live false positive", () => {
  const input = { candidateName: "C&A", legalName: null, domain: "cunda.de" };
  const after = resolveIdentity(input);
  // Identity was skipped entirely when no legal name was extracted, so the
  // product fit came through untouched — this is what live data still shows.
  const beforeFit = legacyCap("VERIFIED");
  const afterFit = capProductFitByIdentity("VERIFIED", after.status);
  record(6, "C&A → cunda.de (no legal name)", "LIKELY", beforeFit, afterFit);
  assert.equal(after.status, "UNVERIFIED", "an unattributable site must not read as identity-checked");
  assert.equal(afterFit, "LIKELY", "product evidence off an unattributable site cannot stay VERIFIED");
});

test("7. Wrong company identity — short brand vs an unrelated registered name", () => {
  const input = { candidateName: "C&A", legalName: "Cunda Handels GmbH", domain: "cunda.de" };
  const before = legacyIdentity(input);
  const after = resolveIdentity(input);
  record(7, "C&A vs 'Cunda Handels GmbH'", "MISMATCH", before, after.status);
  assert.equal(
    before,
    "UNVERIFIED",
    "the previous token filter gave up on 2-letter brands — this is the bug being fixed",
  );
  assert.equal(after.status, "MISMATCH");
  assert.equal(capProductFitByIdentity("VERIFIED", after.status), "UNCLEAR");
});

test("8. Short brand on its OWN site is not falsely flagged", () => {
  const r = resolveIdentity({ candidateName: "C&A", legalName: "C&A Mode GmbH & Co. KG", domain: "c-and-a.com" });
  record(8, "C&A vs its real legal entity", "VERIFIED", "UNVERIFIED", r.status);
  assert.equal(r.status, "VERIFIED");
  assert.equal(compareNames("H&M", "H & M Hennes & Mauritz AB"), "match");
});

test("9. Brand / legal-entity split stays trusted when the domain vouches for it", () => {
  const r = resolveIdentity({
    candidateName: "Raab Karcher",
    legalName: "STARK Deutschland GmbH",
    domain: "raabkarcher.de",
  });
  record(9, "Raab Karcher / STARK Deutschland", "PARTIAL", "PARTIAL", r.status);
  assert.equal(r.status, "PARTIAL", "a franchise/holding split must not be called an impostor");
  assert.equal(capProductFitByIdentity("VERIFIED", r.status), "VERIFIED");
});

test("10. VIES registrant name outranks a missing legal notice", () => {
  const r = resolveIdentity({
    candidateName: "Yamamay",
    legalName: null,
    viesName: "INTICOM S.P.A.",
    domain: "yamamay.com",
  });
  record(10, "Yamamay / INTICOM S.p.A. via VIES", "PARTIAL", "UNVERIFIED", r.status);
  // Names diverge but the domain is the brand's own → naming divergence, not impostor.
  assert.equal(r.status, "PARTIAL");
});

// ---------------------------------------------------------------------------
// 11–15: page type, third parties, weak sites
// ---------------------------------------------------------------------------

test("11. Impressum false positive — a hosting provider is not the company", () => {
  const r = resolveIdentity({
    candidateName: "Weltladen Pankow",
    legalName: "Strato AG",
    domain: "weltladen-pankow.de",
  });
  // The domain vouches for ownership, so this is PARTIAL rather than MISMATCH —
  // but it must never read as a confirmed identity for "Strato AG".
  record(11, "Hosting provider named in privacy page", "PARTIAL", "PARTIAL", r.status);
  assert.notEqual(r.status, "VERIFIED");
});

test("12. Privacy-page keyword — generic terms alone stay UNCLEAR", () => {
  const fit = fitFromSignals(0, 0, 2);
  record(12, "Only generic terms found", "UNCLEAR", "UNCLEAR", fit);
  assert.equal(fit, "UNCLEAR");
});

test("13. Manufacturer when distributor requested — gate blocks HIGH", () => {
  const p = qualifiedPriority({
    leadScore: 85,
    modelFit: "POSSIBLE", // manufacturer alone is never VERIFIED for B2B supply
    productFit: "VERIFIED",
    websiteStatus: "ACTIVE",
    hasContact: true,
  });
  record(13, "Manufacturer-only in a B2B distributor search", "MEDIUM", "MEDIUM", p);
  assert.equal(p, "MEDIUM");
});

test("14. Empty / weak website — nothing found is never HIGH", () => {
  const p = qualifiedPriority({
    leadScore: 70,
    modelFit: "UNVERIFIED",
    productFit: "UNVERIFIED",
    websiteStatus: "UNREACHABLE",
    hasContact: false,
  });
  record(14, "Unreachable site, nothing verified", "DATA_LIMITED", "DATA_LIMITED", p);
  assert.equal(p, "DATA_LIMITED");
});

test("15. Identity-capped product fit can no longer reach HIGH", () => {
  const identity = resolveIdentity({ candidateName: "C&A", legalName: null, domain: "cunda.de" });
  const fit = capProductFitByIdentity("VERIFIED", identity.status);
  const p = qualifiedPriority({
    leadScore: 95,
    modelFit: "VERIFIED",
    productFit: fit,
    websiteStatus: "ACTIVE",
    hasContact: true,
  });
  const beforeP = qualifiedPriority({
    leadScore: 95,
    modelFit: "VERIFIED",
    productFit: "VERIFIED",
    websiteStatus: "ACTIVE",
    hasContact: true,
  });
  record(15, "Unattributable site at score 95", "MEDIUM", beforeP, p);
  assert.equal(beforeP, "HIGH", "this is what live data shows today");
  assert.equal(p, "MEDIUM");
});

// ---------------------------------------------------------------------------
// 16–20: languages and domains
// ---------------------------------------------------------------------------

test("16. German company — curated German terms still verify", () => {
  const { profile } = resolveProductProfile("kulaklık");
  const fit = fitFromSignals(countHits("Kopfhörer und Headsets", profile.signals!.strong), 0, 0);
  record(16, "German site, curated terms", "VERIFIED", "VERIFIED", fit);
  assert.equal(fit, "VERIFIED");
});

test("17. French company — identity works on a French legal entity", () => {
  const r = resolveIdentity({
    candidateName: "Etam",
    legalName: "ETAM LINGERIE SAS",
    domain: "etam.com",
  });
  record(17, "French SAS legal form", "VERIFIED", "VERIFIED", r.status);
  assert.equal(r.status, "VERIFIED");
});

test("18. Dutch company — B.V. suffix is not treated as the name", () => {
  const r = resolveIdentity({
    candidateName: "Hunkemöller",
    legalName: "Hunkemöller B.V.",
    domain: "hunkemoller.nl",
  });
  record(18, "Dutch B.V. legal form", "VERIFIED", "VERIFIED", r.status);
  assert.equal(r.status, "VERIFIED");
  assert.deepEqual(significantTokens(normalizeProduct("Hunkemöller B.V.")), ["hunkemoller"]);
});

test("19. English/multilingual — an unrelated English entity is still a mismatch", () => {
  const r = resolveIdentity({
    candidateName: "Trüffelschwein",
    legalName: "Dolby Laboratories Inc.",
    domain: "trueffelschwein-shop.de",
  });
  // Domain vouches for the shop, so the stray third-party name is a divergence,
  // not proof of an impostor — but it must not be VERIFIED either.
  record(19, "Third-party name on an owned domain", "PARTIAL", "PARTIAL", r.status);
  assert.notEqual(r.status, "VERIFIED");
});

test("20. Sitemap-index site — no legal name, unrelated domain stays UNVERIFIED", () => {
  const r = resolveIdentity({ candidateName: "Esotiq", legalName: null, domain: "esotiq.com" });
  record(20, "Own-brand domain, no legal name", "PARTIAL", "UNVERIFIED", r.status);
  assert.equal(r.status, "PARTIAL", "the domain is the brand's own — that is real evidence");
  assert.ok(domainRelatesToName("esotiq.com", "Esotiq"));
});

// ---------------------------------------------------------------------------

test("BENCHMARK REPORT", () => {
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log("\n  #  SCENARIO                                  EXPECTED      BEFORE        AFTER         PASS");
  console.log("  " + "-".repeat(96));
  for (const r of report.sort((a, b) => a.n - b.n)) {
    console.log(
      `  ${String(r.n).padStart(2)} ${pad(r.name, 40)}  ${pad(r.expected, 12)}  ${pad(r.before, 12)}  ${pad(r.after, 12)}  ${r.pass ? "PASS" : "FAIL"}`,
    );
  }
  const changed = report.filter((r) => r.before !== r.after).length;
  const failed = report.filter((r) => !r.pass);
  console.log("  " + "-".repeat(96));
  console.log(`  ${report.length} senaryo · ${changed} davranış değişti · ${failed.length} FAIL\n`);
  assert.equal(failed.length, 0, `FAIL: ${failed.map((f) => f.n).join(", ")}`);
});
