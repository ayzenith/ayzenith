import "server-only";

import { cachedLeadFetch } from "../cache";
import { MAJOR_CITIES, CITY_EXPANSION_CAP, MAX_DISCOVERY_QUERIES } from "@/config/leads";
import { type LeadCandidate } from "./types";

/**
 * AYZENITH LEAD FINDER — OpenStreetMap / Overpass provider (free workhorse, V2.1).
 *
 * QUERY EXPANSION. A natural-language product ("kadın iç giyim") is never sent to
 * OSM as free text. It is expanded into several DISTINCT, meaningful Overpass
 * queries (query "groups"), each run per discovery target (a city, or the country
 * area as a fallback) and each LOGGED with its status + raw result count:
 *
 *   • shop-tag group  — real OSM `shop=` values for the product
 *     (lingerie|clothes|fashion|boutique …)
 *   • name-match group — shops whose NAME contains a local-language product term
 *     (Dessous, Lingerie, Damenwäsche …)
 *   • B2B group        — wholesalers marked as such in OSM (shop=wholesale|trade),
 *     only for the B2B model. Shopfront-less importers/distributors are NOT
 *     reachable this way; see the measured evidence in buildGroups.
 *
 * RELIABILITY (from the earlier fix, kept): city expansion when no city is given,
 * resilient fetch (retry + mirror + 429 backoff), server-timeout `remark`
 * detection, and — critically — empty results are NEVER cached, so a transient
 * empty can't poison the cache and make every later search return 0.
 *
 * The result carries an explicit status (OK / PARTIAL / FAILED), per-query counts
 * and the full query log, so the UI can prove expansion ran and distinguish "the
 * source answered and found nothing" from "the source could not be reached".
 */

const ENDPOINTS: Array<{ url: string; timeoutMs: number }> = [
  { url: "https://overpass-api.de/api/interpreter", timeoutMs: 22_000 },
  { url: "https://overpass.kumi.systems/api/interpreter", timeoutMs: 22_000 },
];

const SERVER_TIMEOUT = 20; // Overpass [timeout:N] seconds
const PER_QUERY_LIMIT = 150;
const PACING_MS = 1_500; // gap between queries to respect rate limits
const CACHE_VERSION = "2"; // bump to bypass any previously poisoned cache entries

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements?: OverpassElement[]; remark?: string };

/** One executed discovery query, surfaced in the UI (§4). */
export type OsmQueryLog = {
  label: string;
  target: string;
  provider: "overpass";
  status: "ok" | "failed";
  rawResults: number;
  error?: string;
};

export type OsmDiscovery = {
  status: "OK" | "PARTIAL" | "FAILED";
  candidates: LeadCandidate[];
  queriesRun: number;
  queriesOk: number;
  queriesFailed: number;
  rawResults: number;
  queries: OsmQueryLog[];
  errors: string[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function esc(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}
/** Escape regex metacharacters in a term used inside an Overpass ~"(...)" match. */
function reEsc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidPayload(payload: unknown): boolean {
  const p = (payload ?? {}) as OverpassResponse;
  const empty = !Array.isArray(p.elements) || p.elements.length === 0;
  if (p.remark && empty) return false; // server-side timeout → soft failure
  return true;
}
/** Never cache an empty result (prevents transient-empty cache poisoning). */
function hasResults(payload: unknown): boolean {
  const p = (payload ?? {}) as OverpassResponse;
  return Array.isArray(p.elements) && p.elements.length > 0;
}

type Target = { kind: "city" | "country"; value: string };

// Small connector words that stay lowercase inside a multi-word city name so a
// normalised value matches OSM exactly (e.g. "Frankfurt am Main", "Den Haag").
const CITY_CONNECTORS = new Set(["am", "an", "der", "den", "de", "la", "le", "les", "du", "di", "del", "al", "auf", "im", "in", "ob", "vor", "zur", "zum"]);

/** Normalise a user-typed city to OSM's proper casing so the FAST exact `=` area
 *  match works: OSM's `name` tag is cased ("Berlin", "München"), but users type
 *  "berlin". A case-insensitive regex on area names is far too heavy (full scan →
 *  timeout), so we normalise the input instead and keep the indexed `=` match. */
export function normalizeCity(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLocaleLowerCase("de");
      if (i > 0 && CITY_CONNECTORS.has(lower)) return lower;
      return w.charAt(0).toLocaleUpperCase("de") + w.slice(1).toLocaleLowerCase("de");
    })
    .join(" ");
}

function areaLine(target: Target): string {
  return target.kind === "city"
    ? `area["name"="${esc(normalizeCity(target.value))}"]["boundary"="administrative"]->.a;`
    : `area["ISO3166-1"="${esc(target.value)}"][admin_level=2]->.a;`;
}

type QueryGroup = { key: string; label: string; clauses: string[] };

/** Build the expansion plan (the query groups) for a product + business model. */
function buildGroups(shops: string[], nameTerms: string[], model: string): QueryGroup[] {
  const groups: QueryGroup[] = [];

  const shopAlt = shops.map(esc).join("|");
  groups.push({
    key: "shop",
    label: `Mağaza etiketleri (${shops.slice(0, 4).join(", ")})`,
    clauses: [`nwr["shop"~"^(${shopAlt})$"](area.a);`],
  });

  const terms = Array.from(new Set(nameTerms.map((t) => t.trim()).filter((t) => t.length >= 4)))
    .slice(0, 10)
    .map(reEsc);
  if (terms.length > 0) {
    groups.push({
      key: "name",
      label: `İsim eşleşmesi (${nameTerms.filter((t) => t.length >= 4).slice(0, 4).join(", ")}…)`,
      clauses: [`nwr["shop"]["name"~"(${terms.join("|")})",i](area.a);`],
    });
  }

  if (model !== "B2C") {
    // Light B2B signal: OSM `shop=wholesale`/`trade`.
    groups.push({
      key: "b2b",
      label: "Toptan / B2B (Großhandel, wholesale)",
      clauses: [`nwr["shop"~"^(wholesale|trade)$"](area.a);`],
    });

    // NOT ADDED — an office-name group for shopfront-less importers/distributors.
    // Tried and measured against live Overpass (Berlin, §V3.3); it cannot work,
    // and the numbers are recorded here so it is not attempted a third time:
    //
    //   nwr["office"]["name"~"(Großhandel|Import|Vertrieb…)"]  → TIMES OUT (~73s,
    //     0 results). The regex must be evaluated over every office in the area.
    //   nwr["office"="company"]["name"~"(same terms)"]         → fast (9s) but
    //     returns 0: the indexed lookup works, the DATA simply is not there.
    //   nwr["office"="company"] in Berlin                      → 1445 records,
    //     none of whose names contain a commercial-role word. OSM names offices
    //     after the COMPANY ("Siemens AG"), not after what it does.
    //
    // So a pure wholesaler is genuinely not discoverable from OSM tags: telling
    // those 1445 offices apart would mean fetching 1445 websites. This is the
    // free-source ceiling, stated honestly rather than papered over with a query
    // that costs time and finds nothing. Reaching these firms needs a different
    // free source (public business registers/directories), not a better query.
  }

  return groups;
}

function buildQuery(target: Target, clauses: string[]): string {
  return [
    `[out:json][timeout:${SERVER_TIMEOUT}];`,
    areaLine(target),
    `(`,
    ...clauses.map((c) => `  ${c}`),
    `);`,
    `out center tags ${PER_QUERY_LIMIT};`,
  ].join("\n");
}

/** How long to wait for the primary before ALSO asking the mirror (§V3.6).
 *  Short enough that a stalled primary stops dominating the run, long enough
 *  that a healthy one answers first and the mirror is never troubled at all. */
const HEDGE_MS = 7_000;

async function askEndpoint(
  endpoint: { url: string; timeoutMs: number },
  ql: string,
  queryKey: Record<string, string | number>,
): Promise<OverpassElement[]> {
  const res = await cachedLeadFetch({
    provider: "overpass",
    query: { ...queryKey, v: CACHE_VERSION },
    url: endpoint.url,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(ql)}`,
    timeoutMs: endpoint.timeoutMs,
    validate: isValidPayload,
    shouldCache: hasResults,
  });
  const payload = (res.payload ?? {}) as OverpassResponse;
  return Array.isArray(payload.elements) ? payload.elements : [];
}

/**
 * Ask Overpass, HEDGING to the mirror instead of waiting out the primary.
 *
 * The old ladder was strictly serial — two attempts against the primary, then
 * the mirror — so a single busy primary cost ~60s before the mirror was even
 * tried, and a failing query dominated the whole discovery phase. Today the
 * public instance answered "the server is probably too busy" while the mirror
 * served the same query fine, which is precisely the case the ladder handled
 * worst.
 *
 * Now the mirror is started only if the primary has not answered within
 * HEDGE_MS, and the first success wins. A healthy primary still answers alone,
 * so this does not double the load on a free community resource in the normal
 * case; it only stops one slow host from setting the pace.
 */
async function fetchOverpass(
  ql: string,
  queryKey: Record<string, string | number>,
  /** Which endpoint LEADS for this query. Discovery rotates it across jobs so
   *  concurrent queries spread over both hosts instead of queueing behind one
   *  (§V3.6) — that is what lets the whole group run at once without any single
   *  instance seeing more than its slot allowance. */
  preferIndex = 0,
): Promise<OverpassElement[]> {
  const primary = ENDPOINTS[preferIndex % ENDPOINTS.length];
  const mirror = ENDPOINTS[(preferIndex + 1) % ENDPOINTS.length];
  if (!primary) throw new Error("Overpass uç noktası tanımlı değil");

  let settled = false;
  const errors: string[] = [];

  const primaryCall = askEndpoint(primary, ql, queryKey).then(
    (r) => { settled = true; return r; },
    (e) => { errors.push(`birincil: ${(e as Error).message}`); throw e; },
  );

  if (!mirror || mirror === primary) return primaryCall;

  const mirrorCall = (async () => {
    await sleep(HEDGE_MS);
    // The primary already won — never trouble the mirror.
    if (settled) return new Promise<OverpassElement[]>(() => {});
    try {
      const r = await askEndpoint(mirror, ql, queryKey);
      settled = true;
      return r;
    } catch (e) {
      errors.push(`ayna: ${(e as Error).message}`);
      throw e;
    }
  })();

  try {
    // First SUCCESS wins; rejects only if both fail.
    return await Promise.any([primaryCall, mirrorCall]);
  } catch {
    // One more try on the mirror after a backoff: it proved the more willing of
    // the two, and a lost query means lost coverage, not just a slower run.
    await sleep(/429|too busy/i.test(errors.join(" ")) ? 3_500 : 1_500);
    try {
      return await askEndpoint(mirror, ql, queryKey);
    } catch (e) {
      errors.push(`ayna (2): ${(e as Error).message}`);
      throw new Error(errors.join(" | "));
    }
  }
}

function composeAddress(tags: Record<string, string>): string | undefined {
  const parts = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ").trim();
  return parts || undefined;
}

function toCandidate(el: OverpassElement, countryLabel: string, fallbackCity: string | undefined): LeadCandidate | null {
  const tags = el.tags ?? {};
  const name = (tags.name || tags.brand || "").trim();
  if (!name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const roleHints: string[] = [];
  if (tags.shop) roleHints.push(`shop=${tags.shop}`);
  if (tags.office) roleHints.push(`office=${tags.office}`);
  return {
    name,
    website: tags.website || tags["contact:website"] || undefined,
    phone: tags.phone || tags["contact:phone"] || undefined,
    email: tags.email || tags["contact:email"] || undefined,
    country: countryLabel,
    city: tags["addr:city"] || fallbackCity || undefined,
    address: composeAddress(tags),
    postalCode: tags["addr:postcode"] || undefined,
    latitude: typeof lat === "number" ? lat : undefined,
    longitude: typeof lon === "number" ? lon : undefined,
    roleHints,
    rawType: tags.shop ?? tags.office ?? undefined,
    discoveredVia: "OSM",
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    sourceLabel: `OpenStreetMap — ${fallbackCity || countryLabel}`,
  };
}

export async function discoverOsm(opts: {
  countryIso: string;
  countryLabel: string;
  city?: string;
  shops: string[];
  nameTerms?: string[];
  businessModel?: string;
}): Promise<OsmDiscovery> {
  const shops = Array.from(new Set(opts.shops.filter(Boolean)));
  const errors: string[] = [];
  if (shops.length === 0) {
    return { status: "FAILED", candidates: [], queriesRun: 0, queriesOk: 0, queriesFailed: 0, rawResults: 0, queries: [], errors: ["OSM: sorgulanacak mağaza türü yok."] };
  }

  const groups = buildGroups(shops, opts.nameTerms ?? [], opts.businessModel ?? "B2B");

  // Targets: given city → that city; else major cities; else country area.
  let targets: Target[];
  if (opts.city) {
    targets = [{ kind: "city", value: opts.city }];
  } else {
    const cities = MAJOR_CITIES[opts.countryIso] ?? [];
    targets = cities.length > 0
      ? cities.slice(0, CITY_EXPANSION_CAP).map((c) => ({ kind: "city" as const, value: c }))
      : [{ kind: "country", value: opts.countryIso }];
  }
  // Bound the total fan-out (targets × groups) to the query budget.
  const maxTargets = Math.max(1, Math.floor(MAX_DISCOVERY_QUERIES / groups.length));
  if (targets.length > maxTargets) targets = targets.slice(0, maxTargets);

  // Build the full (target × group) job list.
  const jobs: Array<{ target: Target; group: QueryGroup }> = [];
  for (const target of targets) for (const group of groups) jobs.push({ target, group });

  // Queries run with BOUNDED CONCURRENCY rather than one after another (§V3.6).
  //
  // They used to be strictly sequential with a 1.5s gap between them, so a city
  // search paid the full latency of every group in turn — measured at ~68s of a
  // 110s pipeline, its single largest cost once the database save was fixed.
  // Nothing about them is ordered: each group is an independent question about
  // the same area.
  //
  // Concurrency is 3 rather than 2 because each job also ROTATES which endpoint
  // leads (see fetchOverpass's preferIndex): job 0 leads on the primary, job 1 on
  // the mirror, job 2 on the primary again. A public Overpass instance allots
  // only a couple of slots per IP, so this is what lets a whole group run at once
  // without any single host being asked for more than it will give. Raising it
  // further without widening the endpoint list would buy 429s, not answers. The
  // pacing gap is kept as a stagger before each start so a burst never arrives as
  // a thundering herd.
  //
  // Merging the groups into one unioned query would be faster still, and is
  // deliberately NOT done: it was tried before and tipped big-city queries into
  // timeout, and PER_QUERY_LIMIT applies per query, so one union would return
  // 150 results total where three queries return up to 150 each.
  const OSM_CONCURRENCY = 3;

  // Indexed slots keep the query log and candidate order deterministic even
  // though the jobs finish out of order.
  const slots: Array<{ log: OsmQueryLog; cands: LeadCandidate[]; error?: string }> = new Array(jobs.length);

  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(OSM_CONCURRENCY, jobs.length) }, async (_unused, worker) => {
      // Stagger the workers' first requests so both slots are not claimed in the
      // same instant.
      if (worker > 0) await sleep(PACING_MS);
      while (cursor < jobs.length) {
        const i = cursor++;
        const { target, group } = jobs[i]!;
        const label = `${group.label} · ${target.value}`;
        const ql = buildQuery(target, group.clauses);
        try {
          const elements = await fetchOverpass(ql, {
            iso: opts.countryIso,
            target: target.value,
            kind: target.kind,
            group: group.key,
            shops: shops.join(","),
          }, i);
          const cityLabel = target.kind === "city" ? normalizeCity(target.value) : undefined;
          const cands: LeadCandidate[] = [];
          for (const el of elements) {
            const cand = toCandidate(el, opts.countryLabel, cityLabel);
            if (cand) cands.push(cand);
          }
          slots[i] = {
            log: { label, target: target.value, provider: "overpass", status: "ok", rawResults: elements.length },
            cands,
          };
        } catch (e) {
          const msg = (e as Error).message;
          slots[i] = {
            log: { label, target: target.value, provider: "overpass", status: "failed", rawResults: 0, error: msg },
            cands: [],
            error: `OSM sorgusu başarısız (${label}): ${msg}`,
          };
        }
      }
    }),
  );

  const candidates: LeadCandidate[] = [];
  const queries: OsmQueryLog[] = [];
  let queriesOk = 0, queriesFailed = 0, rawResults = 0;
  for (const slot of slots) {
    if (!slot) continue;
    queries.push(slot.log);
    if (slot.log.status === "ok") {
      queriesOk++;
      rawResults += slot.log.rawResults;
      candidates.push(...slot.cands);
    } else {
      queriesFailed++;
      if (slot.error) errors.push(slot.error);
    }
  }

  const status: OsmDiscovery["status"] =
    queriesOk === 0 ? "FAILED" : queriesFailed > 0 ? "PARTIAL" : "OK";

  return {
    status,
    candidates,
    queriesRun: jobs.length,
    queriesOk,
    queriesFailed,
    rawResults,
    queries,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Chain scale (§V3.5) — how many outlets a BRAND has across the whole country.
// ---------------------------------------------------------------------------

/** Endpoints for the chain-scale query. It is far heavier than a discovery
 *  query (it scans a whole country) so it gets its own, much longer budget —
 *  measured at ~82s for six brands. The mirror leads because the main public
 *  instance rejects a request this size more often. */
const SCALE_ENDPOINTS: Array<{ url: string; timeoutMs: number }> = [
  { url: "https://overpass.kumi.systems/api/interpreter", timeoutMs: 110_000 },
  { url: "https://overpass-api.de/api/interpreter", timeoutMs: 100_000 },
];

/** Count a chain's outlets per brand, country-wide, in ONE query.
 *
 * A search only ever sees the branches inside the searched city, so a national
 * chain and a single shop look identical — "Berlin'de 1 şube" is true of both
 * NKD (1101 outlets in Germany) and a corner boutique. This closes that gap.
 *
 * Deliberately keyed on OSM's `brand` tag rather than `name`: `brand` is what
 * mappers put on chain outlets, so a hit is real evidence of a chain. A brand
 * that returns NOTHING is NOT a firm with zero shops — it is a firm OSM does not
 * record as a chain, and callers must treat the absence as "not measured", never
 * as a count of 0.
 *
 * The response is reduced to per-brand counts BEFORE caching, so the cache row
 * holds a handful of numbers instead of the ~1.5 MB of tags they came from.
 */
export async function countBrandOutlets(
  countryIso: string,
  brands: string[],
): Promise<Record<string, number>> {
  const wanted = Array.from(new Set(brands.map((b) => b.trim()).filter((b) => b.length >= 2))).slice(0, 30);
  if (wanted.length === 0) return {};

  const alt = wanted.map(reEsc).join("|");
  const ql = [
    `[out:json][timeout:120];`,
    `area["ISO3166-1"="${esc(countryIso)}"][admin_level=2]->.a;`,
    `nwr["brand"~"^(${alt})$"](area.a);`,
    `out tags;`,
  ].join("\n");

  // Fold the elements down to { brand: count } at PARSE time so that is all the
  // shared cache ever stores.
  const parse = (text: string): Record<string, number> => {
    const payload = JSON.parse(text) as OverpassResponse;
    const counts: Record<string, number> = {};
    for (const el of payload.elements ?? []) {
      const brand = el.tags?.brand;
      if (brand) counts[brand] = (counts[brand] ?? 0) + 1;
    }
    return counts;
  };

  let lastErr = "bilinmeyen hata";
  for (const endpoint of SCALE_ENDPOINTS) {
    try {
      const res = await cachedLeadFetch({
        provider: "overpass",
        query: { scale: countryIso, brands: wanted.slice().sort().join("|"), v: CACHE_VERSION },
        url: endpoint.url,
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(ql)}`,
        timeoutMs: endpoint.timeoutMs,
        parse,
        // An empty result may be a real "none of these are chains" OR a busy
        // server; never cache it, so a transient refusal cannot freeze a firm's
        // scale as unknown for 30 days.
        shouldCache: (p) => Object.keys((p ?? {}) as object).length > 0,
      });
      return (res.payload ?? {}) as Record<string, number>;
    } catch (e) {
      lastErr = (e as Error).message;
      await sleep(2_000);
    }
  }
  throw new Error(lastErr);
}
