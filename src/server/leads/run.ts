import "server-only";

import { COUNTRY_LABELS, resolveProductProfile, B2B_SUPPLIER_ROLES, B2C_ROLES } from "@/config/leads";
import { discoverOsm } from "./providers/overpass";
import { dedupeCandidates, normalizeDomain, type DedupedCandidate } from "./dedup";
import { classify } from "./classify";
import { verifyCandidate, computeModelFit, type VerifyOutcome, type SocialProfile } from "./verify";
import { scoreCompany } from "./scoring";
import { getLeadSettings } from "./settings";
import { saveDiscovery, type CompanyDraft, type SourceDraft } from "./repo";

/**
 * AYZENITH LEAD FINDER — discovery + verification pipeline (V2).
 *
 * Strict order (§12/§35):
 *   DISCOVERY (free) → DEDUP → CLASSIFY → WEBSITE VERIFICATION → SCORE → SAVE.
 * Verification is staged and bounded: only candidates with a website are fetched,
 * capped per run, with bounded concurrency — so the pipeline stays free, polite
 * and fast. Un-verified candidates are kept and clearly marked "doğrulanmadı"
 * (never dropped, never treated as negative, §18). Provider outages are recorded
 * on the search and surfaced, never masked (§16/§31).
 */

export type DiscoverParams = {
  countryIso: string;
  city?: string;
  productQuery: string;
  businessModel: string; // "B2B" | "B2C"
  leadTypes: string[]; // [] = all
  radarSnapshotId?: string | null;
  categoryKey?: string | null;
  hs6?: string | null;
  radarScore?: number | null;
  radarDecision?: string | null;
  createdById?: string | null;
};

export type DiscoverResult = {
  searchId: string;
  discovered: number;
  verified: number;
  discoveryStatus: "OK" | "PARTIAL" | "FAILED";
  errors: string[];
};

/** Cap website verifications per run (performance + politeness). The rest stay
 *  "not checked" — honestly, not negatively. Cache makes re-runs cheap. */
const VERIFY_CAP = 40;
const VERIFY_CONCURRENCY = 8;

/** Bounded-concurrency map (same pattern RADAR uses for its providers). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i] as T, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function runDiscovery(params: DiscoverParams): Promise<DiscoverResult> {
  const countryIso = params.countryIso.toUpperCase();
  const countryLabel = COUNTRY_LABELS[countryIso] ?? countryIso;
  const settings = await getLeadSettings();
  const errors: string[] = [];

  const { profile, matched } = resolveProductProfile(params.productQuery);
  const productTerms = Array.from(
    new Set([...profile.terms.de, ...profile.terms.en, ...profile.terms.tr]),
  );

  // 1. DISCOVERY — OpenStreetMap (free), query-expanded + city-expanded + resilient.
  const osm = await discoverOsm({
    countryIso,
    countryLabel,
    city: params.city,
    shops: profile.osmShops,
    nameTerms: [...profile.terms.de, ...profile.terms.en],
    businessModel: params.businessModel,
  });
  const candidates = osm.candidates;
  errors.push(...osm.errors);
  const discoveryStatus = osm.status;
  const sourceStats = {
    osm: {
      status: osm.status,
      queriesRun: osm.queriesRun,
      queriesOk: osm.queriesOk,
      queriesFailed: osm.queriesFailed,
      rawResults: osm.rawResults,
      queries: osm.queries,
    },
  };
  if (osm.status === "FAILED") {
    errors.push(
      "Discovery kaynağına (OpenStreetMap) erişilemedi. Bu nedenle bu arama için güvenilir bir '0 sonuç' kararı verilemez — lütfen biraz sonra tekrar deneyin.",
    );
  }
  if (profile.serviceOriented) {
    errors.push(
      "Bu ürün ağırlıklı olarak hizmet/klinik kanalıyla satıldığından ücretsiz mağaza kaynaklarında (OSM) kapsam sınırlı olabilir; sonuç azlığı 'bu pazarda firma yok' anlamına gelmez.",
    );
  }

  // 2. DEDUP (§13/§14) — company identity + branches.
  const deduped = dedupeCandidates(candidates);

  // Product-fit tier inputs (§2) + model for qualification (§1/§5).
  const strongTerms = profile.signals?.strong ?? [];
  const specificShops = profile.specificShops ?? [];
  const productSignals = profile.signals;

  // 3. CLASSIFY (discovery-time roles/size/product tier).
  const classifications = deduped.map((dc) => classify(dc, { productMatched: matched, specificShops, strongTerms }));

  // 4. WEBSITE VERIFICATION — cap to candidates that have a website.
  // V3.2: the cap is spent on the MOST PROMISING candidates for the searched
  // model, not on whatever OSM happened to return first. Raw discovery order used
  // to push real wholesalers past the cutoff, leaving them permanently
  // productFit=UNVERIFIED → DATA_LIMITED → never reachable for HIGH (§9). This is
  // an ORDERING change only: same cap, same checks, no new source, deterministic.
  const verifyRank = (i: number): number => {
    const dc = deduped[i]!;
    const cls = classifications[i]!;
    let rank = 0;
    const wantsB2B = params.businessModel !== "B2C";
    const supplier = cls.roles.some((r) => B2B_SUPPLIER_ROLES.includes(r));
    const consumer = cls.roles.some((r) => B2C_ROLES.includes(r));
    // Role that matches the searched channel comes first.
    if (wantsB2B ? supplier : consumer) rank += 4;
    // A real product signal at discovery time (specific shop tag / name match).
    if (cls.productFit === "LIKELY") rank += 2;
    // A firm we saw at several addresses is a more substantial business.
    if (dc.branchCount > 1) rank += 1;
    return rank;
  };
  const verifiable = deduped
    .map((dc, i) => i)
    .filter((i) => Boolean(deduped[i]!.candidate.website))
    // Stable: higher rank first, original discovery order within a rank.
    .sort((a, b) => verifyRank(b) - verifyRank(a) || a - b)
    .slice(0, VERIFY_CAP);
  const outcomes: (VerifyOutcome | null)[] = new Array(deduped.length).fill(null);
  await mapLimit(verifiable, VERIFY_CONCURRENCY, async (idx) => {
    const dc = deduped[idx]!;
    try {
      outcomes[idx] = await verifyCandidate(dc, classifications[idx]!, {
        productTerms,
        productMatched: matched,
        domain: normalizeDomain(dc.candidate.website),
        searchModel: params.businessModel,
        productSignals,
      });
    } catch {
      outcomes[idx] = null;
    }
  });
  const verifiedCount = outcomes.filter((o) => o?.verified).length;

  // 5. SCORE + build drafts.
  const now = new Date();
  const drafts: CompanyDraft[] = deduped.map((dc, i) => {
    const classification = classifications[i]!;
    const outcome = outcomes[i] ?? unverifiedOutcome(dc, classification, params.businessModel);

    const cityMatched = params.city
      ? (dc.candidate.city ?? "").toLocaleLowerCase("tr") === params.city.toLocaleLowerCase("tr")
      : null;

    const score = scoreCompany(
      {
        candidate: dc.candidate,
        roles: outcome.roles,
        size: outcome.size,
        productFit: outcome.productFit,
        modelFit: outcome.modelFit,
        websiteStatus: outcome.websiteStatus,
        businessModel: params.businessModel,
        inTargetMarket: true,
        cityMatched,
        contactCount: outcome.contacts.length,
        hasCompanyContact: Boolean(outcome.email ?? dc.candidate.email ?? outcome.phone ?? dc.candidate.phone),
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

    // Provenance (§19): OSM rows + website-derived rows.
    const osmLabel = dc.candidate.sourceLabel ?? "OpenStreetMap";
    const sources: SourceDraft[] = [
      { dataField: "existence", sourceType: "OSM", label: osmLabel, sourceUrl: dc.candidate.sourceUrl },
    ];
    if (dc.candidate.address) sources.push({ dataField: "address", sourceType: "OSM", label: osmLabel, sourceUrl: dc.candidate.sourceUrl });
    if (dc.candidate.website) sources.push({ dataField: "website", sourceType: "OSM", label: osmLabel, sourceUrl: dc.candidate.sourceUrl });
    for (const es of outcome.extraSources) {
      sources.push({ dataField: es.dataField, sourceType: es.sourceType, label: es.label, sourceUrl: es.sourceUrl });
    }

    const social = socialUrls(outcome.socials);

    return {
      candidate: dc.candidate,
      domain: normalizeDomain(dc.candidate.website),
      legalName: outcome.legalName,
      canonicalName: dc.canonicalName,
      roles: outcome.roles,
      size: outcome.size,
      sizeSignals: outcome.sizeSignals,
      productFit: outcome.productFit,
      productFitTier: outcome.productFitTier,
      productFitNote: outcome.productFitNote,
      detectedModel: outcome.detectedModel,
      modelFit: outcome.modelFit,
      modelFitEvidence: outcome.modelFitEvidence,
      websiteStatus: outcome.websiteStatus,
      productCategories: outcome.productCategories,
      storeCount: outcome.storeCount,
      employeeCount: outcome.employeeCount,
      locationCount: dc.branchCount,
      matchStatus: null, // reserved for UNCERTAIN_MATCH (§14)
      verifiedAt: outcome.verified ? now : null,
      email: outcome.email,
      phone: outcome.phone,
      instagramUrl: social.instagram ?? null,
      facebookUrl: social.facebook ?? null,
      linkedinUrl: social.linkedin ?? null,
      tiktokUrl: social.tiktok ?? null,
      youtubeUrl: social.youtube ?? null,
      xUrl: social.x ?? null,
      socialMatchStatus: outcome.socialMatchStatus,
      socialProductSignal: outcome.socialProductSignal,
      socialBusinessSignal: outcome.socialBusinessSignal,
      socialVerifiedAt: outcome.socialVerified ? now : null,
      leadScore: score.leadScore,
      leadConfidence: score.leadConfidence,
      scoreBreakdown: {
        components: score.components,
        measuredComponents: score.measuredComponents,
        dataLimited: score.dataLimited,
        weights: settings.weights,
      },
      status,
      sources,
      contacts: outcome.contacts,
      verifications: outcome.verifications,
      locations: dc.locations,
      radarSnapshotId: params.radarSnapshotId ?? null,
    };
  });

  // Sort strongest-first (NOT_RELEVANT sinks to the bottom but is kept, §2).
  drafts.sort((a, b) => {
    const ra = a.productFit === "NOT_RELEVANT" ? -1000 : 0;
    const rb = b.productFit === "NOT_RELEVANT" ? -1000 : 0;
    return (b.leadScore ?? -1) + rb - ((a.leadScore ?? -1) + ra);
  });

  // 6. SAVE.
  const { searchId, savedCount } = await saveDiscovery(
    {
      country: countryIso,
      countryLabel,
      city: params.city ?? null,
      productQuery: params.productQuery,
      businessModel: params.businessModel,
      leadTypes: params.leadTypes,
      searchTerms: productTerms,
      radarSnapshotId: params.radarSnapshotId ?? null,
      categoryKey: params.categoryKey ?? null,
      hs6: params.hs6 ?? null,
      radarScore: params.radarScore ?? null,
      radarDecision: params.radarDecision ?? null,
      discoveryStatus,
      sourceStats,
      errors,
      createdById: params.createdById ?? null,
    },
    drafts,
  );

  return { searchId, discovered: savedCount, verified: verifiedCount, discoveryStatus, errors };
}

/** Map social profiles by platform to named URL fields. */
function socialUrls(socials: SocialProfile[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const s of socials) out[s.platform] = s.url;
  return out;
}

/** A no-website-check outcome: keep discovery classification, mark website as
 *  "not checked" (null) rather than reachable/unreachable — honest unknown. */
function unverifiedOutcome(
  dc: DedupedCandidate,
  classification: ReturnType<typeof classify>,
  searchModel: string,
): VerifyOutcome {
  const mf = computeModelFit(searchModel, classification.roles, null, false);
  return {
    websiteStatus: dc.candidate.website ? null : "NONE",
    productFit: classification.productFit,
    productFitTier: classification.productFitTier,
    productFitNote: classification.productFitNote,
    roles: classification.roles,
    size: classification.size,
    sizeSignals: classification.sizeSignals,
    detectedModel: null,
    modelFit: mf.fit,
    modelFitEvidence: mf.evidence,
    productCategories: [],
    storeCount: null,
    employeeCount: null,
    legalName: null,
    email: null,
    phone: null,
    contacts: [],
    verifications: [
      { check: "in-target-country", passed: true, evidence: "Hedef pazar içinde keşfedildi.", sourceUrl: dc.candidate.sourceUrl },
      {
        check: "website-present",
        passed: null,
        evidence: dc.candidate.website ? "Website mevcut; bu turda doğrulanmadı." : "Website bulunamadı.",
        sourceUrl: dc.candidate.website ?? dc.candidate.sourceUrl,
      },
    ],
    extraSources: [],
    socials: [],
    socialMatchStatus: null,
    socialProductSignal: null,
    socialBusinessSignal: null,
    socialVerified: false,
    verified: false,
  };
}
