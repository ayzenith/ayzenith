import "server-only";

import { cachedLeadFetch } from "../cache";

/**
 * AYZENITH LEAD FINDER — brand facts from Wikidata (§V3.11, free).
 *
 * THE GAP THIS CLOSES. OpenStreetMap tags a chain outlet with what KIND of shop it
 * is, never with what it sells. In a Milano search for kadın iç giyim, Intimissimi,
 * Yamamay, Tezenis, Calzedonia, Goldenpoint, Victoria's Secret and Agent
 * Provocateur all arrived as plain `shop=clothes` — indistinguishable from Zara,
 * so every one of them sat at "ürün uyumu belirsiz" while the search was for
 * exactly what they sell.
 *
 * The obvious fix is a hand-written brand list, and it is the wrong one: it would
 * need a new list for every product category we ever search, maintained forever.
 *
 * OSM already carries `brand:wikidata` on those outlets, and Wikidata states what
 * a company produces (P1056) and what industry it operates in (P452). Measured on
 * Milano before writing this: 38% of clothing shops carry the tag, and it resolved
 * all eight lingerie chains correctly — Intimissimi → "lingerie, undergarment",
 * Yamamay → "lingerie", Tezenis → "lingerie, undergarment". Free, no key, and
 * nothing to maintain.
 *
 * Honesty: Wikidata is a third-party public database, not the firm's own
 * statement, so a match here is a real product signal but never "Doğrulandı" —
 * it lands at the same tier as a specific OSM shop tag, and the firm's own website
 * remains the only thing that can verify. Absence of a Wikidata entry is recorded
 * as nothing at all, never as a negative.
 */

export type BrandFacts = {
  qid: string;
  label: string;
  /** Labels of P1056 "product or material produced" — what the brand makes/sells. */
  produces: string[];
  /** Labels of P452 "industry" — includes explicit wholesale/B2B classifications. */
  industry: string[];
};

/** Wikidata's own wording for a B2B wholesale industry, e.g. Calzedonia's
 *  "Wholesale trade (business-to-business) of clothing and footwear". A firm that
 *  Wikidata classifies this way is a supplier, which is exactly what a B2B search
 *  is looking for. */
const WHOLESALE_INDUSTRY_RE = /wholesale|business-to-business|\bb2b\b|grossist|ingrosso|mayorista/i;

export function isWholesaleIndustry(facts: BrandFacts): boolean {
  return facts.industry.some((i) => WHOLESALE_INDUSTRY_RE.test(i));
}

/** How many brand ids to ask for in one request. Wikidata's documented limit for
 *  wbgetentities is 50 for anonymous callers; 45 leaves headroom. */
const BATCH = 45;

/** Brand facts change on the scale of years, so this is cached hard — the point of
 *  the lookup is to avoid paying for it on every search. */
const TTL_DAYS = 90;

/** Upper bound per search. A city rarely has more than a few dozen distinct
 *  chains, and this keeps a pathological result set from turning into a crawl. */
const MAX_BRANDS = 150;

const QID_RE = /^Q\d+$/;

type Snak = { mainsnak?: { datavalue?: { value?: { id?: string } } } };
type Entity = { labels?: Record<string, { value: string }>; claims?: Record<string, Snak[]> };

function claimIds(e: Entity, prop: string): string[] {
  return (e.claims?.[prop] ?? [])
    .map((c) => c.mainsnak?.datavalue?.value?.id)
    .filter((id): id is string => Boolean(id && QID_RE.test(id)));
}

function labelOf(e: Entity | undefined): string {
  if (!e?.labels) return "";
  for (const lang of ["en", "it", "de", "fr", "es", "tr"]) {
    const v = e.labels[lang]?.value;
    if (v) return v;
  }
  return Object.values(e.labels)[0]?.value ?? "";
}

/** One cached wbgetentities call. The cache key is the sorted id list, so the same
 *  set of brands re-uses the same row across searches and re-runs. */
async function fetchEntities(ids: string[]): Promise<Record<string, Entity>> {
  const sorted = [...ids].sort();
  const url =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json` +
    `&languages=en%7Cit%7Cde%7Cfr%7Ces%7Ctr&props=labels%7Cclaims&ids=${sorted.join("%7C")}`;
  try {
    const res = await cachedLeadFetch({
      provider: "wikidata",
      query: { ids: sorted.join(",") },
      url,
      parse: (t) => JSON.parse(t) as { entities?: Record<string, Entity> },
      timeoutMs: 20_000,
      ttlDays: TTL_DAYS,
      // Refuse to cache a response that carried no entities — a transient empty
      // answer must not be served for 90 days (the same rule discovery learned).
      validate: (p) => Object.keys((p as { entities?: object }).entities ?? {}).length > 0,
    });
    return (res.payload as { entities?: Record<string, Entity> })?.entities ?? {};
  } catch {
    return {};
  }
}

/**
 * Resolve OSM `brand:wikidata` ids to what those brands actually sell.
 *
 * Two rounds, because Wikidata answers in ids: the first resolves the brands and
 * collects the concept ids they point at, the second turns those concepts into
 * readable labels ("lingerie", "undergarment"). Everything is cached, so a repeat
 * search pays nothing.
 */
export async function resolveBrandFacts(qids: string[]): Promise<Map<string, BrandFacts>> {
  const out = new Map<string, BrandFacts>();
  const unique = Array.from(new Set(qids.filter((q) => QID_RE.test(q)))).slice(0, MAX_BRANDS);
  if (unique.length === 0) return out;

  // Round 1 — the brands themselves.
  const brands: Record<string, Entity> = {};
  for (let i = 0; i < unique.length; i += BATCH) {
    Object.assign(brands, await fetchEntities(unique.slice(i, i + BATCH)));
  }

  const conceptIds = new Set<string>();
  const raw = new Map<string, { label: string; produces: string[]; industry: string[] }>();
  for (const qid of unique) {
    const e = brands[qid];
    if (!e) continue;
    const produces = claimIds(e, "P1056");
    const industry = claimIds(e, "P452");
    if (produces.length === 0 && industry.length === 0) continue;
    produces.forEach((c) => conceptIds.add(c));
    industry.forEach((c) => conceptIds.add(c));
    raw.set(qid, { label: labelOf(e), produces, industry });
  }
  if (raw.size === 0) return out;

  // Round 2 — the concepts those claims point at.
  const concepts: Record<string, Entity> = {};
  const conceptList = Array.from(conceptIds);
  for (let i = 0; i < conceptList.length; i += BATCH) {
    Object.assign(concepts, await fetchEntities(conceptList.slice(i, i + BATCH)));
  }

  for (const [qid, r] of raw) {
    const toLabels = (ids: string[]) => ids.map((id) => labelOf(concepts[id])).filter(Boolean);
    out.set(qid, {
      qid,
      label: r.label,
      produces: toLabels(r.produces),
      industry: toLabels(r.industry),
    });
  }
  return out;
}
