import "server-only";

import { COUNTRY_LABELS, resolveProductProfile, B2B_SUPPLIER_ROLES, B2C_ROLES } from "@/config/leads";
import { discoverOsm } from "./providers/overpass";
import { dedupeCandidates, normalizeDomain, type DedupedCandidate } from "./dedup";
import { classify } from "./classify";
import { resolveBrandFacts, type BrandFacts } from "./providers/wikidata";
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

/** Website verification is STAGED (§V3.3) so the request budget buys the widest
 *  honest coverage instead of a deep read of an arbitrary few.
 *
 *  Stage 1 reads the HOMEPAGE ONLY (1 request) for a wide set — that alone
 *  settles reachability, product evidence, role/model signals and social links,
 *  i.e. everything the qualification gate actually reads.
 *  Stage 2 re-reads only the PROMISING candidates in full (Impressum/Kontakt/
 *  about) to collect legal name, decision-makers and contact details. Because
 *  pages are cached per URL, that second pass re-uses the homepage for free and
 *  pays only for the sub-pages.
 *
 *  Old behaviour was a single full read of 40 sites (~160 requests) leaving ~80%
 *  of a typical 200-firm run never looked at. Staging covers 90 for a comparable
 *  budget. Everything beyond the caps is still marked "not checked" — honestly,
 *  never negatively. */
// Sized for the WAIT, not for coverage. Deferred verification (§V3.4) finishes
// every remaining firm afterwards — on demand from the results screen or by the
// hourly cron — so the in-run pass no longer has to be exhaustive, and every
// extra site read here is paid for in time someone spends watching a loading
// screen. A first view with more "kontrol edilmedi", stated plainly and with a
// button to continue, beats a longer wait for the same eventual answer.
//
// Phase timings from a cold Köln run, which corrected two guesses of mine:
// verification was NOT the expensive part (shallow 13.5s, deep 13.7s), and the
// sequential database save was (127s of 222s). The save is now parallel, and a
// cold Stuttgart run finishes in 110s inside a 300s ceiling. These caps are kept
// modest on their own merits rather than to buy back that headroom.
const SHALLOW_CAP = 40;
const DEEP_CAP = 12;
/** The shallow pass is one request per host against MANY different domains, so it
 *  can run wider without being impolite to anyone; the deep pass hits the same
 *  host repeatedly and stays at the original, gentler width. */
const SHALLOW_CONCURRENCY = 18;
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
  const dedupedRaw = dedupeCandidates(candidates);

  // Product-fit tier inputs (§2) + model for qualification (§1/§5).
  const strongTerms = profile.signals?.strong ?? [];
  const specificShops = profile.specificShops ?? [];
  const productSignals = profile.signals;

  // 3. CLASSIFY (discovery-time roles/size/product tier).
  // What Wikidata says each discovered CHAIN sells (§V3.11). One batched, heavily
  // cached lookup for the whole search — it is the only free source that knows
  // Intimissimi sells lingerie while OSM only knows it is a clothes shop.
  let brandFacts = new Map<string, BrandFacts>();
  try {
    brandFacts = await resolveBrandFacts(
      dedupedRaw.map((dc) => dc.candidate.brandWikidataId).filter((q): q is string => Boolean(q)),
    );
  } catch {
    // A brand lookup failure must never fail a search — the run simply keeps the
    // knowledge it already had.
  }

  // WIKIDATA WEBSITE BACKFILL (2026-08-23). OSM gives no website at all for most
  // discovered firms — measured live at ~60% of a typical run — and a company
  // with no website is one this pipeline can never learn anything about: no
  // product proof, no role, no contact, permanently UNCLEAR/UNVERIFIED. Deep
  // Dive (deepdive.ts, §V3.12) already proved that Wikidata's P856 "official
  // website" recovers exactly this for branded chains — Calzedonia, Intimissimi
  // and Yamamay all have zero website in OSM but a real one on Wikidata — but
  // that recovery only ever ran for the 3 firms a human clicked "derin inceleme"
  // on. This folds the SAME already-cited, already-honest fact into the regular
  // pipeline for every candidate that carries a `brand:wikidata` tag: a
  // websiteless firm whose brand Wikidata entry states an official site is
  // treated as if it HAD that website for ranking/verification/scoring, subject
  // to the exact same SHALLOW_CAP/DEEP_CAP budget as any OSM-sourced website —
  // no new cap, no new provider call (brandFacts was already being fetched for
  // product signal), and the site is still read for itself before anything is
  // asserted as verified. Provenance stays honest: the "website" source below is
  // attributed to Wikidata, never misrepresented as OSM's own tag.
  const websiteFromWikidata: boolean[] = new Array(dedupedRaw.length).fill(false);
  const deduped: DedupedCandidate[] = dedupedRaw.map((dc, i) => {
    if (dc.candidate.website) return dc;
    const qid = dc.candidate.brandWikidataId;
    const site = qid ? brandFacts.get(qid)?.officialWebsite : undefined;
    if (!site) return dc;
    websiteFromWikidata[i] = true;
    return { ...dc, candidate: { ...dc.candidate, website: site } };
  });

  const classifications = deduped.map((dc) =>
    classify(dc, {
      productMatched: matched,
      specificShops,
      strongTerms,
      mediumTerms: profile.signals?.medium ?? [],
      brandFacts: dc.candidate.brandWikidataId ? brandFacts.get(dc.candidate.brandWikidataId) : undefined,
    }),
  );

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
  const ranked = deduped
    .map((dc, i) => i)
    .filter((i) => Boolean(deduped[i]!.candidate.website))
    // Stable: higher rank first, original discovery order within a rank.
    .sort((a, b) => verifyRank(b) - verifyRank(a) || a - b);

  const outcomes: (VerifyOutcome | null)[] = new Array(deduped.length).fill(null);

  const runVerify = async (idx: number, depth: "shallow" | "full") => {
    const dc = deduped[idx]!;
    try {
      return await verifyCandidate(dc, classifications[idx]!, {
        productTerms,
        productMatched: matched,
        domain: normalizeDomain(dc.candidate.website),
        searchModel: params.businessModel,
        productSignals,
        depth,
        country: countryIso,
      });
    } catch {
      return null;
    }
  };

  // STAGE 1 — cheap homepage read over the widest set we can afford.
  const shallowList = ranked.slice(0, SHALLOW_CAP);
  await mapLimit(shallowList, SHALLOW_CONCURRENCY, async (idx) => {
    outcomes[idx] = await runVerify(idx, "shallow");
  });

  // STAGE 2 — full read for candidates a deeper look could still change. The
  // HIGH gate needs a contact route, and contacts live on Impressum/Kontakt, so
  // anything with real product OR model evidence earns the second pass.
  const deepList = shallowList
    .filter((idx) => {
      const o = outcomes[idx];
      if (!o || o.websiteStatus !== "ACTIVE") return false;
      return o.productFit === "VERIFIED" || o.productFit === "LIKELY" || o.modelFit === "VERIFIED";
    })
    .sort((a, b) => {
      // Strongest evidence first, so a tight DEEP_CAP spends itself well.
      const weight = (i: number) => {
        const o = outcomes[i]!;
        return (o.productFit === "VERIFIED" ? 2 : o.productFit === "LIKELY" ? 1 : 0) + (o.modelFit === "VERIFIED" ? 2 : 0);
      };
      return weight(b) - weight(a) || a - b;
    })
    .slice(0, DEEP_CAP);
  await mapLimit(deepList, VERIFY_CONCURRENCY, async (idx) => {
    const full = await runVerify(idx, "full");
    // Never let a failed deep read discard what the shallow pass already proved.
    if (full) outcomes[idx] = full;
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
    if (dc.candidate.website) {
      // Honest provenance for the WEBSITE field specifically: if OSM never
      // tagged one and this firm's brand Wikidata entry supplied it instead
      // (2026-08-23 backfill, above), the source must say Wikidata — never
      // presented as if OSM had it.
      sources.push(
        websiteFromWikidata[i]
          ? {
              dataField: "website",
              sourceType: "OTHER_FREE_SOURCE",
              label: `Wikidata resmi site kaydı — ${dc.candidate.name}`,
              sourceUrl: `https://www.wikidata.org/wiki/${dc.candidate.brandWikidataId}`,
            }
          : { dataField: "website", sourceType: "OSM", label: osmLabel, sourceUrl: dc.candidate.sourceUrl },
      );
    }
    // Wikidata brand record — cited whenever it told us anything (§V3.11). This is
    // provenance first, but it is also how the deep dive later recovers the brand
    // id: a chain with no website in OSM still has an official site on Wikidata,
    // and this row is where that trail starts.
    {
      const qid = dc.candidate.brandWikidataId;
      if (qid && brandFacts.has(qid)) {
        sources.push({
          dataField: "brand",
          sourceType: "OTHER_FREE_SOURCE",
          label: `Wikidata marka kaydı — ${brandFacts.get(qid)!.label || dc.candidate.name}`,
          sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
        });
      }
    }
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
    // No site was read, so there is nothing to attribute — identity stays
    // genuinely unknown rather than being reported as unverified-and-checked.
    identityStatus: null,
    identityConfidence: null,
    identityReasons: [],
    // No site was read, so no product evidence was gathered either. Null rather
    // than level 0: "we did not look" is not "we looked and found nothing".
    productEvidenceLevel: null,
    productConfidence: null,
    productEvidenceReasons: [],
    productNegatives: [],
    companyType: null,
    companyTypeConfidence: null,
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
