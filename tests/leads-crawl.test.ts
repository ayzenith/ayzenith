/**
 * AYZENITH LEAD FINDER — crawl planning benchmark (accuracy Phase 3).
 *
 * The question every case answers: given a homepage, WHICH pages would we
 * spend the 3-subpage budget on, and why. `legacyPlan` restates the ranking
 * these replace — legal 0, privacy 1, contact 2, about 3, product LAST at 4 —
 * so every case reports BEFORE next to AFTER.
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractLinks, rankLinks, planCrawl, scoreLink,
  parseSitemap, parseRobotsSitemaps, rankSitemapUrls,
  canonicalizeUrl, isCrawlableUrl,
  SITEMAP_MAX_CHILDREN,
} from "../src/server/leads/crawl";
import { classifyPageType } from "../src/server/leads/evidence";
import { HIGH_VALUE_PATH_RE, LEGAL_PAGE_RE, COMPANY_INFO_PAGE_RE } from "../src/server/leads/providers/lang";

const PATTERNS = { product: HIGH_VALUE_PATH_RE, legal: LEGAL_PAGE_RE, companyInfo: COMPANY_INFO_PAGE_RE };
const BASE = "https://beispiel.de";

/** The pre-Phase-3 ranking: legal 0, privacy 1, contact 2, other company-info 3,
 *  product 4 — inside a 3-page budget, so product effectively never ran. */
function legacyPlan(links: Array<{ url: string; anchor: string }>, budget = 3): string[] {
  const rank = (u: string) => {
    const p = new URL(u, BASE).pathname;
    if (/impressum|imprint|mentions|note-legali|aviso/i.test(p)) return 0;
    if (/datenschutz|privacy|cookie/i.test(p)) return 1;
    if (/kontakt|contact/i.test(p)) return 2;
    if (/ueber|about|team|unternehmen/i.test(p)) return 3;
    if (HIGH_VALUE_PATH_RE.test(p)) return 4;
    return 99;
  };
  return links
    .filter((l) => rank(l.url) < 99)
    .sort((a, b) => rank(a.url) - rank(b.url))
    .slice(0, budget)
    .map((l) => l.url);
}

const a = (href: string, text = "") => `<a href="${href}">${text}</a>`;
const countProduct = (urls: string[]) =>
  urls.filter((u) => ["PRODUCT", "CATALOG"].includes(classifyPageType(u, BASE, PATTERNS))).length;

const report: Array<{ n: number; name: string; expected: string; before: string; after: string; pass: boolean }> = [];
function record(n: number, name: string, expected: string, before: string, after: string) {
  report.push({ n, name, expected, before, after, pass: after === expected });
}

/** A typical German site: statutory pages plus a real product area. */
const GERMAN_SHOP_HTML = [
  a("/impressum", "Impressum"),
  a("/datenschutz", "Datenschutz"),
  a("/kontakt", "Kontakt"),
  a("/ueber-uns", "Über uns"),
  a("/produkte", "Produkte"),
  a("/sortiment/damenwaesche", "Damenwäsche"),
].join("\n");

// ---------------------------------------------------------------------------
// 49–56 — budget allocation, the core Phase 3 fix
// ---------------------------------------------------------------------------

test("49. THE PHASE 3 FIX — a German site no longer spends the whole budget on disclosures", () => {
  const links = extractLinks(GERMAN_SHOP_HTML, BASE);
  const before = legacyPlan(links);
  const plan = planCrawl({ ranked: rankLinks(links), identityStrong: false, budget: 3 });
  record(49, "German site, identity unproven", "1", String(countProduct(before)), String(countProduct(plan.urls)));
  assert.equal(countProduct(before), 0, "the old ranking reached zero product pages — the measured live failure");
  assert.ok(countProduct(plan.urls) >= 1, "at least one product page must now be reached");
  assert.ok(plan.urls.some((u) => /impressum/.test(u)), "identity is still served");
});

test("50. Identity already proven — budget shifts to product discovery", () => {
  const links = extractLinks(GERMAN_SHOP_HTML, BASE);
  const plan = planCrawl({ ranked: rankLinks(links), identityStrong: true, budget: 3 });
  record(50, "Identity strong → product-led", "2", "0", String(countProduct(plan.urls)));
  assert.equal(plan.identityQuota, 1);
  assert.equal(plan.productQuota, 2);
  assert.ok(countProduct(plan.urls) >= 2);
});

test("51. Identity weak — identity keeps the majority", () => {
  const plan = planCrawl({ ranked: rankLinks(extractLinks(GERMAN_SHOP_HTML, BASE)), identityStrong: false, budget: 3 });
  record(51, "Identity weak → identity-led", "2", "3", String(plan.identityQuota));
  assert.equal(plan.identityQuota, 2, "an unattributable site caps every product claim anyway");
});

test("52. ADAPTIVE — a site with no disclosure links gives those slots to product", () => {
  const html = [a("/produkte", "Produkte"), a("/katalog", "Katalog"), a("/shop", "Shop")].join("\n");
  const plan = planCrawl({ ranked: rankLinks(extractLinks(html, BASE)), identityStrong: false, budget: 3 });
  record(52, "No identity links available", "3", "0", String(countProduct(plan.urls)));
  assert.equal(plan.urls.length, 3, "an unfillable quota must not waste the budget");
});

test("53. ADAPTIVE — a brochure site with no product area still fills up on identity", () => {
  const html = [a("/impressum"), a("/kontakt"), a("/ueber-uns"), a("/team")].join("\n");
  const plan = planCrawl({ ranked: rankLinks(extractLinks(html, BASE)), identityStrong: false, budget: 3 });
  record(53, "No product links available", "3", "3", String(plan.urls.length));
  assert.equal(plan.urls.length, 3);
});

test("54. Budget is never exceeded", () => {
  const html = Array.from({ length: 40 }, (_, i) => a(`/produkte/kat-${i}`, "Produkte")).join("\n");
  const plan = planCrawl({ ranked: rankLinks(extractLinks(html, BASE)), identityStrong: true, budget: 3 });
  record(54, "40 product links offered", "3", "3", String(plan.urls.length));
  assert.equal(plan.urls.length, 3, "discovery is aggressive, the request budget is not");
});

test("55. Guessed conventional paths are the LAST resort, not the first", () => {
  const html = a("/produkte", "Produkte");
  const plan = planCrawl({
    ranked: rankLinks(extractLinks(html, BASE)),
    guessedIdentityUrls: [`${BASE}/impressum`, `${BASE}/kontakt`],
    identityStrong: false,
    budget: 3,
  });
  record(55, "Real link outranks a guess", "yes", "yes", plan.urls[0]!.includes("produkte") ? "yes" : "no");
  assert.ok(plan.urls[0]!.includes("produkte"), "a link the site actually publishes beats a guessed path");
  assert.ok(plan.urls.length === 3, "guesses still fill the remaining slots");
});

test("56. Sitemap is requested ONLY when no product area was found", () => {
  const withProducts = planCrawl({ ranked: rankLinks(extractLinks(GERMAN_SHOP_HTML, BASE)), identityStrong: false, budget: 3 });
  const without = planCrawl({ ranked: rankLinks(extractLinks(a("/impressum"), BASE)), identityStrong: false, budget: 3 });
  record(56, "Sitemap request is conditional", "false/true", "always", `${withProducts.needsSitemap}/${without.needsSitemap}`);
  assert.equal(withProducts.needsSitemap, false, "a working product menu must never cost a sitemap request");
  assert.equal(without.needsSitemap, true);
});

// ---------------------------------------------------------------------------
// 57–64 — link scoring
// ---------------------------------------------------------------------------

test("57. URL path outranks anchor text", () => {
  const realProduct = scoreLink({ url: `${BASE}/produkte`, anchor: "hier klicken" });
  const anchorOnly = scoreLink({ url: `${BASE}/x/y7723`, anchor: "Read more products" });
  record(57, "Path beats marketing copy", "yes", "n/a", realProduct.score > anchorOnly.score ? "yes" : "no");
  assert.ok(realProduct.score > anchorOnly.score);
  assert.equal(anchorOnly.kind, "PRODUCT", "an opaque URL can still be nominated by its anchor…");
  assert.ok(anchorOnly.score < 60, "…but never at a real product path's score");
});

test("58. Junk paths stay junk even with a product anchor", () => {
  const junk = scoreLink({ url: `${BASE}/warenkorb`, anchor: "Unsere Produkte" });
  record(58, "Cart page with product anchor", "0", "0", String(junk.score));
  assert.equal(junk.score, 0, "a shopping cart is not a catalogue whatever the link says");

  // A privacy policy is NOT junk: the GDPR forces it to name the data
  // controller, so it is an identity page of last resort. It must never count
  // as a product page, and must never outrank a real disclosure page.
  const privacy = scoreLink({ url: `${BASE}/datenschutz`, anchor: "Unsere Produkte" });
  const impressum = scoreLink({ url: `${BASE}/impressum`, anchor: "" });
  assert.equal(privacy.kind, "IDENTITY", "privacy names the company — it is identity, not product");
  assert.ok(privacy.score < impressum.score, "…but only ever as a last resort");
});

test("59. B2B/wholesale paths outrank plain product paths", () => {
  const b2b = scoreLink({ url: `${BASE}/haendler`, anchor: "" });
  const prod = scoreLink({ url: `${BASE}/produkte`, anchor: "" });
  record(59, "Wholesale path priority", "yes", "n/a", b2b.score > prod.score ? "yes" : "no");
  assert.ok(b2b.score > prod.score);
});

test("60. Shallower paths win ties", () => {
  const shallow = scoreLink({ url: `${BASE}/produkte`, anchor: "" });
  const deep = scoreLink({ url: `${BASE}/produkte/a/b/c/d`, anchor: "" });
  record(60, "Depth tie-break", "yes", "n/a", shallow.score > deep.score ? "yes" : "no");
  assert.ok(shallow.score > deep.score);
});

test("61. A catalogue PDF is a top candidate; an arbitrary PDF is not", () => {
  const cat = scoreLink({ url: `${BASE}/downloads/produktkatalog-2024.pdf`, anchor: "Katalog" });
  const form = scoreLink({ url: `${BASE}/downloads/widerrufsformular.pdf`, anchor: "Formular" });
  record(61, "PDF catalogue vs PDF form", "PRODUCT/OTHER", "ignored/ignored", `${cat.kind}/${form.kind}`);
  assert.equal(cat.kind, "PRODUCT");
  assert.equal(form.kind, "OTHER");
  assert.equal(classifyPageType(cat.url, BASE, PATTERNS), "CATALOG", "and it classifies as catalogue evidence");
});

test("62. Multilingual product paths are recognised (DE/FR/NL/IT/EN)", () => {
  for (const p of ["/produkte", "/produits", "/producten", "/prodotti", "/products", "/sortiment", "/assortiment", "/catalogo"]) {
    assert.equal(scoreLink({ url: `${BASE}${p}`, anchor: "" }).kind, "PRODUCT", `${p} should be a product path`);
  }
  record(62, "Multilingual product paths", "PRODUCT", "PRODUCT", "PRODUCT");
});

test("63. Locale-prefixed paths still resolve (/en/products)", () => {
  const l = scoreLink({ url: `${BASE}/en/products`, anchor: "" });
  record(63, "Locale-prefixed product path", "PRODUCT", "PRODUCT", l.kind);
  assert.equal(l.kind, "PRODUCT");
});

test("64. Identity paths are typed as identity, not product", () => {
  for (const p of ["/impressum", "/kontakt", "/ueber-uns", "/chi-siamo", "/over-ons"]) {
    assert.equal(scoreLink({ url: `${BASE}${p}`, anchor: "" }).kind, "IDENTITY", p);
  }
  record(64, "Identity path typing", "IDENTITY", "IDENTITY", "IDENTITY");
});

// ---------------------------------------------------------------------------
// 65–72 — URL hygiene and sitemaps
// ---------------------------------------------------------------------------

test("65. Duplicate URLs collapse (www, trailing slash, fragment)", () => {
  const set = new Set([
    canonicalizeUrl("https://www.beispiel.de/produkte/"),
    canonicalizeUrl("https://beispiel.de/produkte"),
    canonicalizeUrl("http://beispiel.de/produkte#top"),
  ]);
  record(65, "Duplicate URL collapsing", "1", "3", String(set.size));
  assert.equal(set.size, 1);
});

test("66. Tracking parameters are stripped before de-duplication", () => {
  const withUtm = canonicalizeUrl("https://beispiel.de/produkte?utm_source=nl&utm_campaign=x");
  const plain = canonicalizeUrl("https://beispiel.de/produkte");
  record(66, "Tracking-param URLs", "same", "different", withUtm === plain ? "same" : "different");
  assert.equal(withUtm, plain);
});

test("67. Real query parameters are preserved", () => {
  const a1 = canonicalizeUrl("https://beispiel.de/shop?kategorie=waesche");
  const a2 = canonicalizeUrl("https://beispiel.de/shop");
  record(67, "Meaningful query preserved", "different", "different", a1 === a2 ? "same" : "different");
  assert.notEqual(a1, a2, "?kategorie= is a different page, unlike ?utm_source=");
});

test("68. External and non-HTML links are refused; PDFs are allowed", () => {
  assert.equal(isCrawlableUrl("https://facebook.com/x", BASE), false);
  assert.equal(isCrawlableUrl("/logo.png", BASE), false);
  assert.equal(isCrawlableUrl("/setup.exe", BASE), false);
  assert.equal(isCrawlableUrl("/katalog.pdf", BASE), true);
  assert.equal(isCrawlableUrl("https://www.beispiel.de/produkte", BASE), true, "www is the same site");
  record(68, "URL hygiene", "OK", "OK", "OK");
});

test("69. Sitemap index yields CHILDREN — the Esotiq case", () => {
  const xml = `<?xml version="1.0"?><sitemapindex xmlns="x">
    <sitemap><loc>https://beispiel.de/media/sitemaps/shops_sitemap.xml</loc></sitemap>
    <sitemap><loc>https://beispiel.de/media/sitemaps/image_sitemap.xml</loc></sitemap>
  </sitemapindex>`;
  const p = parseSitemap(xml);
  record(69, "Sitemap index (Esotiq)", "1 child", "0 (ignored)", `${p.children.length} child`);
  assert.equal(p.urls.length, 0);
  assert.equal(p.children.length, 1, "image sitemaps list assets, not pages — skipped");
  assert.ok(SITEMAP_MAX_CHILDREN >= 1 && SITEMAP_MAX_CHILDREN <= 3, "child following stays bounded");
});

test("70. A plain urlset yields URLs and they are ranked commercially", () => {
  const xml = `<urlset><url><loc>https://beispiel.de/impressum</loc></url>
    <url><loc>https://beispiel.de/produkte/bh</loc></url>
    <url><loc>https://beispiel.de/blog/news-2024</loc></url></urlset>`;
  const parsed = parseSitemap(xml);
  const ranked = rankSitemapUrls(parsed.urls, BASE);
  // Ordering within the shortlist is global by score; the PRODUCT/IDENTITY split
  // is applied afterwards by planCrawl's quotas, so what matters here is that a
  // commercial page is contributed at all and that junk is not.
  const products = ranked.filter((l) => l.kind === "PRODUCT");
  record(70, "Sitemap URL ranking", "1 product, 0 blog", "alphabetical", `${products.length} product, ${ranked.filter((l) => /blog/.test(l.url)).length} blog`);
  assert.equal(products.length, 1, "a 40k-URL sitemap must contribute its commercial pages, not its first N");
  assert.ok(!ranked.some((l) => /blog/.test(l.url)), "blog URLs are not candidates");
});

test("71. robots.txt Sitemap declarations are read", () => {
  const robots = "User-agent: *\nDisallow: /admin\nSitemap: https://beispiel.de/sitemap_index.xml\n";
  const found = parseRobotsSitemaps(robots);
  record(71, "robots.txt sitemap discovery", "1", "0 (not read)", String(found.length));
  assert.deepEqual(found, ["https://beispiel.de/sitemap_index.xml"]);
});

test("72. A missing sitemap is a normal fallback, not an error — the Women'secret case", () => {
  assert.deepEqual(parseSitemap(""), { urls: [], children: [] });
  assert.deepEqual(parseRobotsSitemaps(""), []);
  record(72, "404 / empty sitemap", "empty", "empty", "empty");
});

// ---------------------------------------------------------------------------
// 73–76 — JS navigation, homepage detection, regressions
// ---------------------------------------------------------------------------

test("73. Script-built navigation yields nothing from HTML — sitemap is then the only route", () => {
  const html = `<div id="app"></div><script>renderNav()</script>`;
  const ranked = rankLinks(extractLinks(html, BASE));
  const plan = planCrawl({ ranked, identityStrong: false, budget: 3 });
  record(73, "JS-built nav, no links in HTML", "true", "true", String(plan.needsSitemap));
  assert.equal(ranked.length, 0);
  assert.equal(plan.needsSitemap, true);
});

test("74. Root URL is the homepage regardless of www / protocol", () => {
  for (const u of ["https://www.beispiel.de", "http://beispiel.de/", "https://beispiel.de"]) {
    assert.equal(classifyPageType(u, BASE, PATTERNS), "HOMEPAGE", u);
  }
  record(74, "www/protocol homepage detection", "HOMEPAGE", "OTHER", "HOMEPAGE");
});

test("75. Subdomain-hosted sites are crawlable against their own base", () => {
  const sub = "https://stores.bang-olufsen.com";
  assert.equal(isCrawlableUrl(`${sub}/produkte`, sub), true);
  assert.equal(isCrawlableUrl("https://other.com/produkte", sub), false);
  record(75, "Subdomain base handling", "OK", "OK", "OK");
});

test("76. Anchor text alone never promotes a junk or external link", () => {
  const links = extractLinks(
    [a("https://facebook.com/x", "Unsere Produkte"), a("/agb", "Produkte"), a("/produkte", "")].join("\n"),
    BASE,
  );
  const ranked = rankLinks(links);
  record(76, "Anchor cannot rescue junk/external", "1", "n/a", String(ranked.length));
  assert.equal(ranked.length, 1);
  assert.ok(ranked[0]!.url.endsWith("/produkte"));
});

// ---------------------------------------------------------------------------

test("CRAWL BENCHMARK REPORT", () => {
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log("\n  #  SCENARIO                                  EXPECTED      BEFORE        AFTER         PASS");
  console.log("  " + "-".repeat(96));
  for (const r of report.sort((a2, b2) => a2.n - b2.n)) {
    console.log(
      `  ${String(r.n).padStart(2)} ${pad(r.name, 40)}  ${pad(r.expected, 12)}  ${pad(r.before, 12)}  ${pad(r.after, 12)}  ${r.pass ? "PASS" : "FAIL"}`,
    );
  }
  const failed = report.filter((r) => !r.pass);
  console.log("  " + "-".repeat(96));
  console.log(`  ${report.length} senaryo · ${failed.length} FAIL\n`);
  assert.equal(failed.length, 0, `FAIL: ${failed.map((f) => f.n).join(", ")}`);
});
