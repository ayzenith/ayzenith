/**
 * AYZENITH LEAD FINDER — Phase 5 bug fixes, regression suite.
 *
 * Every case in this file comes from the Phase 5 read-only audit of the live
 * database. Each one is a REAL row: the company name, the domain and the text
 * are what production actually held, not invented fixtures. The four bugs:
 *
 *   P5-1  A flattened page welded page furniture onto a legal name, and a fixed
 *         three-word window truncated real ones.
 *   P5-2  A term repeated in the site-wide mega-menu counted as evidence found
 *         "all over the site".
 *   P5-3  A differing name declared MISMATCH even with no domain to contradict.
 *   P5-4  A two-or-three-letter brand could never match its own domain.
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  segmentHtml, extractLegalName, cleanLegalName, resolveLegalName,
  legalNameWrite, assessLegalName, looksLikePostalAddress,
} from "../src/server/leads/legalname";
import {
  resolveIdentity,
  resolveProductEvidence,
  repeatedSegments,
  domainRelatesToName,
  compareNames,
  ProductEvidenceLevel,
  type ProductHit,
} from "../src/server/leads/evidence";

// ===========================================================================
// P5-1 — legal name: block boundaries and no truncation
// ===========================================================================

test("P5-1a. kohbau.de — the real name is captured WHOLE, not truncated to a trade word", () => {
  // Live Impressum markup, and the exact bug: the old {1,3}-word window kept
  // "Holz- und Baustoffhandel GmbH" and threw the brand "Kohbau" away.
  const html = `
    <ul><li>Kontakt</li><li>Impressum</li></ul>
    <p><strong>Kohbau Holz- und Baustoffhandel GmbH</strong><br>
    Kirchwerder Elbdeich 141<br>21037 Hamburg</p>`;
  const name = extractLegalName(segmentHtml(html));
  assert.equal(name, "Kohbau Holz- und Baustoffhandel GmbH");
  assert.ok(name!.startsWith("Kohbau"), "the brand token must survive");
});

test("P5-1b. wiedemann.de — four words before the form are all part of the name", () => {
  const html = `<p><strong>WIEDEMANN Dienstleistung und Verwaltung GmbH</strong><br>Wiedemannstraße 1</p>`;
  assert.equal(extractLegalName(segmentHtml(html)), "WIEDEMANN Dienstleistung und Verwaltung GmbH");
});

test("P5-1c. vodafoneshops.info — five words before the form survive", () => {
  const html = `<div>Impressum der</div><p>Vodafone Shops PA Nord GmbH &amp; Co. KG</p>`;
  const name = extractLegalName(segmentHtml(html));
  assert.ok(name!.includes("Vodafone"), `brand token lost: ${name}`);
  assert.ok(name!.includes("PA Nord"), `name truncated: ${name}`);
});

test("P5-1d. nobiliakuechen-berlin.de — a label in its own block never joins the name", () => {
  const html = `<h3>Anschrift</h3><p>KüchenKonzepte Bartkowiak GmbH<br>Rüsternallee 19 f</p>`;
  assert.equal(extractLegalName(segmentHtml(html)), "KüchenKonzepte Bartkowiak GmbH");
});

test("P5-1e. tilly-gmbh.de — a search-widget label never joins the name", () => {
  const html = `<span class="cart">Warenkorb 0</span><label>Suchvorschläge</label><div>Günter Tilly GmbH</div>`;
  assert.equal(extractLegalName(segmentHtml(html)), "Günter Tilly GmbH");
});

test("P5-1f. cunda.de — 'C&A België BV' keeps its brand token", () => {
  const html = `<div>SIÈGE</div><p>C&amp;A België BV<br>Industrieweg 1/A</p>`;
  const name = extractLegalName(segmentHtml(html));
  assert.ok(name!.startsWith("C&A"), `brand clipped to: ${name}`);
});

test("P5-1g. a label and its value inside ONE block still split on the colon", () => {
  const html = `<p>Anschrift: KüchenKonzepte Bartkowiak GmbH</p>`;
  assert.equal(extractLegalName(segmentHtml(html)), "KüchenKonzepte Bartkowiak GmbH");
});

test("P5-1h. a long PROSE block falls back to the narrow window, not the sentence", () => {
  const html = `<p>Diese Website wird betrieben und verantwortet von der Musterfirma GmbH in Berlin.</p>`;
  const name = extractLegalName(segmentHtml(html));
  assert.equal(name, "Musterfirma GmbH");
});

test("P5-1i. block segmentation does not merge two unrelated lines", () => {
  const segs = segmentHtml(`<li>Datenschutz</li><li>Impressum</li><p>Muster Handels GmbH</p>`);
  assert.ok(segs.includes("Muster Handels GmbH"));
  assert.ok(!segs.some((s) => s.includes("Impressum") && s.includes("GmbH")));
});

test("P5-1j. a bare legal form with nothing in front is still not a name", () => {
  assert.equal(extractLegalName(segmentHtml(`<p>GmbH</p>`)), null);
  assert.equal(cleanLegalName("GmbH"), null);
});

test("P5-1k. third-party analytics disclosures are still rejected", () => {
  const html = `<p>Webanalysedienst der Google Inc.</p>`;
  assert.equal(extractLegalName(segmentHtml(html)), null);
});

test("P5-1l. a processor name with a German word in front is rejected too", () => {
  // Both are live regressions caused by the FIRST cut of the block-aware
  // extractor: tidy processor blocks that kept one leading word and so slipped
  // past a check that required EVERY token to be a known platform.
  assert.equal(extractLegalName(segmentHtml(`<h3>Mutterkonzerns Meta Platforms Inc.</h3>`)), null);
  assert.equal(extractLegalName(segmentHtml(`<p>Wir nutzen die Dienste der Facebook Ireland Ltd.</p>`)), null);
});

test("P5-1m. viviry.de — the firm's OWN entity beats a processor disclosure", () => {
  // A privacy page lists the booking tool first and the firm itself further down.
  // Without the domain rule the first candidate won and VIVIRY GmbH was lost.
  const html = `
    <h3>Buchungslösung der Calendly LLC</h3>
    <p>Verantwortliche Stelle: VIVIRY GmbH<br>Musterweg 3</p>`;
  assert.equal(extractLegalName(segmentHtml(html), "viviry.de"), "VIVIRY GmbH");
});

test("P5-1n. with no domain, or no related candidate, the first name is still returned", () => {
  const html = `<p>Erste Handels GmbH</p><p>Zweite Handels GmbH</p>`;
  assert.equal(extractLegalName(segmentHtml(html)), "Erste Handels GmbH");
  assert.equal(extractLegalName(segmentHtml(html), "voellig-anderes.de"), "Erste Handels GmbH");
});

test("P5-1o. the domain rule picks the owner even when it appears late", () => {
  const html = `<p>Hosting durch die Fremdfirma GmbH</p><p>Kohbau Holz- und Baustoffhandel GmbH</p>`;
  assert.equal(extractLegalName(segmentHtml(html), "kohbau.de"), "Kohbau Holz- und Baustoffhandel GmbH");
});

test("P5-1p. the domain rule must NEVER shorten the name it picked", () => {
  // Live regression from an intermediate revision: "lott" matches the domain, so
  // trimming to the matching token dropped the founder's first name.
  const html = `<p>Harry Lott Baustoffe GmbH</p>`;
  assert.equal(extractLegalName(segmentHtml(html), "lott-baustoffe.de"), "Harry Lott Baustoffe GmbH");
});

test("P5-1q. a block repeated site-wide loses to a block that appears once", () => {
  // Consent/plugin vendors are printed on every page; the Impressum body is not.
  const banner = "Einwilligung verwaltet durch die Consentmanager GmbH";
  const segs = [banner, "Muster Handels GmbH", "Musterstraße 1"];
  const chrome = new Set([banner]);
  assert.equal(extractLegalName(segs, null, chrome), "Muster Handels GmbH");
  // Without the chrome hint the first candidate still wins — no silent change.
  assert.equal(extractLegalName(segs, null), banner);
});

test("P5-1r. a site-wide block is still used when it is the ONLY source", () => {
  const footer = "Kleiner Laden GmbH, Hauptstraße 2";
  assert.equal(extractLegalName([footer], null, new Set([footer])), "Kleiner Laden GmbH");
});

// ===========================================================================
// P5-2 — site-wide navigation is not independent product evidence
// ===========================================================================

const NAV = "warnschutz jacken hosen oberbekleidung schuhe unterwäsche sets socken psa";

function daemmisolPages(n: number): string[][] {
  // The live shape: an identical mega-menu block on every page, plus one line of
  // page-specific copy that has nothing to do with underwear.
  return Array.from({ length: n }, (_, i) => [NAV, `dämmisol baustoffhandel seite ${i}`]);
}

test("P5-2a. the repeated mega-menu block is detected as site-wide chrome", () => {
  const chrome = repeatedSegments(daemmisolPages(9));
  assert.ok(chrome.has(NAV), "the nav block must be recognised");
  assert.ok(!chrome.has("dämmisol baustoffhandel seite 0"), "page-specific copy must NOT be");
});

test("P5-2b. two pages are never enough to call something chrome", () => {
  assert.equal(repeatedSegments(daemmisolPages(2)).size, 0);
});

test("P5-2c. a block on a minority of pages is not chrome", () => {
  const pages = [["shared"], ["shared"], ["other"], ["other"], ["other"], ["other"]];
  assert.equal(repeatedSegments(pages).has("shared"), false);
});

test("P5-2d. Dämmisol — a nav-only match is CONTEXTUAL and can never be more", () => {
  const hits: ProductHit[] = Array.from({ length: 9 }, (_, i) => ({
    term: "unterwäsche",
    tier: "strong" as const,
    pageUrl: `https://www.daemmisol.de/p${i}`,
    pageType: i === 0 ? ("HOMEPAGE" as const) : ("OTHER" as const),
    snippet: NAV,
    boilerplate: true,
  }));
  const r = resolveProductEvidence({ hits, crawledPageTypes: hits.map((h) => h.pageType) });
  // NOT dismissed — the words really are on the site, and for a shop the menu is
  // where categories live. But it stops here: never VERIFIED, never HIGH.
  assert.equal(r.level, ProductEvidenceLevel.CONTEXTUAL);
  assert.equal(r.fit, "LIKELY");
  assert.ok(
    r.reasons.some((x) => x.includes("menü")),
    "the reason must SAY the evidence was only the site-wide menu",
  );
});

test("P5-2e. nine repetitions of the menu never promote it to a product claim", () => {
  // Two distinct strong terms, on five pages the crawler even typed as PRODUCT —
  // under the old rule that is two corroborations and a product-page hit.
  const hits: ProductHit[] = ["unterwäsche", "socken"].flatMap((term) =>
    Array.from({ length: 5 }, (_, i) => ({
      term,
      tier: "strong" as const,
      pageUrl: `https://x.de/p${i}`,
      pageType: "PRODUCT" as const,
      snippet: NAV,
      boilerplate: true,
    })),
  );
  const r = resolveProductEvidence({ hits });
  assert.equal(
    r.level, ProductEvidenceLevel.CONTEXTUAL,
    `chrome alone reached ${ProductEvidenceLevel[r.level]} — it must never exceed CONTEXTUAL`,
  );
  assert.notEqual(r.fit, "VERIFIED");
});

test("P5-2h. NO FALSE NEGATIVE — a real textile retailer keeps its category evidence", () => {
  // Loveco / FALKE / KiK: the product term genuinely lives in the shop's menu.
  // The first cut of the chrome rule capped this at WEAK_TEXT and demoted three
  // correct, real customers to "belirsiz". That must not happen again.
  const hits: ProductHit[] = Array.from({ length: 6 }, (_, i) => ({
    term: "unterwäsche",
    tier: "strong" as const,
    pageUrl: `https://loveco-shop.de/p${i}`,
    pageType: i === 0 ? ("HOMEPAGE" as const) : ("OTHER" as const),
    snippet: "damen unterwäsche bio fair",
    boilerplate: true,
  }));
  const r = resolveProductEvidence({ hits });
  assert.equal(r.level, ProductEvidenceLevel.CONTEXTUAL);
  assert.equal(r.fit, "LIKELY", "a genuine retailer must not fall to UNCLEAR over our own rule");
});

test("P5-2i. chrome does not corroborate: two menu terms are still one signal", () => {
  const hits: ProductHit[] = [
    { term: "dessous", tier: "strong", pageUrl: "https://x.de/", pageType: "HOMEPAGE", snippet: NAV, boilerplate: true },
    { term: "unterwäsche", tier: "strong", pageUrl: "https://x.de/a", pageType: "OTHER", snippet: NAV, boilerplate: true },
  ];
  const r = resolveProductEvidence({ hits, osmSpecificShop: true, nameMatchesProduct: true });
  assert.equal(
    r.level, ProductEvidenceLevel.CONTEXTUAL,
    "two independent corroborations must not promote menu-only evidence",
  );
});

test("P5-2f. REGRESSION — page-specific evidence is untouched by the chrome rule", () => {
  const hits: ProductHit[] = [
    { term: "dessous", tier: "strong", pageUrl: "https://x.de/produkte", pageType: "PRODUCT", snippet: "unsere dessous kollektion" },
  ];
  const r = resolveProductEvidence({ hits });
  assert.equal(r.level, ProductEvidenceLevel.PRODUCT_PAGE);
  assert.equal(r.fit, "VERIFIED");
});

test("P5-2g. real content wins even when the same term ALSO sits in the menu", () => {
  const hits: ProductHit[] = [
    { term: "dessous", tier: "strong", pageUrl: "https://x.de/", pageType: "HOMEPAGE", snippet: NAV, boilerplate: true },
    { term: "dessous", tier: "strong", pageUrl: "https://x.de/produkte", pageType: "PRODUCT", snippet: "unsere neue dessous kollektion" },
  ];
  const r = resolveProductEvidence({ hits });
  assert.equal(r.level, ProductEvidenceLevel.PRODUCT_PAGE);
});

// ===========================================================================
// P5-3 — no domain means no contradiction
// ===========================================================================

test("P5-3a. Intimissimi / Calzedonia — a parent-company name with NO domain is UNVERIFIED", () => {
  const r = resolveIdentity({
    candidateName: "Intimissimi",
    legalName: "Calzedonia S.p.A",
    domain: null,
  });
  assert.equal(r.status, "UNVERIFIED", "a brand's parent group is not an impostor");
  assert.notEqual(r.status, "MISMATCH");
  assert.ok(r.reasons.join(" ").includes("alan adı"), "the reason must say WHY it is not a contradiction");
});

test("P5-3b. REGRESSION — a differing name WITH an unrelated domain is still MISMATCH", () => {
  const r = resolveIdentity({
    candidateName: "Expert",
    legalName: "Günter Tilly GmbH",
    domain: "tilly-gmbh.de",
  });
  assert.equal(r.status, "MISMATCH", "the canonical Phase 1 false positive must stay closed");
});

test("P5-3c. REGRESSION — a differing name with an OWNED domain stays PARTIAL", () => {
  const r = resolveIdentity({
    candidateName: "Loveco",
    legalName: "Ecoco GmbH",
    domain: "loveco-shop.de",
  });
  assert.equal(r.status, "PARTIAL");
});

test("P5-3d. MISMATCH still requires a real disagreement, never mere absence", () => {
  const r = resolveIdentity({ candidateName: "Bergmann & Franz", legalName: null, domain: "bfgruppe.de" });
  assert.equal(r.status, "UNVERIFIED");
});

test("P5-3e. Kobau / Kohbau — one letter apart is 'cannot tell', not 'wrong'", () => {
  assert.equal(compareNames("Kobau", "Kohbau Holz- und Baustoffhandel GmbH"), "inconclusive");
  const r = resolveIdentity({
    candidateName: "Kobau",
    legalName: "Kohbau Holz- und Baustoffhandel GmbH",
    domain: "kohbau.de",
  });
  assert.notEqual(r.status, "MISMATCH", "a spelling variant must never be an impostor verdict");
});

test("P5-3f. a near-miss rule that is too loose would be worse — genuinely different names still mismatch", () => {
  assert.equal(compareNames("Expert", "Günter Tilly GmbH"), "mismatch");
  assert.equal(compareNames("Smart Repair", "Shops PA Nord GmbH"), "mismatch");
  // Four-letter words one edit apart are NOT treated as typos.
  assert.equal(compareNames("Bosch", "Busch"), "inconclusive");
  assert.equal(compareNames("Ford", "Fort"), "mismatch");
});

// ===========================================================================
// P5-4 — short brands and their own domains
// ===========================================================================

test("P5-4a. AMR Dachbaustoffe owns amr-shop.de", () => {
  assert.equal(domainRelatesToName("amr-shop.de", "AMR Dachbaustoffe"), true);
});

test("P5-4b. REGRESSION — KiK still owns both of its domains", () => {
  assert.equal(domainRelatesToName("kik.de", "KiK"), true);
  assert.equal(domainRelatesToName("kik-textilien.com", "KiK"), true);
});

test("P5-4c. REGRESSION — the short-brand rule stays strict: C&A does not own carl-anderson.de", () => {
  assert.equal(domainRelatesToName("carl-anderson.de", "C&A"), false);
  assert.equal(domainRelatesToName("cunda.de", "C&A"), false);
});

test("P5-4d. a short token must EQUAL a label, never merely appear inside one", () => {
  // "amr" must not vouch for a domain that merely contains those letters.
  assert.equal(domainRelatesToName("amrita-kosmetik.de", "AMR Dachbaustoffe"), false);
  assert.equal(domainRelatesToName("kikeriki.de", "KiK"), false);
});

test("P5-4e. REGRESSION — long-token substring matching is unchanged", () => {
  assert.equal(domainRelatesToName("loveco-shop.de", "Loveco"), true);
  assert.equal(domainRelatesToName("stores.bang-olufsen.com", "Bang & Olufsen"), true);
  assert.equal(domainRelatesToName("trueffelschwein-shop.de", "Trüffelschwein"), true);
});

test("P5-4f. AMR end to end — its own site no longer reads as unverified", () => {
  const r = resolveIdentity({ candidateName: "AMR Dachbaustoffe", legalName: null, domain: "amr-shop.de" });
  assert.equal(r.status, "PARTIAL");
  assert.ok(r.confidence >= 60);
});

// ===========================================================================
// P5-5 — the statutory legal notice outranks every other disclosure page
// ===========================================================================

test("P5-5a. viviry.de — the legal notice beats the privacy page's booking vendor", () => {
  const sources = [
    { segments: segmentHtml(`<h3>Buchungslösung der Calendly LLC</h3>`), isLegalPage: false },
    { segments: segmentHtml(`<p>VIVIRY GmbH<br>Musterweg 3</p>`), isLegalPage: true },
  ];
  assert.equal(resolveLegalName(sources, "viviry.de"), "VIVIRY GmbH");
});

test("P5-5b. vooberlin.com — Pickware loses to the imprint's Müjdeci GmbH", () => {
  const sources = [
    { segments: segmentHtml(`<p>— Pickware GmbH, Goebelstr. 21, 64293 Darmstadt</p>`), isLegalPage: false },
    { segments: segmentHtml(`<div>IMPRINT</div><div>Müjdeci GmbH</div><div>Oranienstrasse 24,</div>`), isLegalPage: true },
  ];
  assert.equal(resolveLegalName(sources, "vooberlin.com"), "Müjdeci GmbH");
});

test("P5-5c. nobiliakuechen — the hoster on /datenschutz never wins", () => {
  const sources = [
    { segments: segmentHtml(`<h3>Anschrift</h3><p>KüchenKonzepte Bartkowiak GmbH<br>Rüsternallee 19 f<br>12623 Berlin</p>`), isLegalPage: true },
    { segments: segmentHtml(`<p>Hosting: Hetzner Online GmbH</p>`), isLegalPage: false },
  ];
  assert.equal(resolveLegalName(sources, "nobiliakuechen-berlin.de"), "KüchenKonzepte Bartkowiak GmbH");
});

test("P5-5d. widda-berlin.de — a sole trader we cannot parse yields NULL, not a vendor", () => {
  // The real imprint says "WiDDA Inh.: Sabine Kelle" — no legal form at all, so
  // nothing is capturable. The privacy page offers a perfectly formed "Brevo
  // GmbH". Once the statutory page has been READ, a foreign name from elsewhere
  // is a processor, and "we could not establish it" is the honest answer.
  const sources = [
    { segments: segmentHtml(`<p>WiDDA Inh.: Sabine Kelle<br>Gärtnerstr. 24<br>10245 Berlin</p>`), isLegalPage: true },
    { segments: segmentHtml(`<p>Newsletter über die Brevo GmbH</p>`), isLegalPage: false },
  ];
  assert.equal(resolveLegalName(sources, "widda-berlin.de"), null);
});

test("P5-5e. with NO statutory page read, a company-info page is still used", () => {
  // Preserves V3.9: outside Germany there is often no Impressum at all.
  const sources = [
    { segments: segmentHtml(`<p>Chi siamo: Rossi Commerciale S.r.l.</p>`), isLegalPage: false },
  ];
  assert.equal(resolveLegalName(sources, "rossi.it"), "Rossi Commerciale S.r.l.");
});

test("P5-5f. REGRESSION — Dämmisol keeps the group entity from its Impressum", () => {
  const sources = [
    { segments: segmentHtml(`<p>STARK Deutschland GmbH<br>Hanauer Landstraße 150<br>60314 Frankfurt</p>`), isLegalPage: true },
    { segments: segmentHtml(`<p>STARK Deutschland GmbH</p>`), isLegalPage: false },
  ];
  assert.equal(resolveLegalName(sources, "daemmisol.de"), "STARK Deutschland GmbH");
});

test("P5-5g. on the legal page itself, a name that vouches for the domain wins", () => {
  const sources = [
    { segments: segmentHtml(`<p>Hosting durch die Fremdhoster GmbH</p><p>Kohbau Holz- und Baustoffhandel GmbH</p>`), isLegalPage: true },
  ];
  assert.equal(resolveLegalName(sources, "kohbau.de"), "Kohbau Holz- und Baustoffhandel GmbH");
});

// ===========================================================================
// P5-6 — "<label> der GmbH" is a sentence about a company, not a company
// ===========================================================================

test("P5-6a. nobiliakuechen — 'Registergericht der GmbH' is not a name", () => {
  assert.equal(cleanLegalName("Registergericht der GmbH"), null);
});

test("P5-6b. the whole grammatical class, not one word", () => {
  for (const s of [
    "Sitz der GmbH", "Geschäftsführer der AG", "Gesellschafter einer GmbH",
    "Vertretungsberechtigter des e.K.", "les statuts de la SARL", "the articles of the Ltd",
  ]) {
    assert.equal(cleanLegalName(s), null, `should be rejected: ${s}`);
  }
});

test("P5-6c. REGRESSION — real names ending in a NOUN before the form survive", () => {
  for (const s of [
    "Kohbau Holz- und Baustoffhandel GmbH",
    "WIEDEMANN Dienstleistung und Verwaltung GmbH",
    "KiK Textilien und Non-Food GmbH",
    "Harry Lott Baustoffe GmbH",
  ]) {
    assert.equal(cleanLegalName(s), s, `should survive: ${s}`);
  }
});

// ===========================================================================
// P5-7 — an acronym of the other name is not a contradiction
// ===========================================================================

test("P5-7a. DEWEtech / DEINZER + WEYLAND is inconclusive, never MISMATCH", () => {
  assert.equal(compareNames("DEWEtech", "DEINZER + WEYLAND GmbH"), "inconclusive");
  const r = resolveIdentity({
    candidateName: "DEWEtech",
    legalName: "DEINZER + WEYLAND GmbH",
    domain: "deinzer-weyland.de",
  });
  assert.notEqual(r.status, "MISMATCH");
});

test("P5-7b. REGRESSION — the blend rule must not excuse real mismatches", () => {
  assert.equal(compareNames("Expert", "Günter Tilly GmbH"), "mismatch");
  assert.equal(compareNames("Smart Repair", "Shops PA Nord GmbH"), "mismatch");
  assert.equal(compareNames("Küchenhaus Köpenick", "Hetzner Online GmbH"), "mismatch");
  assert.equal(compareNames("Voo", "Pickware GmbH"), "mismatch");
});

test("P5-7c. the blend needs two real openings, not one letter each", () => {
  // "abc" against "Alpha Beta Ceta" must NOT pass: one-letter prefixes only.
  assert.equal(compareNames("ABC", "Alpha Beta Ceta"), "mismatch");
});

test("P5-6d. a preposition before the form is the same class as an article", () => {
  assert.equal(cleanLegalName("Tel. Ladenatelier mit AB"), null);
  assert.equal(cleanLegalName("Zahlung durch die AG"), null);
});

test("P5-6e. REGRESSION — a noun before the form always survives, even after 'für'", () => {
  assert.equal(cleanLegalName("Bank für Sozialwirtschaft AG"), "Bank für Sozialwirtschaft AG");
  assert.equal(
    cleanLegalName("Gesellschaft für Internationale Zusammenarbeit GmbH"),
    "Gesellschaft für Internationale Zusammenarbeit GmbH",
  );
});

test("P5-6f. a capture made only of legal forms and punctuation is not a name", () => {
  assert.equal(cleanLegalName("G.m.b.H. & Co. KG"), null);
  assert.equal(cleanLegalName("& Co. KG"), null);
});

test("P5-6g. leading noise with no letters is dropped, whatever its shape", () => {
  // Live captures: a phone number and a copyright year RANGE in front of a name.
  assert.equal(cleanLegalName("030/ 3996873 Ladenatelier AB"), "Ladenatelier AB");
  assert.equal(cleanLegalName("© 2005-2026 Marktplaats B.V."), "Marktplaats B.V.");
  assert.equal(cleanLegalName("2026 Hunkemöller B.V."), "Hunkemöller B.V.");
});

test("P5-6h. REGRESSION — a name that BEGINS with a number keeps it", () => {
  // "1&1", "3M", "4711" are real. The rule only strips tokens with NO letters,
  // and only while something with letters still follows.
  assert.equal(cleanLegalName("3M Deutschland GmbH"), "3M Deutschland GmbH");
  assert.equal(cleanLegalName("1&1 Telecom GmbH"), "1&1 Telecom GmbH");
});

test("P5-6i. a leading bullet or dash is noise; a digit-bearing brand token is not", () => {
  assert.equal(cleanLegalName("- DEINZER + WEYLAND GmbH"), "DEINZER + WEYLAND GmbH");
  assert.equal(cleanLegalName("• Muster Handels GmbH"), "Muster Handels GmbH");
  assert.equal(cleanLegalName("1&1 Telecom GmbH"), "1&1 Telecom GmbH");
});

// ===========================================================================
// P5-8 — a re-check must be able to CLEAR a legal name, but only when it looked
// ===========================================================================

test("P5-8a. site read, no name found → the stored name is CLEARED", () => {
  assert.equal(legalNameWrite({ legalName: null, websiteStatus: "ACTIVE" }), null);
});

test("P5-8b. site read, a name found → the name is written", () => {
  assert.equal(legalNameWrite({ legalName: "VIVIRY GmbH", websiteStatus: "ACTIVE" }), "VIVIRY GmbH");
});

test("P5-8c. site did NOT answer → the stored value is left ALONE, never erased", () => {
  // The cron retries UNREACHABLE rows. A failed request says nothing about the
  // name we learned on a day the site was up.
  assert.equal(legalNameWrite({ legalName: null, websiteStatus: "UNREACHABLE" }), undefined);
  assert.equal(legalNameWrite({ legalName: null, websiteStatus: null }), undefined);
  assert.equal(legalNameWrite({ legalName: null, websiteStatus: "NONE" }), undefined);
});

// ===========================================================================
// P5-9 — the legal-name QUALITY GATE
// ===========================================================================

const DISCLOSED = { fromLegalPage: true, hasAddressNearby: true };
const MENTIONED = { fromLegalPage: true, hasAddressNearby: false };

test("P5-9a. SHAPE — a copyright line is never a registered name", () => {
  assert.equal(assessLegalName("Copyright © 2022 HexaShop Co., Ltd.", { ...DISCLOSED, domain: "renotti-jeans.de" }).accept, false);
  assert.equal(assessLegalName("Copyright © 2005-2026 Marktplaats B.V.", { ...DISCLOSED, domain: "svline.de" }).accept, false);
  assert.equal(assessLegalName("© 2026 Muster GmbH", { ...DISCLOSED, domain: "x.de" }).accept, false);
});

test("P5-9b. SHAPE — phone / register / postcode digits are not a name", () => {
  assert.equal(assessLegalName("030 3996873 Ladenatelier AB", { ...DISCLOSED, domain: "x.de" }).accept, false);
  assert.equal(assessLegalName("HRB 12345 Muster GmbH", { ...DISCLOSED, domain: "x.de" }).accept, false);
});

test("P5-9c. SHAPE — nothing but legal forms and punctuation", () => {
  assert.equal(assessLegalName("& Co. KG", { ...DISCLOSED, domain: "x.de" }).accept, false);
});

test("P5-9d. ATTRIBUTION — a provider named in passing is rejected", () => {
  // DHL is disclosed on the shipping paragraph, not in the address block.
  assert.equal(assessLegalName("DHL Paket GmbH", { ...MENTIONED, domain: "trueffelschweinberlin.com" }).accept, false);
  // A product in a carousel, and a stocked brand in a category list.
  assert.equal(assessLegalName("Lian Li UNI FAN SL", { ...MENTIONED, domain: "pcservice-direkt.de" }).accept, false);
  assert.equal(assessLegalName("Q-Connect GmbH", { ...MENTIONED, domain: "premium-fachhandel.de" }).accept, false);
});

test("P5-9e. ATTRIBUTION — a name off a non-legal page that does not vouch is rejected", () => {
  const r = assessLegalName("Hetzner Online GmbH", { domain: "nobiliakuechen-berlin.de", fromLegalPage: false, hasAddressNearby: true });
  assert.equal(r.accept, false);
});

test("P5-9f. NO FALSE REJECTS — every real name the audit found is accepted", () => {
  const real: Array<[string, string, typeof DISCLOSED | typeof MENTIONED]> = [
    ["1&1 Telecom GmbH", "1und1.de", DISCLOSED],
    ["Bank für Sozialwirtschaft AG", "sozialbank.de", DISCLOSED],
    ["Gesellschaft für Internationale Zusammenarbeit GmbH", "giz.de", DISCLOSED],
    ["C&A België BV", "c-and-a.com", DISCLOSED],
    ["KiK Textilien und Non-Food GmbH", "kik.de", MENTIONED],       // vouched by domain alone
    ["Kohbau Holz- und Baustoffhandel GmbH", "kohbau.de", MENTIONED], // vouched by domain alone
    ["DEINZER + WEYLAND GmbH", "deinzer-weyland.de", MENTIONED],      // vouched by domain alone
    ["Müjdeci GmbH", "vooberlin.com", DISCLOSED],
    ["VIVIRY GmbH", "viviry.de", MENTIONED],
    ["Michael Teppich e.K.", "tatem.de", DISCLOSED],
    ["STARK Deutschland GmbH", "daemmisol.de", DISCLOSED],
    ["KüchenKonzepte Bartkowiak GmbH", "nobiliakuechen-berlin.de", DISCLOSED],
    ["WIEDEMANN Dienstleistung und Verwaltung GmbH", "wiedemann.de", DISCLOSED],
    ["Harry Lott Baustoffe GmbH", "lott-baustoffe.de", MENTIONED],
  ];
  for (const [name, domain, ctx] of real) {
    const r = assessLegalName(name, { ...ctx, domain });
    assert.equal(r.accept, true, `WRONGLY REJECTED "${name}" on ${domain}: ${r.reason}`);
  }
});

test("P5-9g. a brand/entity split is kept — this is the normal case, not junk", () => {
  // Raab Karcher trades as STARK Deutschland GmbH. The name vouches for nothing
  // and looks foreign, but it is properly disclosed, so it stays.
  const r = assessLegalName("STARK Deutschland GmbH", { domain: "raabkarcher.de", ...DISCLOSED });
  assert.equal(r.accept, true);
});

test("P5-9h. every verdict carries a human-readable reason", () => {
  for (const [name, ctx] of [
    ["Copyright © 2022 X GmbH", DISCLOSED],
    ["DHL Paket GmbH", MENTIONED],
    ["Müjdeci GmbH", DISCLOSED],
  ] as Array<[string, typeof DISCLOSED]>) {
    const r = assessLegalName(name, { ...ctx, domain: "example.de" });
    assert.ok(r.reason.length > 10, `no reason for ${name}`);
  }
});

test("P5-9i. address detection is address grammar, not company vocabulary", () => {
  assert.equal(looksLikePostalAddress("12623 Berlin"), true);
  assert.equal(looksLikePostalAddress("Rüsternallee 19 f"), true);
  assert.equal(looksLikePostalAddress("Oranienstrasse 24,"), true);
  assert.equal(looksLikePostalAddress("Unsere Marken und Partner"), false);
  assert.equal(looksLikePostalAddress("Kopfhörer und Headsets"), false);
});

test("P5-9j. end to end — a product carousel deep in an Impressum page yields nothing", () => {
  // Faithful to the live page: the product strip sits at block 93 of 554, far
  // from the title and with no address anywhere near it.
  const filler = Array.from({ length: 30 }, (_, i) => `<li>Menü ${i}</li>`).join("");
  const sources = [{
    segments: segmentHtml(
      `<h1>PC Service Direkt — Impressum</h1>${filler}` +
      `<ul><li>Lian Li UNI FAN SL</li><li>Corsair RM750</li></ul><p>Inhaber: Max Muster</p>`,
    ),
    isLegalPage: true,
  }];
  assert.equal(resolveLegalName(sources, "pcservice-direkt.de"), null);
});

test("P5-9k. a company named in the page TITLE of a disclosure page is that page's company", () => {
  // Live: bwzonline.de, abwshop.de, coledampfs.de and premium-fachhandel.de
  // print their entity ONLY in the <title>, with no address block at all.
  const filler = Array.from({ length: 40 }, (_, i) => `<li>Menü ${i}</li>`).join("");
  const sources = [{
    segments: segmentHtml(`<h1>Impressum | BWZ Elektronik Vertrieb GmbH</h1>${filler}`),
    isLegalPage: true,
  }];
  assert.equal(resolveLegalName(sources, "bwzonline.de"), "BWZ Elektronik Vertrieb GmbH");
});

test("P5-9l. a registered-trademark mark does not disqualify a real name", () => {
  // Rejecting on ® threw away "IQ Windowfilm by CFC®CarFilmComponents® e.K.",
  // which is the site's own entity. © is a copyright line; ® decorates a brand.
  const r = assessLegalName("IQ Windowfilm by CFC®CarFilmComponents® e.K.", {
    domain: "iq-windowfilm.com", fromLegalPage: true, hasAddressNearby: false, blockIndex: 40,
  });
  assert.equal(r.accept, true);
});
