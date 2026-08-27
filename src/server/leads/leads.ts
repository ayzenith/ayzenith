import "server-only";

import { db } from "@/lib/db";
import { freshnessFor } from "@/config/leads";
import { getLeadSettings } from "./settings";

/**
 * AYZENITH LEAD FINDER — read repository (UI-facing).
 *
 * Typed, presentation-shaped reads for the screens. It never fetches from the
 * network or scores anything — it only returns what discovery already persisted.
 * Result sets are the bounded per-search pool (hundreds at most), so filtering
 * and ranking happen in the page from these typed rows.
 */

export type LeadCompanyView = {
  id: string;
  name: string;
  legalName: string | null;
  domain: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  country: string;
  city: string | null;
  address: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  businessModel: string;
  commercialRoles: string[];
  size: string;
  sizeSignals: unknown;
  productFit: string;
  productFitTier: string | null;
  productFitNote: string | null;
  identityStatus: string | null;
  identityReasons: unknown;
  productEvidenceLevel: number | null;
  productConfidence: number | null;
  companyType: string | null;
  evidenceCoverage: unknown;
  overallConfidence: number | null;
  detectedModel: string | null;
  modelFit: string | null;
  modelFitEvidence: string[];
  websiteStatus: string | null;
  productCategories: string[];
  storeCount: number | null;
  employeeCount: number | null;
  canonicalName: string | null;
  locationCount: number;
  matchStatus: string | null;
  verifiedAt: Date | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  xUrl: string | null;
  socialMatchStatus: string | null;
  socialProductSignal: string | null;
  socialBusinessSignal: string | null;
  leadScore: number | null;
  leadConfidence: number | null;
  scoreBreakdown: unknown;
  status: string;
  freshness: string;
  radarSnapshotId: string | null;
  discoveredVia: string;
  lastCheckedAt: Date;
  contactCount: number;
};

export type LeadSearchView = {
  id: string;
  country: string;
  countryLabel: string;
  city: string | null;
  productQuery: string;
  businessModel: string;
  leadTypes: string[];
  searchTerms: string[];
  radarSnapshotId: string | null;
  categoryKey: string | null;
  hs6: string | null;
  radarScore: number | null;
  radarDecision: string | null;
  status: string;
  totalDiscovered: number;
  discoveryStatus: string;
  sourceStats: {
    osm?: {
      status: string; queriesRun: number; queriesOk: number; queriesFailed: number; rawResults: number;
      queries?: Array<{ label: string; target: string; provider: string; status: string; rawResults: number; error?: string }>;
    };
  };
  errors: string[];
  createdAt: Date;
};

function toSearchView(s: {
  id: string; country: string; countryLabel: string; city: string | null;
  productQuery: string; businessModel: string; leadTypes: unknown; searchTerms: unknown;
  radarSnapshotId: string | null; categoryKey: string | null; hs6: string | null;
  radarScore: number | null; radarDecision: string | null; status: string;
  totalDiscovered: number; discoveryStatus: string; sourceStats: unknown;
  errors: unknown; createdAt: Date;
}): LeadSearchView {
  return {
    id: s.id,
    country: s.country,
    countryLabel: s.countryLabel,
    city: s.city,
    productQuery: s.productQuery,
    businessModel: s.businessModel,
    leadTypes: Array.isArray(s.leadTypes) ? (s.leadTypes as string[]) : [],
    searchTerms: Array.isArray(s.searchTerms) ? (s.searchTerms as string[]) : [],
    radarSnapshotId: s.radarSnapshotId,
    categoryKey: s.categoryKey,
    hs6: s.hs6,
    radarScore: s.radarScore,
    radarDecision: s.radarDecision,
    status: s.status,
    totalDiscovered: s.totalDiscovered,
    discoveryStatus: s.discoveryStatus,
    sourceStats: (s.sourceStats && typeof s.sourceStats === "object" ? s.sourceStats : {}) as LeadSearchView["sourceStats"],
    errors: Array.isArray(s.errors) ? (s.errors as string[]) : [],
    createdAt: s.createdAt,
  };
}

/** Recent searches for the module index. */
export async function listSearches(limit = 30): Promise<LeadSearchView[]> {
  const rows = await db.leadSearch.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toSearchView);
}

export async function getSearch(id: string): Promise<LeadSearchView | null> {
  const s = await db.leadSearch.findUnique({ where: { id } });
  return s ? toSearchView(s) : null;
}

/** All companies for a search, strongest score first, with contact counts. */
export async function listCompaniesForSearch(searchId: string): Promise<LeadCompanyView[]> {
  const [rows, settings] = await Promise.all([
    db.leadCompany.findMany({
      where: { searchId },
      orderBy: [{ leadScore: "desc" }, { name: "asc" }],
      include: { _count: { select: { contacts: true } } },
    }),
    getLeadSettings(),
  ]);
  const recheckDays = settings.recheckDays;
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    legalName: c.legalName,
    domain: c.domain,
    website: c.website,
    phone: c.phone,
    email: c.email,
    country: c.country,
    city: c.city,
    address: c.address,
    postalCode: c.postalCode,
    latitude: c.latitude,
    longitude: c.longitude,
    businessModel: c.businessModel,
    commercialRoles: Array.isArray(c.commercialRoles) ? (c.commercialRoles as string[]) : [],
    size: c.size,
    sizeSignals: c.sizeSignals,
    productFit: c.productFit,
    productFitTier: c.productFitTier,
    productFitNote: c.productFitNote,
    identityStatus: c.identityStatus,
    identityReasons: c.identityReasons,
    productEvidenceLevel: c.productEvidenceLevel,
    productConfidence: c.productConfidence,
    companyType: c.companyType,
    evidenceCoverage: c.evidenceCoverage,
    overallConfidence: c.overallConfidence,
    detectedModel: c.detectedModel,
    modelFit: c.modelFit,
    modelFitEvidence: Array.isArray(c.modelFitEvidence) ? (c.modelFitEvidence as string[]) : [],
    websiteStatus: c.websiteStatus,
    productCategories: Array.isArray(c.productCategories) ? (c.productCategories as string[]) : [],
    storeCount: c.storeCount,
    employeeCount: c.employeeCount,
    canonicalName: c.canonicalName,
    locationCount: c.locationCount,
    matchStatus: c.matchStatus,
    verifiedAt: c.verifiedAt,
    instagramUrl: c.instagramUrl,
    facebookUrl: c.facebookUrl,
    linkedinUrl: c.linkedinUrl,
    tiktokUrl: c.tiktokUrl,
    youtubeUrl: c.youtubeUrl,
    xUrl: c.xUrl,
    socialMatchStatus: c.socialMatchStatus,
    socialProductSignal: c.socialProductSignal,
    socialBusinessSignal: c.socialBusinessSignal,
    leadScore: c.leadScore,
    leadConfidence: c.leadConfidence,
    scoreBreakdown: c.scoreBreakdown,
    status: c.status,
    // Derived, not read from the column: see freshnessFor.
    freshness: freshnessFor(c.lastCheckedAt, recheckDays),
    radarSnapshotId: c.radarSnapshotId,
    discoveredVia: c.discoveredVia,
    lastCheckedAt: c.lastCheckedAt,
    contactCount: c._count.contacts,
  }));
}

export async function getCompany(id: string) {
  const [row, settings] = await Promise.all([
    db.leadCompany.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { confidence: "desc" } },
        sources: { orderBy: { collectedAt: "asc" } },
        signals: true,
        verifications: true,
        locations: true,
        search: true,
      },
    }),
    getLeadSettings(),
  ]);
  if (!row) return null;
  // Same derived age the list uses, so a company cannot read "Güncel" on its own
  // page while the list that linked to it says otherwise.
  return { ...row, freshness: freshnessFor(row.lastCheckedAt, settings.recheckDays) };
}

// ---------------------------------------------------------------------------
// Data Health (§23) — a durable, DB-derived snapshot of the lead inventory.
// ---------------------------------------------------------------------------

export type LeadDataHealth = {
  total: number;
  fresh: number;
  recheck: number;
  stale: number;
  searches: number;
  lastSearchAt: Date | null;
};

export async function getDataHealth(): Promise<LeadDataHealth> {
  try {
    const { recheckDays } = await getLeadSettings();
    const day = 86_400_000;
    const freshFrom = new Date(Date.now() - recheckDays * day);
    const staleBefore = new Date(Date.now() - recheckDays * 2 * day);
    const [total, fresh, recheck, stale, searches, last] = await Promise.all([
      db.leadCompany.count(),
      db.leadCompany.count({ where: { lastCheckedAt: { gte: freshFrom } } }),
      db.leadCompany.count({ where: { lastCheckedAt: { lt: freshFrom, gte: staleBefore } } }),
      db.leadCompany.count({ where: { lastCheckedAt: { lt: staleBefore } } }),
      db.leadSearch.count(),
      db.leadSearch.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    return { total, fresh, recheck, stale, searches, lastSearchAt: last?.createdAt ?? null };
  } catch {
    return { total: 0, fresh: 0, recheck: 0, stale: 0, searches: 0, lastSearchAt: null };
  }
}
