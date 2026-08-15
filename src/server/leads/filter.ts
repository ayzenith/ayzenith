import { qualifiedPriority, type LeadPriority } from "@/config/leads";
import type { LeadCompanyView } from "./leads";

/**
 * AYZENITH LEAD FINDER — shared result filtering + summary (V2.1, §2/§7/§15).
 *
 * ONE pure filter used by BOTH the results screen and the export route, so an
 * export always contains exactly what the active filters show on screen (§16).
 * Priority is the GATED priority (§6): a high score alone never yields HIGH —
 * model-fit, product-fit, an active website and a contact route are required.
 * NOT_RELEVANT products and NOT_SUITABLE (wrong-model) firms are hidden by
 * default (kept in the DB, never deleted) unless a filter explicitly asks.
 */

export type LeadFilters = {
  role?: string;
  size?: string;
  city?: string;
  minScore?: number;
  fit?: string;
  priority?: string;
  modelFit?: string; // "VERIFIED" | "POSSIBLE" | "NOT_SUITABLE" | "UNVERIFIED"
  website?: string; // "yes" (active only)
  contact?: string; // "yes"
  social?: string; // "yes"
};

/** True when a lead has a real contact route (decision-maker OR company email/phone). */
export function hasContact(c: LeadCompanyView): boolean {
  return c.contactCount > 0 || Boolean(c.email) || Boolean(c.phone);
}

/** The GATED priority for a lead (§6). Used everywhere so card/summary/filter agree. */
export function priorityOf(c: LeadCompanyView): LeadPriority {
  return qualifiedPriority({
    leadScore: c.leadScore,
    modelFit: c.modelFit,
    productFit: c.productFit,
    websiteStatus: c.websiteStatus,
    hasContact: hasContact(c),
  });
}

export function parseLeadFilters(sp: Record<string, string | string[] | undefined>): LeadFilters {
  const get = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const minScoreRaw = get("minScore");
  const minScore = minScoreRaw ? Number(minScoreRaw) : undefined;
  return {
    role: get("role") || undefined,
    size: get("size") || undefined,
    city: get("city") || undefined,
    minScore: Number.isFinite(minScore) ? minScore : undefined,
    fit: get("fit") || undefined,
    priority: get("priority") || undefined,
    modelFit: get("modelFit") || undefined,
    website: get("website") || undefined,
    contact: get("contact") || undefined,
    social: get("social") || undefined,
  };
}

export function applyLeadFilters(companies: LeadCompanyView[], f: LeadFilters): LeadCompanyView[] {
  return companies.filter((c) => {
    // Hidden-by-default: irrelevant products and wrong-model firms (§2/§7).
    if (c.productFit === "NOT_RELEVANT" && f.fit !== "NOT_RELEVANT") return false;
    if (c.modelFit === "NOT_SUITABLE" && f.modelFit !== "NOT_SUITABLE") return false;

    if (f.role && !c.commercialRoles.includes(f.role)) return false;
    if (f.size && c.size !== f.size) return false;
    if (f.city && (c.city ?? "").toLocaleLowerCase("tr") !== f.city.toLocaleLowerCase("tr")) return false;
    if (f.minScore != null && (c.leadScore ?? -1) < f.minScore) return false;
    if (f.fit && c.productFit !== f.fit) return false;
    if (f.modelFit && c.modelFit !== f.modelFit) return false;
    if (f.priority && priorityOf(c) !== f.priority) return false;
    if (f.website === "yes" && c.websiteStatus !== "ACTIVE") return false;
    if (f.contact === "yes" && c.contactCount <= 0) return false;
    if (f.social === "yes" && c.socialMatchStatus !== "VERIFIED") return false;
    return true;
  });
}

/** Distinct, sorted cities present in a result set — for the city filter. */
export function distinctCities(companies: LeadCompanyView[]): string[] {
  const set = new Set<string>();
  for (const c of companies) if (c.city) set.add(c.city);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
}

export type LeadSummary = {
  total: number; // excluding NOT_RELEVANT + NOT_SUITABLE (the hidden set)
  verified: number; // productFit VERIFIED
  likely: number;
  needsReview: number; // UNCLEAR
  unverified: number; // website not checked
  notRelevant: number;
  // Model fit (for the searched model)
  modelVerified: number;
  modelPossible: number;
  notSuitable: number;
  // Gated priority
  high: number;
  medium: number;
  low: number;
  withContact: number;
  withSocial: number;
  totalLocations: number;
  // Verification COVERAGE (§V3.3). The gap this closes: an UNCLEAR product fit
  // can mean "we read the site and it was inconclusive" OR "we never opened the
  // site at all", and the screen used to render both identically. Counting how
  // many firms were actually reached keeps the difference visible.
  siteChecked: number; // website fetch ran and the site answered
  siteUnreachable: number; // website known, but it did not answer this run
  /** HAS a website, no run has reached it yet — a queue, and it will shrink. */
  sitePending: number;
  /** No website at all. NOT a queue: there is nothing here to check, ever, and
   *  it must not be reported as "we did not get to it". Lumping these together
   *  told the owner 187 firms were awaiting a look when only 62 were, and made
   *  coverage read as 40 of 227 instead of 40 of the 102 that have a site. */
  siteNone: number;
};

/** Headline counts for the result screen (§15). Computed from the full set. */
export function summarize(companies: LeadCompanyView[]): LeadSummary {
  const s: LeadSummary = {
    total: 0, verified: 0, likely: 0, needsReview: 0, unverified: 0, notRelevant: 0,
    modelVerified: 0, modelPossible: 0, notSuitable: 0,
    high: 0, medium: 0, low: 0, withContact: 0, withSocial: 0, totalLocations: 0,
    siteChecked: 0, siteUnreachable: 0, sitePending: 0, siteNone: 0,
  };
  for (const c of companies) {
    s.totalLocations += Math.max(1, c.locationCount ?? 1);
    if (c.productFit === "NOT_RELEVANT") { s.notRelevant++; continue; }
    if (c.modelFit === "NOT_SUITABLE") { s.notSuitable++; continue; }
    s.total++;
    if (c.productFit === "VERIFIED") s.verified++;
    else if (c.productFit === "LIKELY") s.likely++;
    else if (c.productFit === "UNCLEAR") s.needsReview++;
    else s.unverified++;
    if (c.modelFit === "VERIFIED") s.modelVerified++;
    else if (c.modelFit === "POSSIBLE") s.modelPossible++;
    const p = priorityOf(c);
    if (p === "HIGH") s.high++;
    else if (p === "MEDIUM") s.medium++;
    else if (p === "LOW") s.low++;
    if (hasContact(c)) s.withContact++;
    if (c.socialMatchStatus === "VERIFIED") s.withSocial++;
    if (c.websiteStatus === "ACTIVE") s.siteChecked++;
    else if (c.websiteStatus === "UNREACHABLE") s.siteUnreachable++;
    else if (c.websiteStatus === "NONE") s.siteNone++;
    else s.sitePending++;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Relevance ordering (§V3.8)
// ---------------------------------------------------------------------------

/**
 * How relevant a firm is TO THE SEARCHED PRODUCT, as a rank for ordering.
 *
 * The score deliberately does NOT answer this. When product fit is UNVERIFIED
 * the component is marked unavailable and the score is re-normalised over the
 * remaining criteria — which is the honest thing to do, because "we did not
 * look" must never read as "this firm is bad". But it means a firm with no
 * product relevance at all is not held back either: it is simply scored on
 * being a well-documented wholesaler.
 *
 * The first live Berlin run showed exactly what that costs. Searching for
 * kadın iç giyim returned Raab Karcher (building materials) at 76 and Sonepar
 * (electrical) at 73, above every one of the seven actual lingerie shops —
 * Mode & Dessous 68, Rose Rosa Dessous-Fachgeschäft 58, Anna Dessous, Change
 * Lingerie, Viabella Dessous and Damenwäsche at 53. A meat wholesaler and a
 * flower market outranked a Dessous-Fachgeschäft.
 *
 * So relevance drives the ORDER while the score keeps its meaning. Nothing is
 * penalised for being unchecked: "no product proof" sits in the middle, above
 * only firms we actually looked at and found unrelated. The tier split matters
 * too — a STRONG signal is a specific shop tag or the firm's own name, which is
 * what separates a Dessous shop from the workwear catalogues that merely list
 * "Unterwäsche" among boots and ear protection.
 */
export function relevanceRank(c: LeadCompanyView): number {
  if (c.productFit === "NOT_RELEVANT") return 0; // checked, and contradicted
  if (c.productFit === "VERIFIED") return 6;
  if (c.productFit === "LIKELY") return c.productFitTier === "STRONG" ? 5 : 4;

  // "We looked and found nothing" is NOT the same as "we never looked" (§V3.10).
  //
  // Both used to sit at the same rank, and the first live Milano run showed what
  // that costs. The OSM wholesale tag says a firm sells in bulk but never says
  // WHAT it sells, and in Milano that tag is dominated by construction: the
  // kadın-iç-giyim search surfaced Pibamarmi (marble), Mastro Legno (timber),
  // Attorgomma (rubber), Ecofer and Parasider (steel) and four builders' merchants.
  // We fetched their sites and found no lingerie term anywhere on them — yet
  // Pibamarmi still ranked at 78, ABOVE Intimissimi at 59, a genuine four-branch
  // lingerie chain whose site we never opened because OSM lists no website for it.
  //
  // Reading a firm's own site and finding no trace of the product is weak evidence,
  // but it IS evidence, and it is strictly more than we know about a firm we never
  // opened. So it ranks below "not looked at" — while still, deliberately, ranking
  // above NOT_RELEVANT. Nothing here is called irrelevant and nothing is hidden:
  // the honesty doctrine forbids treating a gap as a negative, and an absence found
  // on a page we actually read is not a gap.
  if (c.websiteStatus === "ACTIVE") return 1;

  // Among the firms we could NOT read, two things are still distinguishable, and
  // the pipeline already records the difference — it just was not being used for
  // ordering (§V3.10). UNCLEAR means discovery found a generic category tag that
  // belongs to the searched product's family; UNVERIFIED means no product signal
  // of any kind was ever seen.
  //
  // The second Milano run made the cost visible. Intimissimi and Calzedonia carry
  // OSM's `shop=clothes` — weak, but it is the right family — while Ecofer (steel),
  // Parasider (steel), METRO (food) and Daniele Cabibbe carry nothing at all. All
  // four sat above both lingerie chains purely because an unreachable wholesaler
  // scores higher on data completeness than a shop with no website.
  //
  // A weak signal in the right family outranks no signal. Neither is called
  // proof, and the score is untouched.
  if (c.productFit === "UNCLEAR") return 3;

  return 2; // nothing known about the product at all
}

/** Order for the results list: relevance first, then the score within it. */
export function sortByRelevance(companies: LeadCompanyView[]): LeadCompanyView[] {
  return [...companies].sort(
    (a, b) =>
      relevanceRank(b) - relevanceRank(a) ||
      (b.leadScore ?? -1) - (a.leadScore ?? -1) ||
      a.name.localeCompare(b.name, "tr"),
  );
}
