/**
 * AYZENITH LEAD FINDER — product-evidence benchmark (accuracy Phase 2).
 *
 * Companion to `leads-accuracy.test.ts`, which covers identity and query
 * tiering. This file covers the 6-level product-evidence engine, page-type
 * weighting, negative signals and company typing.
 *
 * `legacyFit` restates the rule these replace — one strong term on any
 * non-boilerplate page verifies — so every case reports BEFORE next to AFTER.
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveProductEvidence,
  resolveCompanyType,
  findNegativeSignals,
  classifyPageType,
  capProductFitByIdentity,
  resolveIdentity,
  ProductEvidenceLevel,
  PAGE_TYPE_WEIGHT,
  type ProductHit,
  type PageType,
  type ProductFit,
} from "../src/server/leads/evidence";
import { HIGH_VALUE_PATH_RE, LEGAL_PAGE_RE, COMPANY_INFO_PAGE_RE } from "../src/server/leads/providers/lang";

const PATTERNS = { product: HIGH_VALUE_PATH_RE, legal: LEGAL_PAGE_RE, companyInfo: COMPANY_INFO_PAGE_RE };

/** The pre-Phase-2 rule: any strong term outside a LOW_VALUE page verified. */
function legacyFit(hits: ProductHit[]): ProductFit {
  const usable = hits.filter((h) => !["LEGAL", "PRIVACY", "CAREER", "BLOG"].includes(h.pageType));
  if (usable.some((h) => h.tier === "strong")) return "VERIFIED";
  if (usable.some((h) => h.tier === "medium")) return "LIKELY";
  if (usable.some((h) => h.tier === "generic")) return "UNCLEAR";
  return "UNCLEAR";
}

const hit = (term: string, tier: ProductHit["tier"], pageType: PageType, snippet?: string): ProductHit => ({
  term, tier, pageType, pageUrl: `https://x.de/${pageType.toLowerCase()}`, snippet,
});

const report: Array<{ n: number; name: string; expected: string; before: string; after: string; pass: boolean }> = [];
function record(n: number, name: string, expected: string, before: string, after: string) {
  report.push({ n, name, expected, before, after, pass: after === expected });
}

// ---------------------------------------------------------------------------
// 21–30 — where the term was found
// ---------------------------------------------------------------------------

test("21. Real product page — strong term on /produkte verifies", () => {
  const hits = [hit("kopfhorer", "strong", "PRODUCT")];
  const r = resolveProductEvidence({ hits });
  record(21, "Strong term on a product page", "VERIFIED", legacyFit(hits), r.fit);
  assert.equal(r.level, ProductEvidenceLevel.PRODUCT_PAGE);
  assert.equal(r.fit, "VERIFIED");
});

test("22. Catalog / PDF — the strongest single free signal", () => {
  const hits = [hit("kopfhorer", "strong", "CATALOG")];
  const r = resolveProductEvidence({ hits });
  record(22, "Strong term in a catalogue/PDF", "VERIFIED", legacyFit(hits), r.fit);
  assert.equal(r.level, ProductEvidenceLevel.CATALOG);
});

test("23. Homepage only — a good sign, NOT proof", () => {
  const hits = [hit("dessous", "strong", "HOMEPAGE")];
  const r = resolveProductEvidence({ hits });
  record(23, "Strong term on homepage alone", "LIKELY", legacyFit(hits), r.fit);
  assert.equal(r.level, ProductEvidenceLevel.CONTEXTUAL);
  assert.equal(r.fit, "LIKELY", "a homepage mention must no longer verify on its own");
});

test("24. Impressum only — legal boilerplate is not product evidence", () => {
  const hits = [hit("stahl", "strong", "LEGAL")];
  const r = resolveProductEvidence({ hits });
  record(24, "Strong term only in the Impressum", "UNCLEAR", legacyFit(hits), r.fit);
  assert.equal(r.level, ProductEvidenceLevel.NONE, "LEGAL is below the usable weight floor");
});

test("25. Privacy page only — same treatment as legal", () => {
  const hits = [hit("dessous", "strong", "PRIVACY")];
  const r = resolveProductEvidence({ hits });
  record(25, "Strong term only in the privacy policy", "UNCLEAR", legacyFit(hits), r.fit);
  assert.ok(PAGE_TYPE_WEIGHT.PRIVACY < 0.3);
});

test("26. Blog / news mention — talks about it, does not sell it", () => {
  const hits = [hit("kopfhorer", "strong", "BLOG")];
  const r = resolveProductEvidence({ hits });
  record(26, "Product only in a blog/news post", "UNCLEAR", legacyFit(hits), r.fit);
  assert.equal(r.level, ProductEvidenceLevel.NONE);
});

test("27. Career page — a job ad naming the product is not a catalogue", () => {
  const hits = [hit("dessous", "strong", "CAREER")];
  const r = resolveProductEvidence({ hits });
  record(27, "Product only on a careers page", "UNCLEAR", legacyFit(hits), r.fit);
  assert.equal(r.level, ProductEvidenceLevel.NONE);
});

test("28. About page — commercial context, still not a selling page", () => {
  const hits = [hit("dessous", "strong", "ABOUT")];
  const r = resolveProductEvidence({ hits });
  record(28, "Strong term on the about page", "LIKELY", legacyFit(hits), r.fit);
  assert.equal(r.level, ProductEvidenceLevel.CONTEXTUAL);
});

test("29. Contact page — weight below the floor", () => {
  const hits = [hit("dessous", "strong", "CONTACT")];
  const r = resolveProductEvidence({ hits });
  record(29, "Strong term only on the contact page", "UNCLEAR", legacyFit(hits), r.fit);
  assert.ok(PAGE_TYPE_WEIGHT.CONTACT < 0.3);
});

test("30. Team page — weak for product, kept for identity", () => {
  const hits = [hit("dessous", "strong", "TEAM")];
  const r = resolveProductEvidence({ hits });
  record(30, "Strong term on a team page", "LIKELY", legacyFit(hits), r.fit);
  assert.equal(PAGE_TYPE_WEIGHT.TEAM, 0.3, "team pages stay usable — just barely");
});

// ---------------------------------------------------------------------------
// 31–36 — corroboration, so precision does not eat recall
// ---------------------------------------------------------------------------

test("31. Small real shop — homepage term + OSM shop tag + own name verifies", () => {
  // "Anna Dessous", OSM shop=lingerie, "Dessous" on the homepage, no /produkte.
  const hits = [hit("dessous", "strong", "HOMEPAGE")];
  const r = resolveProductEvidence({ hits, osmSpecificShop: true, nameMatchesProduct: true });
  record(31, "Real shop, 2 independent corroborations", "VERIFIED", legacyFit(hits), r.fit);
  assert.equal(r.fit, "VERIFIED", "precision must not cost a genuine specialist shop its verdict");
});

test("32. We READ a product page and the term was not on it — 1 corroboration is not enough", () => {
  const hits = [hit("dessous", "strong", "HOMEPAGE")];
  const r = resolveProductEvidence({ hits, osmSpecificShop: true, crawledPageTypes: ["HOMEPAGE", "PRODUCT"] });
  record(32, "Product page read, term absent there", "LIKELY", legacyFit(hits), r.fit);
  assert.equal(r.fit, "LIKELY", "silence on a page we actually opened is evidence");
});

test("32b. We never OPENED a product page — the firm is not marked down for our crawl gap", () => {
  const hits = [hit("dessous", "strong", "HOMEPAGE")];
  const r = resolveProductEvidence({ hits, osmSpecificShop: true, crawledPageTypes: ["HOMEPAGE", "LEGAL", "CONTACT"] });
  record(322, "No product page crawled at all", "VERIFIED", legacyFit(hits), r.fit);
  assert.equal(r.fit, "VERIFIED", "a gap in OUR crawling must never read as evidence against the firm");
});

test("33. Product page + corroboration reaches the top level", () => {
  const hits = [hit("kopfhorer", "strong", "PRODUCT")];
  const r = resolveProductEvidence({ hits, osmSpecificShop: true });
  record(33, "Product page + corroboration", "VERIFIED", legacyFit(hits), r.fit);
  assert.equal(r.level, ProductEvidenceLevel.STRONG_COMMERCIAL);
  assert.equal(r.confidence, 95);
});

test("34. Two distinct strong terms count as corroboration", () => {
  const hits = [hit("dessous", "strong", "HOMEPAGE"), hit("damenwasche", "strong", "HOMEPAGE")];
  const r = resolveProductEvidence({ hits, nameMatchesProduct: true });
  record(34, "Two distinct strong terms + name", "VERIFIED", legacyFit(hits), r.fit);
  assert.equal(r.fit, "VERIFIED");
});

test("35. Repeating ONE term is not corroboration", () => {
  const hits = [
    hit("dessous", "strong", "HOMEPAGE"),
    hit("dessous", "strong", "ABOUT"),
    hit("dessous", "strong", "TEAM"),
  ];
  const r = resolveProductEvidence({ hits });
  record(35, "Same term repeated on 3 weak pages", "LIKELY", legacyFit(hits), r.fit);
  assert.equal(r.fit, "LIKELY", "counting occurrences rewards long sites, not real sellers");
});

test("36. Medium term on a product page is contextual, not proof", () => {
  const hits = [hit("unterwasche", "medium", "PRODUCT")];
  const r = resolveProductEvidence({ hits });
  record(36, "Category-level term on a product page", "LIKELY", legacyFit(hits), r.fit);
  assert.equal(r.level, ProductEvidenceLevel.CONTEXTUAL);
});

// ---------------------------------------------------------------------------
// 37–42 — negative signals and company type
// ---------------------------------------------------------------------------

test("37. 'kein Vertrieb' caps a product-page match", () => {
  const hits = [hit("kopfhorer", "strong", "PRODUCT", "wir sind hersteller, kein vertrieb an endkunden")];
  const negatives = findNegativeSignals(hits[0]!.snippet!);
  const r = resolveProductEvidence({ hits, negatives });
  record(37, "Product page + 'kein Vertrieb'", "UNCLEAR", legacyFit(hits), r.fit);
  assert.ok(negatives.length > 0);
  assert.equal(r.fit, "UNCLEAR");
});

test("38. 'nur Hersteller' softens but does not erase", () => {
  const hits = [hit("kopfhorer", "strong", "PRODUCT", "nur hersteller")];
  const negatives = findNegativeSignals(hits[0]!.snippet!);
  const r = resolveProductEvidence({ hits, negatives });
  record(38, "Product page + 'nur Hersteller'", "LIKELY", legacyFit(hits), r.fit);
  assert.equal(r.fit, "LIKELY");
});

test("39. Discontinued product is not a current catalogue entry", () => {
  const hits = [hit("kopfhorer", "strong", "CATALOG", "dieses modell ist nicht mehr im sortiment")];
  const negatives = findNegativeSignals(hits[0]!.snippet!);
  const r = resolveProductEvidence({ hits, negatives });
  record(39, "Catalogue entry marked discontinued", "UNCLEAR", legacyFit(hits), r.fit);
  assert.equal(r.fit, "UNCLEAR");
});

test("40. Law firm is typed as a service business, not a wholesaler", () => {
  const r = resolveCompanyType(["wholesaler"], "Wir sind eine Rechtsanwaltskanzlei in Berlin");
  record(40, "Law firm carrying an OSM wholesale tag", "SERVICE", "WHOLESALER", r.type);
  assert.equal(r.type, "SERVICE");
});

test("41. Wholesaler with NO product evidence stays UNKNOWN on product", () => {
  // The live "akıllı gözlük" failure: shop=trade → wholesaler → 100/100 role.
  const ct = resolveCompanyType(["wholesaler"], "Stahlhandel und Baustoffe");
  const r = resolveProductEvidence({ hits: [] });
  record(41, "Wholesaler, zero product evidence", "UNCLEAR", "UNCLEAR", r.fit);
  assert.equal(ct.type, "WHOLESALER", "commercial role is still reported…");
  assert.equal(r.level, ProductEvidenceLevel.NONE, "…but it is not product evidence");
});

test("42. Association is recognised rather than typed as a shop", () => {
  const r = resolveCompanyType(["specialty_store"], "Bundesverband für Textilhandel e.V.");
  record(42, "Trade association", "ASSOCIATION", "RETAILER", r.type);
  assert.equal(r.type, "ASSOCIATION");
});

// ---------------------------------------------------------------------------
// 43–48 — page classification and Phase 1 identity regressions
// ---------------------------------------------------------------------------

test("43. Page classification — product, catalog, blog, legal", () => {
  const base = "https://x.de";
  const t = (u: string) => classifyPageType(u, base, PATTERNS);
  assert.equal(t("https://x.de"), "HOMEPAGE");
  assert.equal(t("https://x.de/produkte/kopfhoerer"), "PRODUCT");
  assert.equal(t("https://x.de/downloads/preisliste.pdf"), "CATALOG");
  assert.equal(t("https://x.de/blog/neue-kopfhoerer"), "BLOG");
  assert.equal(t("https://x.de/impressum"), "LEGAL");
  assert.equal(t("https://x.de/datenschutz"), "PRIVACY");
  record(43, "Page type classification", "OK", "3-state", "OK");
});

test("44. A blog post under a product path is still a blog post", () => {
  // Precedence guard: getting this backwards turns "written about" into "sells".
  const p = classifyPageType("https://x.de/blog/produkte-2024", "https://x.de", PATTERNS);
  record(44, "/blog/produkte-2024 precedence", "BLOG", "PRODUCT", p);
  assert.equal(p, "BLOG");
});

test("45. REGRESSION — Bang & Olufsen on a subdomain stays attributable", () => {
  const r = resolveIdentity({ candidateName: "Bang & Olufsen", legalName: null, domain: "stores.bang-olufsen.com" });
  record(45, "Subdomain-hosted brand", "PARTIAL", "UNVERIFIED", r.status);
  assert.equal(r.status, "PARTIAL");
});

test("46. REGRESSION — KiK on its hyphenated own domain", () => {
  const r = resolveIdentity({ candidateName: "KiK", legalName: "Textilien und Non-Food GmbH", domain: "kik-textilien.com" });
  record(46, "Short brand, hyphenated domain", "PARTIAL", "MISMATCH", r.status);
  assert.equal(r.status, "PARTIAL", "the brand-stripping extractor bug must not demote KiK");
});

test("47. REGRESSION — C&A / cunda.de still caps to LIKELY", () => {
  const id = resolveIdentity({ candidateName: "C&A", legalName: null, domain: "cunda.de" });
  const capped = capProductFitByIdentity("VERIFIED", id.status);
  record(47, "C&A → cunda.de", "LIKELY", "VERIFIED", capped);
  assert.equal(capped, "LIKELY");
});

test("48. REGRESSION — group-company sites stay flagged", () => {
  for (const [name, legal, domain] of [
    ["Expert", "Suchvorschläge Günter Tilly GmbH", "tilly-gmbh.de"],
    ["THB-Technic House Berlin GmbH", "by CFC CarFilmComponents e.K.", "iq-windowfilm.com"],
    ["ABEX", "GC Großhandels Contor GmbH", "gc-gruppe.de"],
    ["Peter Hellmich OHG", "Dienstleistung und Verwaltung GmbH", "wiedemann.de"],
  ] as const) {
    const r = resolveIdentity({ candidateName: name, legalName: legal, domain });
    assert.equal(r.status, "MISMATCH", `${name} should still read as unattributable`);
  }
  record(48, "Group/franchise sites (4 live cases)", "MISMATCH", "UNVERIFIED", "MISMATCH");
});

// ---------------------------------------------------------------------------

test("EVIDENCE BENCHMARK REPORT", () => {
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
