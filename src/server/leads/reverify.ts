import "server-only";

import { db } from "@/lib/db";
import { verifyCandidate } from "./verify";
import { scoreCompany } from "./scoring";
import { getLeadSettings } from "./settings";
import { resolveProductProfile, type LeadRole } from "@/config/leads";
import { countBrandOutlets } from "./providers/overpass";
import type { LeadCandidate } from "./providers/types";
import type { DedupedCandidate } from "./dedup";
import type { Classification } from "./classify";

/**
 * AYZENITH LEAD FINDER — deferred verification (§V3.4).
 *
 * A single discovery run can only read so many websites before it hits the
 * request budget and the route's time limit, so a large search always finished
 * with most of its firms never looked at. That is honest — they are marked
 * "not checked", never "bad" — but it caps how much of a search is actually
 * usable, and the cap was doing more work than the evidence.
 *
 * This module continues that verification AFTERWARDS, in bounded batches, so a
 * search converges on full coverage without any single request running long:
 *
 *   • the results screen can ask for the next batch on demand ("Doğrulamaya
 *     devam et"), and
 *   • a cron route grinds through the backlog on its own.
 *
 * Both share `verifyPendingBatch`. Nothing here re-discovers or invents: it
 * takes rows that already exist, reads the site the row already points at, and
 * rewrites only the fields verification is entitled to set. A row that is
 * already verified is never touched, so batches are idempotent and safe to
 * re-run.
 */

/** How many firms one batch may verify. Bounded so a single invocation stays
 *  well inside a serverless request budget even when every site is slow. */
export const REVERIFY_BATCH = 25;

export type ReverifyResult = {
  /** Rows we attempted in this batch. */
  attempted: number;
  /** Of those, how many answered (websiteStatus ACTIVE). */
  reachable: number;
  /** Rows still awaiting a first check for this search after the batch. */
  remaining: number;
};

/** Reconstruct the in-memory shapes `verifyCandidate` expects from a stored row.
 *  Discovery-time artefacts that were never persisted (raw OSM tags) are simply
 *  absent — verification does not read them, and classification is taken from
 *  the stored columns rather than re-derived, so a re-check can never silently
 *  change what discovery concluded. */
type PendingRow = {
  id: string;
  name: string;
  website: string | null;
  country: string;
  city: string | null;
  address: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  commercialRoles: unknown;
  size: string;
  sizeSignals: unknown;
  productFit: string;
  productFitTier: string | null;
  productFitNote: string | null;
  locationCount: number;
};

function toCandidate(row: PendingRow): LeadCandidate {
  return {
    name: row.name,
    website: row.website ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    country: row.country,
    city: row.city ?? undefined,
    address: row.address ?? undefined,
    postalCode: row.postalCode ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    roleHints: [],
    discoveredVia: "OSM",
  };
}

function toDeduped(row: PendingRow): DedupedCandidate {
  return {
    candidate: toCandidate(row),
    canonicalName: row.name,
    branchCount: Math.max(1, row.locationCount ?? 1),
    locations: [],
    mergedSourceUrls: [],
  };
}

function toClassification(row: PendingRow): Classification {
  const roles = Array.isArray(row.commercialRoles) ? (row.commercialRoles as LeadRole[]) : (["other"] as LeadRole[]);
  return {
    roles,
    size: row.size as Classification["size"],
    sizeSignals: Array.isArray(row.sizeSignals) ? (row.sizeSignals as Classification["sizeSignals"]) : [],
    productFit: row.productFit as Classification["productFit"],
    productFitTier: row.productFitTier as Classification["productFitTier"],
    productFitNote: row.productFitNote,
  };
}

const PENDING_SELECT = {
  id: true, name: true, website: true, country: true, city: true, address: true,
  postalCode: true, latitude: true, longitude: true, phone: true, email: true,
  commercialRoles: true, size: true, sizeSignals: true, productFit: true,
  productFitTier: true, productFitNote: true, locationCount: true,
} as const;

/** A firm still awaiting its FIRST website check: it has a website, but no run
 *  has reached it yet (`websiteStatus` null). Rows whose site was already tried
 *  and did not answer are NOT retried here — that is a re-check concern with its
 *  own freshness rules, not a coverage gap. */
const PENDING_WHERE = { website: { not: null }, websiteStatus: null } as const;

export async function countPending(searchId: string): Promise<number> {
  return db.leadCompany.count({ where: { searchId, ...PENDING_WHERE } });
}

/**
 * Verify the next batch of never-checked firms for ONE search.
 * Returns what it did, so a caller can report progress honestly.
 */
export async function verifyPendingBatch(
  searchId: string,
  limit: number = REVERIFY_BATCH,
): Promise<ReverifyResult> {
  const search = await db.leadSearch.findUnique({
    where: { id: searchId },
    select: { id: true, productQuery: true, businessModel: true, searchTerms: true, city: true },
  });
  if (!search) return { attempted: 0, reachable: 0, remaining: 0 };

  const rows = await db.leadCompany.findMany({
    where: { searchId, ...PENDING_WHERE },
    select: PENDING_SELECT,
    // Highest-scoring first: if the backlog is never fully worked through, the
    // firms most likely to matter are the ones that did get checked.
    orderBy: [{ leadScore: "desc" }, { id: "asc" }],
    take: limit,
  });
  if (rows.length === 0) return { attempted: 0, reachable: 0, remaining: 0 };

  const settings = await getLeadSettings();
  const { profile, matched } = resolveProductProfile(search.productQuery);
  const productTerms =
    Array.isArray(search.searchTerms) && search.searchTerms.length > 0
      ? (search.searchTerms as string[])
      : Array.from(new Set([...profile.terms.de, ...profile.terms.en, ...profile.terms.tr]));

  let reachable = 0;

  for (const row of rows) {
    const dc = toDeduped(row);
    const classification = toClassification(row);

    let outcome;
    try {
      outcome = await verifyCandidate(dc, classification, {
        productTerms,
        productMatched: matched,
        domain: row.website ? normalizeHost(row.website) : undefined,
        searchModel: search.businessModel,
        productSignals: profile.signals,
        // The deferred pass is the ONLY look these firms will get, so it reads
        // in full rather than staging — there is no later pass to promote to.
        depth: "full",
      });
    } catch {
      continue; // leave the row untouched; it stays honestly "not checked"
    }

    const cityMatched = search.city
      ? (row.city ?? "").toLocaleLowerCase("tr") === search.city.toLocaleLowerCase("tr")
      : null;

    const email = outcome.email ?? row.email ?? null;
    const phone = outcome.phone ?? row.phone ?? null;

    const score = scoreCompany(
      {
        candidate: dc.candidate,
        roles: outcome.roles,
        size: outcome.size,
        productFit: outcome.productFit,
        modelFit: outcome.modelFit,
        websiteStatus: outcome.websiteStatus,
        businessModel: search.businessModel,
        inTargetMarket: true,
        cityMatched,
        contactCount: outcome.contacts.length,
        hasCompanyContact: Boolean(email ?? phone),
      },
      settings.weights,
    );

    const status =
      score.leadScore == null
        ? "INSUFFICIENT_DATA"
        : outcome.verified
          ? score.leadScore >= settings.thresholds.potential
            ? "QUALIFIED"
            : "SCREENING"
          : "DISCOVERED";

    if (outcome.websiteStatus === "ACTIVE") reachable++;

    const social: Record<string, string | undefined> = {};
    for (const s of outcome.socials) social[s.platform] = s.url;

    // One transaction per firm: replace the website-derived rows this pass owns
    // (contacts, verification checks, website sources) and leave the OSM-derived
    // provenance from discovery untouched.
    await db.$transaction(async (tx) => {
      await tx.leadContact.deleteMany({ where: { companyId: row.id, source: "OFFICIAL_WEBSITE" } });
      await tx.leadVerification.deleteMany({ where: { companyId: row.id } });
      await tx.leadSource.deleteMany({ where: { companyId: row.id, sourceType: "OFFICIAL_WEBSITE" } });

      await tx.leadCompany.update({
        where: { id: row.id },
        data: {
          legalName: outcome.legalName ?? undefined,
          email,
          phone,
          commercialRoles: outcome.roles,
          size: outcome.size as never,
          sizeSignals: outcome.sizeSignals as object,
          productFit: outcome.productFit as never,
          productFitTier: outcome.productFitTier,
          productFitNote: outcome.productFitNote,
          detectedModel: outcome.detectedModel,
          modelFit: outcome.modelFit,
          modelFitEvidence: outcome.modelFitEvidence,
          websiteStatus: outcome.websiteStatus,
          productCategories: outcome.productCategories,
          storeCount: outcome.storeCount,
          employeeCount: outcome.employeeCount,
          verifiedAt: new Date(),
          instagramUrl: social.instagram ?? null,
          facebookUrl: social.facebook ?? null,
          linkedinUrl: social.linkedin ?? null,
          tiktokUrl: social.tiktok ?? null,
          youtubeUrl: social.youtube ?? null,
          xUrl: social.x ?? null,
          socialMatchStatus: outcome.socialMatchStatus,
          socialProductSignal: outcome.socialProductSignal,
          socialBusinessSignal: outcome.socialBusinessSignal,
          socialVerifiedAt: outcome.socialVerified ? new Date() : null,
          leadScore: score.leadScore,
          leadConfidence: score.leadConfidence,
          scoreBreakdown: {
            components: score.components,
            measuredComponents: score.measuredComponents,
            dataLimited: score.dataLimited,
            weights: settings.weights,
          } as object,
          status: status as never,
          lastCheckedAt: new Date(),
          contacts: {
            create: outcome.contacts.map((p) => ({
              firstName: p.firstName ?? null,
              lastName: p.lastName ?? null,
              role: p.role ?? null,
              roleVerified: p.roleVerified,
              corporateEmail: p.corporateEmail ?? null,
              profileUrl: p.profileUrl ?? null,
              confidence: p.confidence,
              source: p.source,
              sourceUrl: p.sourceUrl ?? null,
            })),
          },
          verifications: {
            create: outcome.verifications.map((v) => ({
              check: v.check,
              passed: v.passed,
              evidence: v.evidence ?? null,
              sourceUrl: v.sourceUrl ?? null,
            })),
          },
          sources: {
            create: outcome.extraSources.map((s) => ({
              dataField: s.dataField,
              sourceType: s.sourceType,
              label: s.label ?? null,
              sourceUrl: s.sourceUrl ?? null,
            })),
          },
        },
      });
    });
  }

  return { attempted: rows.length, reachable, remaining: await countPending(searchId) };
}

/** Registrable host of a URL, for the "is this email on the company's own
 *  domain?" check. Mirrors dedup's normaliser without importing its whole graph. */
function normalizeHost(website: string): string | undefined {
  try {
    const u = website.includes("://") ? website : `https://${website}`;
    return new URL(u).host.replace(/^www\./i, "").toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Work the backlog across RECENT searches — the cron entry point. Spends its
 * budget on the newest searches first, since those are the ones someone is
 * actually looking at.
 */
export async function verifyPendingAcrossSearches(
  maxSearches = 3,
  perSearch = REVERIFY_BATCH,
): Promise<Array<{ searchId: string } & ReverifyResult>> {
  const searches = await db.leadSearch.findMany({
    where: { companies: { some: PENDING_WHERE } },
    orderBy: { createdAt: "desc" },
    take: maxSearches,
    select: { id: true },
  });

  const out: Array<{ searchId: string } & ReverifyResult> = [];
  for (const s of searches) {
    const r = await verifyPendingBatch(s.id, perSearch);
    out.push({ searchId: s.id, ...r });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chain scale (§V3.5)
// ---------------------------------------------------------------------------

/** Label used for the country-wide outlet signal. Also the marker that tells a
 *  later run this company has already been measured, so no search is enriched
 *  twice. */
const CHAIN_SIGNAL_LABEL = "Ülke genelinde şube (OSM)";

type SizeSignal = { label: string; value: string; source: string };

function hasChainSignal(sizeSignals: unknown): boolean {
  return Array.isArray(sizeSignals) && (sizeSignals as SizeSignal[]).some((s) => s?.label === CHAIN_SIGNAL_LABEL);
}

/** Size implied by a national outlet count. Only ever used to RAISE a size —
 *  a firm the site said has 500 employees is not demoted because OSM maps three
 *  of its shops. */
function sizeFromOutlets(n: number): "LARGE" | "MEDIUM" | "SMALL" {
  if (n >= 10) return "LARGE";
  if (n >= 3) return "MEDIUM";
  return "SMALL";
}
const SIZE_RANK: Record<string, number> = { UNKNOWN: 0, ONLINE: 0, MICRO: 1, SMALL: 2, MEDIUM: 3, LARGE: 4 };

/**
 * Attach country-wide chain scale to a search's companies (§V3.5).
 *
 * A search only sees the branches inside the searched city, so NKD (1101 outlets
 * in Germany) and a single corner boutique both read as "1 şube". One country-
 * wide query resolves that for every company at once.
 *
 * Runs in the background, never in the discovery request: the query scans a whole
 * country and was measured at ~82s. Absence is recorded as nothing at all — a
 * brand OSM does not know as a chain is "not measured", never "0 şube".
 */
export async function enrichChainScale(searchId: string): Promise<{ measured: number; chains: number }> {
  const search = await db.leadSearch.findUnique({
    where: { id: searchId },
    select: { id: true, country: true },
  });
  if (!search) return { measured: 0, chains: 0 };

  const companies = await db.leadCompany.findMany({
    where: { searchId },
    select: { id: true, name: true, size: true, sizeSignals: true },
    orderBy: { leadScore: "desc" },
    take: 60,
  });

  const todo = companies.filter((c) => !hasChainSignal(c.sizeSignals));
  if (todo.length === 0) return { measured: 0, chains: 0 };

  // One query for up to 30 brands; the rest wait for the next tick.
  const batch = todo.slice(0, 30);
  let counts: Record<string, number>;
  try {
    counts = await countBrandOutlets(search.country, batch.map((c) => c.name));
  } catch {
    return { measured: 0, chains: 0 }; // leave them unmeasured; never guess
  }

  let chains = 0;
  for (const c of batch) {
    const n = counts[c.name];
    const signals: SizeSignal[] = Array.isArray(c.sizeSignals) ? (c.sizeSignals as SizeSignal[]) : [];

    if (n && n > 1) {
      chains++;
      signals.push({ label: CHAIN_SIGNAL_LABEL, value: String(n), source: "OpenStreetMap" });
      const implied = sizeFromOutlets(n);
      const size = (SIZE_RANK[implied] ?? 0) > (SIZE_RANK[c.size] ?? 0) ? implied : c.size;
      await db.leadCompany.update({
        where: { id: c.id },
        data: { sizeSignals: signals as object, size: size as never },
      });
    } else {
      // Measured, found nothing: record the ATTEMPT so we don't re-query this
      // firm forever, without ever implying it has no shops.
      signals.push({ label: CHAIN_SIGNAL_LABEL, value: "zincir kaydı yok", source: "OpenStreetMap" });
      await db.leadCompany.update({ where: { id: c.id }, data: { sizeSignals: signals as object } });
    }
  }

  return { measured: batch.length, chains };
}

/** The newest search that still has companies without a chain-scale reading. */
export async function findSearchNeedingScale(): Promise<string | null> {
  const s = await db.leadSearch.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return s?.id ?? null;
}
