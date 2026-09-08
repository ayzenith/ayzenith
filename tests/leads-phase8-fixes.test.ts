/**
 * AYZENITH LEAD FINDER — Phase 8 fixes, regression suite.
 *
 * Every case here comes from the controlled 50-row backfill and the 10-firm
 * read-only reachability probe run against the live database. The companies,
 * the numbers and the domains are what production actually held.
 *
 *   P8-1  A lead could be published as QUALIFIED on evidence it did not have.
 *         Apple Store: fit 78, evidence 18%. A Nike outlet: fit 65, evidence 4%,
 *         and it was PROMOTED to QUALIFIED by the backfill.
 *   P8-2  "Site did not answer our bot" was recorded as "site is unreachable".
 *         Three of ten probed firms answered 200 to a browser identity; two more
 *         were behind a WAF. Only five were actually dead.
 *   P8-3  A re-check erased correct legal names on sites with no statutory
 *         disclosure page. OVS S.p.A. and Calzedonia S.p.A were both deleted.
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_LEAD_THRESHOLDS, MIN_CONFIDENCE_FOR_QUALIFIED } from "../src/config/leads";
import { decideLeadStatus, heldBackByEvidence } from "../src/server/leads/status";
import { storedLegalNameValue } from "../src/server/leads/legalname";
import { classifyBlock, retryableAsBrowser } from "../src/server/leads/blocking";
import { fitWhenNoProductEvidence, type NoEvidenceFitInput } from "../src/server/leads/evidence";

const T = DEFAULT_LEAD_THRESHOLDS;

// ---------------------------------------------------------------------------
// P8-1 — the evidence floor on QUALIFIED
// ---------------------------------------------------------------------------

test("P8-1: Apple Store — high fit, thin evidence, must not be QUALIFIED", () => {
  // apple.com, as the live backfill wrote it: leadScore 78, overallConfidence 18.
  const status = decideLeadStatus({
    leadScore: 78, verified: true, overallConfidence: 18, thresholds: T,
  });
  assert.equal(status, "SCREENING");
});

test("P8-1: Nike outlet — 4% evidence must not be promoted to QUALIFIED", () => {
  // "Jordan World of Flight Milan" on nike.com: the backfill moved it from
  // SCREENING to QUALIFIED at leadScore 65 with overallConfidence 4.
  const status = decideLeadStatus({
    leadScore: 65, verified: true, overallConfidence: 4, thresholds: T,
  });
  assert.equal(status, "SCREENING");
});

test("P8-1: the floor is a rule, not a brand list — any firm at 2% is held back", () => {
  // gc-gruppe.de and wiedemann.de, two ordinary German wholesalers, sat at
  // overallConfidence 2 with leadScores of 68 and 69. Nothing about them is
  // recognisable; only the measured evidence is.
  for (const score of [68, 69, 81]) {
    assert.equal(
      decideLeadStatus({ leadScore: score, verified: true, overallConfidence: 2, thresholds: T }),
      "SCREENING",
    );
  }
});

test("P8-1: strong evidence still qualifies", () => {
  // Pinko (pinko.com): fit 82, evidence 55 — comfortably over the floor.
  assert.equal(
    decideLeadStatus({ leadScore: 82, verified: true, overallConfidence: 55, thresholds: T }),
    "QUALIFIED",
  );
});

test("P8-1: the floor is exactly MIN_CONFIDENCE_FOR_QUALIFIED, inclusive", () => {
  const at = decideLeadStatus({
    leadScore: 90, verified: true, overallConfidence: MIN_CONFIDENCE_FOR_QUALIFIED, thresholds: T,
  });
  const below = decideLeadStatus({
    leadScore: 90, verified: true, overallConfidence: MIN_CONFIDENCE_FOR_QUALIFIED - 1, thresholds: T,
  });
  assert.equal(at, "QUALIFIED");
  assert.equal(below, "SCREENING");
});

test("P8-1: an unmeasured row keeps its old verdict rather than being demoted", () => {
  // Rows written before the evidence layer have overallConfidence null. Null
  // means "never measured", not "measured and found wanting" — demoting them
  // would rewrite verdicts on the strength of a number nobody computed.
  assert.equal(
    decideLeadStatus({ leadScore: 90, verified: true, overallConfidence: null, thresholds: T }),
    "QUALIFIED",
  );
});

test("P8-1: the floor does not disturb the other outcomes", () => {
  assert.equal(
    decideLeadStatus({ leadScore: null, verified: true, overallConfidence: 90, thresholds: T }),
    "INSUFFICIENT_DATA",
  );
  assert.equal(
    decideLeadStatus({ leadScore: 90, verified: false, overallConfidence: 90, thresholds: T }),
    "DISCOVERED",
  );
  // Below the suitability threshold it was already SCREENING; evidence is not
  // what decided that, and must not be reported as if it were.
  assert.equal(
    decideLeadStatus({ leadScore: 40, verified: true, overallConfidence: 90, thresholds: T }),
    "SCREENING",
  );
  assert.equal(
    heldBackByEvidence({ leadScore: 40, verified: true, overallConfidence: 90, thresholds: T }),
    false,
  );
  assert.equal(
    heldBackByEvidence({ leadScore: 78, verified: true, overallConfidence: 18, thresholds: T }),
    true,
  );
});

// ---------------------------------------------------------------------------
// P8-2 — refused-as-a-client vs genuinely unreachable
// ---------------------------------------------------------------------------

test("P8-2: a bare 403 is a bot refusal, and earns the browser retry", () => {
  // ullapopken.de and two metro.de branch pages: 403 to the bot, 200 to a
  // browser. Nothing in the body — just the status.
  const kind = classifyBlock(403, "<html><body>Forbidden</body></html>");
  assert.equal(kind, "BOT_REFUSED");
  assert.equal(retryableAsBrowser(kind), true);
});

test("P8-2: a Cloudflare challenge is recognised as a WAF, not as a dead site", () => {
  const kind = classifyBlock(403, `<html><head><title>Just a moment...</title></head>
    <body><div class="cf-browser-verification">Checking your browser before accessing</div></body></html>`);
  assert.equal(kind, "WAF_CHALLENGE");
  assert.equal(retryableAsBrowser(kind), true);
});

test("P8-2: an Akamai refusal is a block", () => {
  // weekday.com answered 403 from AkamaiGHost to both identities.
  assert.equal(classifyBlock(403, "<html><body>Access Denied</body></html>"), "WAF_CHALLENGE");
});

test("P8-2: a rate limit is a block but must NOT be retried under another name", () => {
  const kind = classifyBlock(429, "Too Many Requests");
  assert.equal(kind, "RATE_LIMITED");
  assert.equal(retryableAsBrowser(kind), false);
});

test("P8-2: ordinary HTTP outcomes are not blocks", () => {
  // These say something about the URL, not about us — a 404 really is a dead
  // page, and treating it as a block would resurrect leads that are gone.
  for (const s of [200, 204, 301, 404, 410, 500, 502]) {
    assert.equal(classifyBlock(s, "<html>whatever</html>"), null, `status ${s}`);
  }
});

test("P8-2: a 503 counts as a block only when the body shows a challenge", () => {
  assert.equal(classifyBlock(503, "Service Temporarily Unavailable"), null);
  assert.equal(classifyBlock(503, "<div>cdn-cgi/challenge-platform</div>"), "WAF_CHALLENGE");
});

// ---------------------------------------------------------------------------
// P8-3 — a missing Impressum is not proof that a firm has no legal name
// ---------------------------------------------------------------------------

test("P8-3: OVS S.p.A. survives a re-check of a site with no legal-notice page", () => {
  // ovs.it — an Italian retailer. The site answered and was read; it publishes
  // no Impressum-equivalent the extractor recognises, so it produced no name.
  // The backfill deleted the correct entity captured by an earlier pass.
  const decision = storedLegalNameValue({
    extracted: null,
    siteRead: true,
    legalPageRead: false,
  });
  assert.equal(decision, undefined, "undefined = leave the stored value alone");
});

test("P8-3: Calzedonia S.p.A survives the same way", () => {
  // The Intimissimi rows carried "Calzedonia S.p.A" — the correct parent entity.
  assert.equal(
    storedLegalNameValue({ extracted: undefined, siteRead: true, legalPageRead: false }),
    undefined,
  );
});

test("P8-3: a name found on a legal page is still written", () => {
  assert.equal(
    storedLegalNameValue({ extracted: "KiK Textilien und Non-Food GmbH", siteRead: true, legalPageRead: true }),
    "KiK Textilien und Non-Food GmbH",
  );
});

test("P8-3: junk IS still cleared when the legal page was actually read", () => {
  // The eight German clears in the same run were genuine: "IMPRINT Müjdeci
  // GmbH", "work Logo Hasenecker GmbH" and friends were page furniture welded
  // onto a name. Those sites DO publish an Impressum, we DID read it, and the
  // corrected extractor now finds nothing there — that is evidence of absence.
  assert.equal(
    storedLegalNameValue({ extracted: null, siteRead: true, legalPageRead: true }),
    null,
    "null = erase the stored value",
  );
});

test("P8-3: a site that did not answer never erases anything", () => {
  for (const legalPageRead of [true, false]) {
    assert.equal(
      storedLegalNameValue({ extracted: null, siteRead: false, legalPageRead }),
      undefined,
    );
  }
});

test("P8-3: an extracted name wins even if the flags disagree", () => {
  assert.equal(
    storedLegalNameValue({ extracted: "VIVIRY GmbH", siteRead: true, legalPageRead: false }),
    "VIVIRY GmbH",
  );
});

test("P8-3: whitespace-only extraction is not a name", () => {
  assert.equal(storedLegalNameValue({ extracted: "   ", siteRead: true, legalPageRead: true }), null);
  assert.equal(storedLegalNameValue({ extracted: "   ", siteRead: true, legalPageRead: false }), undefined);
});

// ---------------------------------------------------------------------------
// P8-4 — the verdict must not depend on how many times it has been computed
// ---------------------------------------------------------------------------

/**
 * The bug: `verifyCandidate` read its "discovery" corroborations out of
 * `productFit` / `productFitTier` / `productFitNote` — single mutable columns
 * holding the LATEST verdict. On a re-check it was therefore reading its own
 * previous answer, and the branch for "site read, no product term found" flipped
 * on that answer. Result: a two-cycle.
 *
 * Live chains from the 50-row sample, same code, same cached pages:
 *   AMR Dachbaustoffe   UNCLEAR → NOT_RELEVANT → UNCLEAR
 *   Gutteridge          NOT_RELEVANT → UNCLEAR → NOT_RELEVANT
 * 26 of 50 rows flipped on the second run; 18 landed back on discovery's value.
 * The lead score moved 13 points with each flip.
 */

/** The generation-to-generation step the pipeline used to take: yesterday's
 *  verdict became today's input. If the rule is sound, iterating it is a no-op. */
function iterate(input: NoEvidenceFitInput, generations: number) {
  const seen: string[] = [];
  for (let i = 0; i < generations; i++) seen.push(fitWhenNoProductEvidence(input).fit);
  return seen;
}

test("P8-4: AMR Dachbaustoffe — three generations give one answer", () => {
  // A roofing-materials wholesaler, searched against lingerie terms: no shop
  // tag, no brand fact, name carries no product term. It really is not relevant,
  // and it must say so every time rather than every OTHER time.
  const input: NoEvidenceFitInput = {
    productMatched: true, discovery: null, nameMatchesProduct: false,
  };
  assert.deepEqual(iterate(input, 3), ["NOT_RELEVANT", "NOT_RELEVANT", "NOT_RELEVANT"]);
});

test("P8-4: Gutteridge — three generations give one answer", () => {
  // An Italian menswear retailer; same shape, and it oscillated the opposite way
  // round, which is what made the loop unmistakable.
  const input: NoEvidenceFitInput = {
    productMatched: true, discovery: null, nameMatchesProduct: false,
  };
  assert.deepEqual(iterate(input, 3), ["NOT_RELEVANT", "NOT_RELEVANT", "NOT_RELEVANT"]);
});

test("P8-4: every oscillating row from the live sample is now stable", () => {
  // Humana, PROSOL, Benzo, Viviry, ABEX, the Nike outlet and the Apple Store all
  // flipped in the dry runs. They share one shape — read the site, found nothing,
  // nothing independent vouching for the product — so one case covers them, and
  // the three dry runs after this fix agreed on all 50 rows across 11 fields.
  for (const productMatched of [true, false]) {
    for (const nameMatchesProduct of [true, false]) {
      const input: NoEvidenceFitInput = { productMatched, discovery: null, nameMatchesProduct };
      const [a, b, c] = iterate(input, 3);
      assert.equal(a, b);
      assert.equal(b, c);
    }
  }
});

test("P8-4: an unknown discovery is treated as ABSENT corroboration, not as its opposite", () => {
  const unknown = fitWhenNoProductEvidence({ productMatched: true, discovery: null, nameMatchesProduct: false });
  const absent = fitWhenNoProductEvidence({
    productMatched: true, discovery: { osmSpecificShop: false, brandFactsMatch: false }, nameMatchesProduct: false,
  });
  assert.deepEqual(unknown, absent);
  assert.equal(unknown.fit, "NOT_RELEVANT");
});

test("P8-4: a strong prior keeps the verdict at UNCLEAR rather than disqualifying", () => {
  // One limited crawl finding nothing is OUR gap, not the firm's disqualification,
  // when something independent of the crawl vouches for the product.
  const base = { productMatched: true, nameMatchesProduct: false };
  assert.equal(
    fitWhenNoProductEvidence({ ...base, discovery: { osmSpecificShop: true, brandFactsMatch: false } }).fit,
    "UNCLEAR",
  );
  assert.equal(
    fitWhenNoProductEvidence({ ...base, discovery: { osmSpecificShop: false, brandFactsMatch: true } }).fit,
    "UNCLEAR",
  );
  // The name is the one corroboration that survives a re-check, because it is
  // recomputed from a column no run rewrites.
  assert.equal(
    fitWhenNoProductEvidence({ productMatched: true, discovery: null, nameMatchesProduct: true }).fit,
    "UNCLEAR",
  );
});

test("P8-4: an uncurated product query never disqualifies anyone", () => {
  // Without a curated profile there are no terms worth failing to find, so the
  // absence of them cannot be evidence against the firm.
  assert.equal(
    fitWhenNoProductEvidence({ productMatched: false, discovery: null, nameMatchesProduct: false }).fit,
    "UNCLEAR",
  );
});

test("P8-4: the tier and note always agree with the fit", () => {
  const relevant = fitWhenNoProductEvidence({ productMatched: true, discovery: null, nameMatchesProduct: true });
  const not = fitWhenNoProductEvidence({ productMatched: true, discovery: null, nameMatchesProduct: false });
  assert.equal(relevant.tier, "WEAK");
  assert.equal(not.tier, null);
  assert.match(not.note, /bulunamadı/);
  assert.match(relevant.note, /sınırlı sayfa taramasında/);
});
