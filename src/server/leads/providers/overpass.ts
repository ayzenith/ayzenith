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
 *   • B2B group        — wholesalers/importers/distributors (shop=wholesale +
 *     office=company whose name states it), only for the B2B model
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

const ENDPOINTS: Array<{ url: string; attempts: number; timeoutMs: number }> = [
  { url: "https://overpass-api.de/api/interpreter", attempts: 2, timeoutMs: 22_000 },
  { url: "https://overpass.kumi.systems/api/interpreter", attempts: 1, timeoutMs: 15_000 },
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
    // Light B2B signal: OSM `shop=wholesale`/`trade`. (An `office=company` name
    // regex over a whole city is far too heavy for the public instance — it
    // reliably times out — so it is intentionally omitted; free-source B2B
    // discovery stays a known limitation, surfaced honestly rather than faked.)
    groups.push({
      key: "b2b",
      label: "Toptan / B2B (Großhandel, wholesale)",
      clauses: [`nwr["shop"~"^(wholesale|trade)$"](area.a);`],
    });
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

async function fetchOverpass(ql: string, queryKey: Record<string, string | number>): Promise<OverpassElement[]> {
  let lastErr = "bilinmeyen hata";
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 0; attempt < endpoint.attempts; attempt++) {
      try {
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
      } catch (e) {
        lastErr = (e as Error).message;
        const isLast = endpoint === ENDPOINTS[ENDPOINTS.length - 1] && attempt === endpoint.attempts - 1;
        if (isLast) break;
        await sleep(/429/.test(lastErr) ? 3_500 : 1_500);
      }
    }
  }
  throw new Error(lastErr);
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

  const candidates: LeadCandidate[] = [];
  const queries: OsmQueryLog[] = [];
  let queriesOk = 0, queriesFailed = 0, rawResults = 0;

  for (let i = 0; i < jobs.length; i++) {
    const { target, group } = jobs[i]!;
    const ql = buildQuery(target, group.clauses);
    try {
      const elements = await fetchOverpass(ql, {
        iso: opts.countryIso,
        target: target.value,
        kind: target.kind,
        group: group.key,
        shops: shops.join(","),
      });
      queriesOk++;
      rawResults += elements.length;
      const cityLabel = target.kind === "city" ? normalizeCity(target.value) : undefined;
      for (const el of elements) {
        const cand = toCandidate(el, opts.countryLabel, cityLabel);
        if (cand) candidates.push(cand);
      }
      queries.push({ label: `${group.label} · ${target.value}`, target: target.value, provider: "overpass", status: "ok", rawResults: elements.length });
    } catch (e) {
      queriesFailed++;
      const msg = (e as Error).message;
      queries.push({ label: `${group.label} · ${target.value}`, target: target.value, provider: "overpass", status: "failed", rawResults: 0, error: msg });
      errors.push(`OSM sorgusu başarısız (${group.label} · ${target.value}): ${msg}`);
    }
    if (i < jobs.length - 1) await sleep(PACING_MS);
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
