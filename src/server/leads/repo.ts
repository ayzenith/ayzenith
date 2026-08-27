import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { LeadCandidate } from "./providers/types";
import type { LeadRole } from "@/config/leads";
import type { ContactDraft, VerificationDraft } from "./verify";
import type { LeadLocationDraft } from "./dedup";

/**
 * AYZENITH LEAD FINDER — write repository.
 *
 * The only place discovery+verification results are persisted. It writes the
 * search context once and each company with its provenance, contacts and
 * verification rows (§10/§11/§19) in a single flow. Nothing here interprets data —
 * it stores exactly what the pipeline produced, so the "no fabricated field"
 * guarantee is preserved right down to the database.
 */

export type SourceDraft = {
  dataField: string;
  sourceType: "OSM" | "OFFICIAL_WEBSITE" | "PUBLIC_WEB" | "PUBLIC_BUSINESS_DIRECTORY" | "RADAR" | "MANUAL" | "OTHER_FREE_SOURCE";
  label?: string;
  sourceUrl?: string;
};

export type CompanyDraft = {
  candidate: LeadCandidate;
  domain?: string;
  legalName?: string | null;
  canonicalName?: string | null;
  roles: LeadRole[];
  size: "LARGE" | "MEDIUM" | "SMALL" | "MICRO" | "ONLINE" | "UNKNOWN";
  sizeSignals: unknown[];
  productFit: "VERIFIED" | "LIKELY" | "UNCLEAR" | "NOT_RELEVANT" | "UNVERIFIED";
  productFitTier: string | null;
  productFitNote: string | null;
  detectedModel: string | null;
  modelFit: string;
  modelFitEvidence: string[];
  websiteStatus: string | null;
  productCategories: string[];
  storeCount: number | null;
  employeeCount: number | null;
  locationCount: number;
  matchStatus: string | null;
  verifiedAt: Date | null;
  // Enriched contact info that may override the discovery-time candidate values.
  email?: string | null;
  phone?: string | null;
  // Social (website-sourced).
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  linkedinUrl?: string | null;
  tiktokUrl?: string | null;
  youtubeUrl?: string | null;
  xUrl?: string | null;
  socialMatchStatus?: string | null;
  socialProductSignal?: string | null;
  socialBusinessSignal?: string | null;
  socialVerifiedAt?: Date | null;
  leadScore: number | null;
  leadConfidence: number;
  // V4 evidence, frozen with the verdict (§ accuracy Phase 4). All optional so a
  // caller that has not gathered them writes null — "not measured", never zero.
  identityStatus?: string | null;
  identityConfidence?: number | null;
  identityReasons?: string[];
  productEvidenceLevel?: number | null;
  productConfidence?: number | null;
  productNegatives?: string[];
  companyType?: string | null;
  companyTypeConfidence?: number | null;
  evidenceCoverage?: unknown;
  overallConfidence?: number | null;
  scoreBreakdown: unknown;
  status:
    | "DISCOVERED" | "SCREENING" | "QUALIFIED" | "HIGH_PRIORITY"
    | "REJECTED" | "DUPLICATE" | "INACTIVE" | "INSUFFICIENT_DATA";
  sources: SourceDraft[];
  contacts: ContactDraft[];
  verifications: VerificationDraft[];
  locations: LeadLocationDraft[];
  radarSnapshotId?: string | null;
};

export type SearchDraft = {
  country: string; // ISO alpha-2
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
  discoveryStatus: string;
  sourceStats: unknown;
  errors: string[];
  createdById: string | null;
};

export async function saveDiscovery(
  search: SearchDraft,
  companies: CompanyDraft[],
): Promise<{ searchId: string; savedCount: number }> {
  const created = await db.leadSearch.create({
    data: {
      country: search.country,
      countryLabel: search.countryLabel,
      city: search.city,
      productQuery: search.productQuery,
      businessModel: search.businessModel,
      leadTypes: search.leadTypes,
      searchTerms: search.searchTerms,
      radarSnapshotId: search.radarSnapshotId,
      categoryKey: search.categoryKey,
      hs6: search.hs6,
      radarScore: search.radarScore,
      radarDecision: search.radarDecision,
      discoveryStatus: search.discoveryStatus,
      sourceStats: search.sourceStats as object,
      errors: search.errors,
      totalDiscovered: companies.length,
      status: "DISCOVERED",
      createdById: search.createdById,
    },
    select: { id: true },
  });

  // Companies are written with BOUNDED CONCURRENCY, not one after another.
  //
  // Measured on a cold Köln run: saving 148 firms sequentially took 127s of a
  // 222s pipeline — 57% of the whole search, and by far its largest cost. Each
  // row is its own round trip to a remote Postgres, so the time was almost
  // entirely spent waiting on the network rather than on the database. Prisma's
  // createMany cannot help here because every company writes nested sources,
  // contacts, verifications and locations alongside it, so the fix is to have
  // several of those round trips in flight at once.
  //
  // The width is deliberately modest: this runs against a pooled connection and
  // a Supabase pooler has a finite client budget, so this is meant to remove the
  // idle waiting, not to saturate the pool.
  const SAVE_CONCURRENCY = 12;

  let saved = 0;
  const writeCompany = async (c: CompanyDraft) => {
    await db.leadCompany.create({
      data: {
        searchId: created.id,
        name: c.candidate.name,
        legalName: c.legalName ?? null,
        canonicalName: c.canonicalName ?? null,
        domain: c.domain ?? null,
        website: c.candidate.website ?? null,
        phone: c.phone ?? c.candidate.phone ?? null,
        email: c.email ?? c.candidate.email ?? null,
        country: c.candidate.country,
        city: c.candidate.city ?? null,
        address: c.candidate.address ?? null,
        postalCode: c.candidate.postalCode ?? null,
        latitude: c.candidate.latitude ?? null,
        longitude: c.candidate.longitude ?? null,
        businessModel: search.businessModel,
        commercialRoles: c.roles,
        size: c.size,
        sizeSignals: c.sizeSignals as object,
        productFit: c.productFit,
        productFitTier: c.productFitTier,
        productFitNote: c.productFitNote,
        detectedModel: c.detectedModel,
        modelFit: c.modelFit,
        modelFitEvidence: c.modelFitEvidence,
        websiteStatus: c.websiteStatus,
        productCategories: c.productCategories,
        storeCount: c.storeCount,
        employeeCount: c.employeeCount,
        locationCount: c.locationCount,
        matchStatus: c.matchStatus,
        verifiedAt: c.verifiedAt,
        instagramUrl: c.instagramUrl ?? null,
        facebookUrl: c.facebookUrl ?? null,
        linkedinUrl: c.linkedinUrl ?? null,
        tiktokUrl: c.tiktokUrl ?? null,
        youtubeUrl: c.youtubeUrl ?? null,
        xUrl: c.xUrl ?? null,
        socialMatchStatus: c.socialMatchStatus ?? null,
        socialProductSignal: c.socialProductSignal ?? null,
        socialBusinessSignal: c.socialBusinessSignal ?? null,
        socialVerifiedAt: c.socialVerifiedAt ?? null,
        leadScore: c.leadScore,
        leadConfidence: c.leadConfidence,
        identityStatus: c.identityStatus ?? null,
        identityConfidence: c.identityConfidence ?? null,
        identityReasons: (c.identityReasons ?? []) as object,
        productEvidenceLevel: c.productEvidenceLevel ?? null,
        productConfidence: c.productConfidence ?? null,
        productNegatives: (c.productNegatives ?? []) as object,
        companyType: c.companyType ?? null,
        companyTypeConfidence: c.companyTypeConfidence ?? null,
        evidenceCoverage: (c.evidenceCoverage ?? {}) as object,
        overallConfidence: c.overallConfidence ?? null,
        scoreBreakdown: c.scoreBreakdown as object,
        status: c.status,
        freshness: "FRESH",
        radarSnapshotId: c.radarSnapshotId ?? null,
        discoveredVia: c.candidate.discoveredVia,
        sources: {
          create: c.sources.map((s) => ({
            dataField: s.dataField,
            sourceType: s.sourceType,
            label: s.label ?? null,
            sourceUrl: s.sourceUrl ?? null,
          })),
        },
        contacts: {
          create: c.contacts.map((p) => ({
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
          create: c.verifications.map((v) => ({
            check: v.check,
            passed: v.passed,
            evidence: v.evidence ?? null,
            sourceUrl: v.sourceUrl ?? null,
          })),
        },
        // Branch locations — only when a firm actually has multiple (§4/§9); a
        // single-location company is represented by its own row.
        locations:
          c.locations.length > 1
            ? {
                create: c.locations.map((l) => ({
                  name: l.name ?? null,
                  address: l.address ?? null,
                  city: l.city ?? null,
                  postalCode: l.postalCode ?? null,
                  latitude: l.latitude ?? null,
                  longitude: l.longitude ?? null,
                  phone: l.phone ?? null,
                  sourceType: "OSM" as const,
                  sourceUrl: l.sourceUrl ?? null,
                })),
              }
            : undefined,
      },
    });
    saved++;
  };

  // BULK PATH (§V3.6). A nested `create` per company is one round trip each, and
  // at ~150 firms that was the single largest remaining cost of a search. The
  // rows do not depend on one another, so they go as a handful of bulk inserts
  // instead: ids are generated here, then companies and their children are
  // written with createMany. Round trips drop from ~150 to a handful.
  //
  // createMany has no per-row isolation — one bad value rejects its whole
  // statement — so writes are chunked to bound the blast radius, and any chunk
  // that fails is retried ROW BY ROW through the nested path above. Losing a
  // company to a bad value is acceptable; losing 149 of its neighbours is not.
  const CHUNK = 50;
  const chunks = <T,>(arr: T[], n: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  const withIds = companies.map((c) => ({ c, id: randomUUID() }));

  const companyRows = withIds.map(({ c, id }) => ({
    id,
    searchId: created.id,
    name: c.candidate.name,
    legalName: c.legalName ?? null,
    canonicalName: c.canonicalName ?? null,
    domain: c.domain ?? null,
    website: c.candidate.website ?? null,
    phone: c.phone ?? c.candidate.phone ?? null,
    email: c.email ?? c.candidate.email ?? null,
    country: c.candidate.country,
    city: c.candidate.city ?? null,
    address: c.candidate.address ?? null,
    postalCode: c.candidate.postalCode ?? null,
    latitude: c.candidate.latitude ?? null,
    longitude: c.candidate.longitude ?? null,
    businessModel: search.businessModel,
    commercialRoles: c.roles,
    size: c.size,
    sizeSignals: c.sizeSignals as object,
    productFit: c.productFit,
    productFitTier: c.productFitTier,
    productFitNote: c.productFitNote,
    detectedModel: c.detectedModel,
    modelFit: c.modelFit,
    modelFitEvidence: c.modelFitEvidence,
    websiteStatus: c.websiteStatus,
    productCategories: c.productCategories,
    storeCount: c.storeCount,
    employeeCount: c.employeeCount,
    locationCount: c.locationCount,
    matchStatus: c.matchStatus,
    verifiedAt: c.verifiedAt,
    instagramUrl: c.instagramUrl ?? null,
    facebookUrl: c.facebookUrl ?? null,
    linkedinUrl: c.linkedinUrl ?? null,
    tiktokUrl: c.tiktokUrl ?? null,
    youtubeUrl: c.youtubeUrl ?? null,
    xUrl: c.xUrl ?? null,
    socialMatchStatus: c.socialMatchStatus ?? null,
    socialProductSignal: c.socialProductSignal ?? null,
    socialBusinessSignal: c.socialBusinessSignal ?? null,
    socialVerifiedAt: c.socialVerifiedAt ?? null,
    leadScore: c.leadScore,
    leadConfidence: c.leadConfidence,
    identityStatus: c.identityStatus ?? null,
    identityConfidence: c.identityConfidence ?? null,
    identityReasons: (c.identityReasons ?? []) as object,
    productEvidenceLevel: c.productEvidenceLevel ?? null,
    productConfidence: c.productConfidence ?? null,
    productNegatives: (c.productNegatives ?? []) as object,
    companyType: c.companyType ?? null,
    companyTypeConfidence: c.companyTypeConfidence ?? null,
    evidenceCoverage: (c.evidenceCoverage ?? {}) as object,
    overallConfidence: c.overallConfidence ?? null,
    scoreBreakdown: c.scoreBreakdown as object,
    status: c.status,
    freshness: "FRESH" as const,
    radarSnapshotId: c.radarSnapshotId ?? null,
    discoveredVia: c.candidate.discoveredVia,
  }));

  // Children are only written for companies whose own row actually landed.
  const landed = new Set<string>();

  for (const chunk of chunks(companyRows, CHUNK)) {
    try {
      await db.leadCompany.createMany({ data: chunk as never });
      for (const r of chunk) landed.add(r.id);
      saved += chunk.length;
    } catch {
      // Fall back to the isolated nested path for just this chunk, so one bad
      // value costs one company rather than fifty.
      const ids = new Set(chunk.map((r) => r.id));
      let cursor = 0;
      const fallback = withIds.filter((w) => ids.has(w.id));
      await Promise.all(
        Array.from({ length: Math.min(SAVE_CONCURRENCY, fallback.length) }, async () => {
          while (cursor < fallback.length) {
            const item = fallback[cursor++]!;
            try {
              await writeCompany(item.c);
            } catch {
              // keep going; savedCount reports what actually landed
            }
          }
        }),
      );
    }
  }

  const sourceRows = withIds.flatMap(({ c, id }) =>
    landed.has(id)
      ? c.sources.map((s) => ({
          companyId: id,
          dataField: s.dataField,
          sourceType: s.sourceType,
          label: s.label ?? null,
          sourceUrl: s.sourceUrl ?? null,
        }))
      : [],
  );
  const contactRows = withIds.flatMap(({ c, id }) =>
    landed.has(id)
      ? c.contacts.map((p) => ({
          companyId: id,
          firstName: p.firstName ?? null,
          lastName: p.lastName ?? null,
          role: p.role ?? null,
          roleVerified: p.roleVerified,
          corporateEmail: p.corporateEmail ?? null,
          profileUrl: p.profileUrl ?? null,
          confidence: p.confidence,
          source: p.source,
          sourceUrl: p.sourceUrl ?? null,
        }))
      : [],
  );
  const verificationRows = withIds.flatMap(({ c, id }) =>
    landed.has(id)
      ? c.verifications.map((v) => ({
          companyId: id,
          check: v.check,
          passed: v.passed,
          evidence: v.evidence ?? null,
          sourceUrl: v.sourceUrl ?? null,
        }))
      : [],
  );
  // Branch locations — only when a firm actually has multiple (§4/§9); a
  // single-location company is represented by its own row.
  const locationRows = withIds.flatMap(({ c, id }) =>
    landed.has(id) && c.locations.length > 1
      ? c.locations.map((l) => ({
          companyId: id,
          name: l.name ?? null,
          address: l.address ?? null,
          city: l.city ?? null,
          postalCode: l.postalCode ?? null,
          latitude: l.latitude ?? null,
          longitude: l.longitude ?? null,
          phone: l.phone ?? null,
          sourceType: "OSM" as const,
          sourceUrl: l.sourceUrl ?? null,
        }))
      : [],
  );

  // Children go in parallel: they are independent tables with no ordering
  // between them, and each is already batched.
  const CHILD_CHUNK = 300;
  await Promise.all([
    ...chunks(sourceRows, CHILD_CHUNK).map((d) => db.leadSource.createMany({ data: d as never }).catch(() => undefined)),
    ...chunks(contactRows, CHILD_CHUNK).map((d) => db.leadContact.createMany({ data: d as never }).catch(() => undefined)),
    ...chunks(verificationRows, CHILD_CHUNK).map((d) => db.leadVerification.createMany({ data: d as never }).catch(() => undefined)),
    ...chunks(locationRows, CHILD_CHUNK).map((d) => db.leadLocation.createMany({ data: d as never }).catch(() => undefined)),
  ]);

  return { searchId: created.id, savedCount: saved };
}
