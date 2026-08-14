import "server-only";

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

  let saved = 0;
  for (const c of companies) {
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
  }

  return { searchId: created.id, savedCount: saved };
}
