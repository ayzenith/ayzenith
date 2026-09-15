/**
 * AYZENITH LEAD FINDER — idempotent discovery save, regression suite.
 *
 * The bug: `saveDiscovery` opened a new LeadSearch and wrote every firm as a new
 * LeadCompany on every run, without looking at what was stored. Re-running
 * "kadın iç giyim / Berlin" about nine times left 3,784 rows standing for
 * roughly 868 real firms.
 *
 * These tests drive the REAL write path (`saveDiscoveryWith`) against an
 * in-memory store shaped like the Prisma delegates it uses, so they exercise
 * the same code production runs — not a restatement of it.
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { saveDiscoveryWith, type CompanyDraft, type SearchDraft } from "../src/server/leads/discovery-save";
import { companyIdentityKey, searchContextKey } from "../src/server/leads/discovery-identity";

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

function fakeStore() {
  let clock = 0;
  let seq = 0;
  const t = {
    search: [] as Row[],
    company: [] as Row[],
    source: [] as Row[],
    contact: [] as Row[],
    verification: [] as Row[],
    location: [] as Row[],
  };
  const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([k, v]) => row[k] === v);
  const copy = (row: Row) => structuredClone(row);
  const bulk = (table: Row[]) => ({
    async createMany(a: any) {
      for (const d of a.data) table.push({ ...d });
      return { count: a.data.length };
    },
  });

  const store = {
    leadSearch: {
      async findMany(a: any) {
        let rows = t.search.filter((x) => matches(x, a?.where));
        if (a?.orderBy?.createdAt === "desc") rows = [...rows].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
        return rows.map(copy);
      },
      async create(a: any) {
        const row = { id: `search-${++seq}`, createdAt: new Date(Date.UTC(2026, 0, 1) + ++clock * 1000), ...a.data };
        t.search.push(row);
        return { id: row.id };
      },
      async update(a: any) {
        const row = t.search.find((x) => x.id === a.where.id)!;
        Object.assign(row, a.data);
        return copy(row);
      },
    },
    leadCompany: {
      async findMany(a: any) {
        return t.company.filter((x) => matches(x, a?.where)).map(copy);
      },
      ...bulk(t.company),
      async create(a: any) {
        const { sources, contacts, verifications, locations, ...rest } = a.data;
        const id = `company-${++seq}`;
        t.company.push({ id, ...rest });
        for (const s of sources?.create ?? []) t.source.push({ companyId: id, ...s });
        for (const c of contacts?.create ?? []) t.contact.push({ companyId: id, ...c });
        for (const v of verifications?.create ?? []) t.verification.push({ companyId: id, ...v });
        for (const l of locations?.create ?? []) t.location.push({ companyId: id, ...l });
        return { id };
      },
    },
    leadSource: bulk(t.source),
    leadContact: bulk(t.contact),
    leadVerification: bulk(t.verification),
    leadLocation: bulk(t.location),
  };

  return { store: store as never, t };
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

function searchDraft(o: Partial<SearchDraft> = {}): SearchDraft {
  return {
    country: "DE",
    countryLabel: "Almanya",
    city: "berlin",
    productQuery: "kadın iç giyim",
    businessModel: "B2B",
    leadTypes: [],
    searchTerms: ["dessous"],
    radarSnapshotId: null,
    categoryKey: null,
    hs6: null,
    radarScore: null,
    radarDecision: null,
    discoveryStatus: "OK",
    sourceStats: {},
    errors: [],
    createdById: "user-1",
    ...o,
  };
}

function draft(
  name: string,
  opts: { website?: string; lat?: number; lon?: number; extra?: Partial<CompanyDraft> } = {},
): CompanyDraft {
  const host = opts.website ? new URL(opts.website).hostname.replace(/^www\./, "") : undefined;
  return {
    candidate: {
      name,
      website: opts.website,
      country: "DE",
      city: "Berlin",
      address: "Musterstraße 1",
      latitude: opts.lat ?? 52.52,
      longitude: opts.lon ?? 13.405,
      roleHints: [],
      discoveredVia: "OSM",
    } as CompanyDraft["candidate"],
    domain: host,
    legalName: null,
    canonicalName: null,
    roles: [],
    size: "UNKNOWN",
    sizeSignals: [],
    productFit: "UNVERIFIED",
    productFitTier: null,
    productFitNote: null,
    detectedModel: null,
    modelFit: "UNVERIFIED",
    modelFitEvidence: [],
    websiteStatus: null,
    productCategories: [],
    storeCount: null,
    employeeCount: null,
    locationCount: 1,
    matchStatus: null,
    verifiedAt: null,
    leadScore: null,
    leadConfidence: 0,
    scoreBreakdown: {},
    status: "DISCOVERED",
    sources: [{ dataField: "existence", sourceType: "OSM", label: "OpenStreetMap" }],
    contacts: [],
    verifications: [{ check: "exists", passed: true }] as CompanyDraft["verifications"],
    locations: [],
    ...opts.extra,
  };
}

const berlinFirms = () => [
  draft("Vissner's Dessous", { website: "https://www.visners-dessous.de" }),
  draft("Rose Rosa Dessous-Fachgeschäft", { lat: 52.5311, lon: 13.3843 }),
  draft("KiK", { website: "https://kik.de" }),
];

// ---------------------------------------------------------------------------
// 1. The same discovery twice creates nothing new
// ---------------------------------------------------------------------------

test("idempotent: running the same discovery twice writes no duplicates", async () => {
  const { store, t } = fakeStore();

  const first = await saveDiscoveryWith(store, searchDraft(), berlinFirms());
  const second = await saveDiscoveryWith(store, searchDraft(), berlinFirms());

  assert.equal(first.reusedSearch, false);
  assert.equal(first.savedCount, 3);

  assert.equal(second.searchId, first.searchId, "the re-run writes into the same search");
  assert.equal(second.reusedSearch, true);
  assert.equal(second.savedCount, 0);
  assert.equal(second.alreadyKnown, 3);

  assert.equal(t.search.length, 1);
  assert.equal(t.company.length, 3);
  assert.equal(t.source.length, 3, "child rows are not duplicated either");
  assert.equal(t.verification.length, 3);
});

test("idempotent: nine re-runs — the live Berlin case — still leave one copy", async () => {
  const { store, t } = fakeStore();
  for (let i = 0; i < 9; i++) await saveDiscoveryWith(store, searchDraft(), berlinFirms());
  assert.equal(t.search.length, 1);
  assert.equal(t.company.length, 3);
});

test("idempotent: spelling noise is not a different search question", async () => {
  // The live runs stored both "Berlin" and "berlin".
  const { store, t } = fakeStore();
  const a = await saveDiscoveryWith(
    store,
    searchDraft({ city: "Berlin", productQuery: "Kadın İç Giyim", leadTypes: ["wholesaler", "retailer"] }),
    berlinFirms(),
  );
  const b = await saveDiscoveryWith(
    store,
    searchDraft({ city: " berlin", productQuery: "kadın  iç giyim", leadTypes: ["retailer", "wholesaler"] }),
    berlinFirms(),
  );
  assert.equal(b.searchId, a.searchId);
  assert.equal(t.company.length, 3);
});

test("idempotent: a re-run adds only the firms the search did not already hold", async () => {
  const { store, t } = fakeStore();
  const first = await saveDiscoveryWith(store, searchDraft(), berlinFirms());
  const second = await saveDiscoveryWith(store, searchDraft(), [
    ...berlinFirms(),
    draft("Loveco", { website: "https://loveco-shop.de" }),
  ]);

  assert.equal(second.searchId, first.searchId);
  assert.equal(second.savedCount, 1);
  assert.equal(second.alreadyKnown, 3);
  assert.equal(t.company.length, 4);
  assert.equal(t.search[0]!.totalDiscovered, 4, "the reused search counts everything it now holds");
});

// ---------------------------------------------------------------------------
// 2. A different search context keeps its own relationship
// ---------------------------------------------------------------------------

test("context: the same firm found by a different search gets its own row, and the original is untouched", async () => {
  const { store, t } = fakeStore();
  const b2b = await saveDiscoveryWith(store, searchDraft({ businessModel: "B2B" }), berlinFirms());

  const b2bRowsBefore = structuredClone(t.company.filter((r) => r.searchId === b2b.searchId));
  const b2bSearchBefore = structuredClone(t.search.find((s) => s.id === b2b.searchId));

  const b2c = await saveDiscoveryWith(store, searchDraft({ businessModel: "B2C" }), berlinFirms());
  const headphones = await saveDiscoveryWith(store, searchDraft({ productQuery: "kulaklık" }), berlinFirms());

  assert.notEqual(b2c.searchId, b2b.searchId, "B2B and B2C are different questions");
  assert.notEqual(headphones.searchId, b2b.searchId, "a different product is a different question");
  assert.equal(b2c.reusedSearch, false);
  assert.equal(b2c.savedCount, 3);
  assert.equal(headphones.savedCount, 3);

  assert.deepEqual(t.company.filter((r) => r.searchId === b2b.searchId), b2bRowsBefore);
  assert.deepEqual(t.search.find((s) => s.id === b2b.searchId), b2bSearchBefore);
  assert.equal(t.search.length, 3);
  assert.equal(t.company.length, 9);
});

test("context: a different city or country is a different search", async () => {
  const { store, t } = fakeStore();
  const berlin = await saveDiscoveryWith(store, searchDraft({ city: "berlin" }), berlinFirms());
  const hamburg = await saveDiscoveryWith(store, searchDraft({ city: "hamburg" }), berlinFirms());
  const italy = await saveDiscoveryWith(store, searchDraft({ country: "IT" }), berlinFirms());
  assert.equal(new Set([berlin.searchId, hamburg.searchId, italy.searchId]).size, 3);
  assert.equal(t.company.length, 9);
});

test("context: a RADAR-linked run is not merged into a standalone one", async () => {
  const { store } = fakeStore();
  const plain = await saveDiscoveryWith(store, searchDraft(), berlinFirms());
  const fromRadar = await saveDiscoveryWith(store, searchDraft({ radarSnapshotId: "snap-1" }), berlinFirms());
  assert.notEqual(fromRadar.searchId, plain.searchId);
});

// ---------------------------------------------------------------------------
// 3. Existing LeadCompany data is not corrupted
// ---------------------------------------------------------------------------

test("integrity: a weaker re-discovery never overwrites a verified row", async () => {
  const { store, t } = fakeStore();

  // A row as a re-check would have left it: verified, scored, named, with a contact.
  await saveDiscoveryWith(store, searchDraft(), [
    draft("Vissner's Dessous", {
      website: "https://www.visners-dessous.de",
      extra: {
        legalName: "Vissner Dessous GmbH",
        websiteStatus: "ACTIVE",
        productFit: "VERIFIED",
        leadScore: 88,
        overallConfidence: 64,
        status: "QUALIFIED",
        contacts: [{ firstName: "Anna", lastName: "Vissner", roleVerified: true, confidence: 80, source: "OFFICIAL_WEBSITE" }] as CompanyDraft["contacts"],
      },
    }),
  ]);
  const rowBefore = structuredClone(t.company[0]);
  const childrenBefore = structuredClone({ s: t.source, c: t.contact, v: t.verification });

  // The same firm re-discovered by a run that hit its crawl budget: unverified, unscored, unnamed.
  const rerun = await saveDiscoveryWith(store, searchDraft(), [
    draft("Vissner's Dessous", { website: "http://visners-dessous.de/impressum" }),
  ]);

  assert.equal(rerun.alreadyKnown, 1);
  assert.equal(rerun.savedCount, 0);
  assert.deepEqual(t.company[0], rowBefore, "every column of the verified row is unchanged");
  assert.deepEqual({ s: t.source, c: t.contact, v: t.verification }, childrenBefore);
});

test("integrity: a failed re-run that found nothing does not overwrite the search it reuses", async () => {
  const { store, t } = fakeStore();
  await saveDiscoveryWith(store, searchDraft({ discoveryStatus: "OK" }), berlinFirms());
  await saveDiscoveryWith(store, searchDraft({ discoveryStatus: "FAILED", errors: ["Overpass timeout"] }), []);
  assert.equal(t.search[0]!.discoveryStatus, "OK");
  assert.deepEqual(t.search[0]!.errors, []);
  assert.equal(t.company.length, 3);
});

test("integrity: a firm repeated inside one batch is written once", async () => {
  const { store, t } = fakeStore();
  const res = await saveDiscoveryWith(store, searchDraft(), [
    draft("KiK", { website: "https://kik.de" }),
    draft("KiK Filiale", { website: "http://www.kik.de/filialen" }),
  ]);
  assert.equal(res.savedCount, 1);
  assert.equal(res.duplicateInBatch, 1);
  assert.equal(t.company.length, 1);
});

test("integrity: firms without a website — same place is one firm, a different place is another", async () => {
  const { store, t } = fakeStore();
  const lidls = () => [
    draft("Lidl", { lat: 52.5201, lon: 13.4049 }),
    draft("Lidl", { lat: 52.4801, lon: 13.4349 }),
  ];
  const first = await saveDiscoveryWith(store, searchDraft(), lidls());
  const second = await saveDiscoveryWith(store, searchDraft(), lidls());
  assert.equal(first.savedCount, 2, "two branches in different streets stay two rows");
  assert.equal(second.savedCount, 0);
  assert.equal(t.company.length, 2);
});

// ---------------------------------------------------------------------------
// The keys themselves
// ---------------------------------------------------------------------------

test("keys: search context ignores spelling noise and nothing else", () => {
  const base = { country: "DE", city: "Berlin", productQuery: "Kadın İç Giyim", businessModel: "B2B", leadTypes: ["b", "a"], radarSnapshotId: null };
  assert.equal(
    searchContextKey(base),
    searchContextKey({ ...base, city: " berlin ", productQuery: "KADIN  İÇ GİYİM", leadTypes: ["a", "b", "a"] }),
  );
  for (const change of [{ businessModel: "B2C" }, { country: "IT" }, { city: "hamburg" }, { productQuery: "kulaklık" }, { leadTypes: ["a"] }, { radarSnapshotId: "x" }]) {
    assert.notEqual(searchContextKey(base), searchContextKey({ ...base, ...change }), JSON.stringify(change));
  }
});

test("keys: a website is one firm whatever the scheme, www or path", () => {
  const k = (website: string) => companyIdentityKey({ name: "x", website });
  assert.equal(k("https://www.metro.de"), k("http://metro.de/standorte/berlin"));
  assert.notEqual(k("https://metro.de"), k("https://metro.it"));
});

test("keys: with no website and no place there is nothing safe to match on", () => {
  assert.equal(companyIdentityKey({ name: "Lidl" }), null);
  assert.equal(companyIdentityKey({ name: "  " , latitude: 52.5, longitude: 13.4 }), null);
  assert.notEqual(companyIdentityKey({ name: "Lidl", address: "Hauptstraße 1" }), null);
});
