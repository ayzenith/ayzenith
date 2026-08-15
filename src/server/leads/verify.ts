import "server-only";

import { fetchSiteIntel, type SiteIntel, type ProductSignals, type SiteDepth } from "./providers/website";
import { checkVatId } from "./providers/vies";
import type { DedupedCandidate } from "./dedup";
import type { Classification } from "./classify";
import {
  normalizeProduct, B2B_SUPPLIER_ROLES, B2B_STRONG_SUPPLIER_ROLES, B2B_BUYER_ROLES, B2C_ROLES,
  SOCIAL_PLATFORMS, type LeadRole, type ModelFit,
} from "@/config/leads";

/**
 * AYZENITH LEAD FINDER — verification & enrichment (V2, §1–§7/§11).
 *
 * Takes a discovered+classified candidate and, when it has a website, upgrades it
 * with real website intelligence: product-fit verification, commercial roles,
 * business model, company scale, contact info and decision-makers — plus a row
 * per verification check and a source per enriched field. It NEVER invents: no
 * website ⇒ everything stays as discovery left it (marked "doğrulanmadı"), and a
 * value is only produced when it was literally found on a source.
 */

export type ContactDraft = {
  firstName?: string;
  lastName?: string;
  role?: string;
  roleVerified: boolean;
  corporateEmail?: string;
  profileUrl?: string;
  confidence: number;
  source: "OFFICIAL_WEBSITE" | "PUBLIC_WEB";
  sourceUrl?: string;
};

export type VerificationDraft = {
  check: string;
  passed: boolean | null;
  evidence?: string;
  sourceUrl?: string;
};

export type ExtraSource = {
  dataField: string;
  sourceType: "OFFICIAL_WEBSITE" | "PUBLIC_WEB";
  label?: string;
  sourceUrl?: string;
};

export type SocialProfile = { platform: string; url: string };

export type VerifyOutcome = {
  websiteStatus: "ACTIVE" | "UNREACHABLE" | "NONE" | null;
  productFit: "VERIFIED" | "LIKELY" | "UNCLEAR" | "NOT_RELEVANT" | "UNVERIFIED";
  productFitTier: "STRONG" | "MEDIUM" | "WEAK" | null;
  productFitNote: string | null;
  roles: LeadRole[];
  size: "LARGE" | "MEDIUM" | "SMALL" | "MICRO" | "ONLINE" | "UNKNOWN";
  sizeSignals: Array<{ label: string; value: string; source: string }>;
  detectedModel: "B2B" | "B2C" | "BOTH" | null;
  /** Model-fit for the SEARCHED model (§1/§5) + human-readable evidence (§8). */
  modelFit: ModelFit;
  modelFitEvidence: string[];
  productCategories: string[];
  storeCount: number | null;
  employeeCount: number | null;
  legalName: string | null;
  /** Company-level enrichment (only when the company lacked it). */
  email: string | null;
  phone: string | null;
  contacts: ContactDraft[];
  verifications: VerificationDraft[];
  extraSources: ExtraSource[];
  // Social intelligence (website-sourced, §13–§29).
  socials: SocialProfile[];
  socialMatchStatus: "VERIFIED" | "POSSIBLE" | "UNVERIFIED" | null;
  socialProductSignal: "STRONG" | "WEAK" | null;
  socialBusinessSignal: "B2B" | "B2C" | null;
  socialVerified: boolean;
  verified: boolean; // did a website check actually run?
};

const ROLE_SET: ReadonlySet<LeadRole> = new Set<LeadRole>([
  "importer", "distributor", "wholesaler", "sourcing", "manufacturer", "retailer",
  "retail_chain", "independent_store", "boutique", "specialty_store",
  "department_store", "ecommerce", "marketplace_seller", "other",
]);

function mergeRoles(osmRoles: LeadRole[], siteRoles: string[]): LeadRole[] {
  const set = new Set<LeadRole>(osmRoles.filter((r) => r !== "other"));
  for (const r of siteRoles) if (ROLE_SET.has(r as LeadRole)) set.add(r as LeadRole);
  if (set.size === 0) set.add("other");
  return Array.from(set);
}

function sizeFromEmployees(n: number): VerifyOutcome["size"] {
  if (n >= 250) return "LARGE";
  if (n >= 50) return "MEDIUM";
  if (n >= 10) return "SMALL";
  return "MICRO";
}
function sizeFromStores(n: number): VerifyOutcome["size"] {
  if (n >= 10) return "LARGE";
  if (n >= 3) return "MEDIUM";
  return "SMALL";
}

/** Choose the company's generic contact email from the site (info@, kontakt@…). */
function pickCompanyEmail(emails: string[], domain?: string): string | null {
  const preferred = ["einkauf", "purchasing", "info", "kontakt", "contact", "office", "mail", "sales", "vertrieb"];
  const onDomain = domain ? emails.filter((e) => e.endsWith(`@${domain}`)) : emails;
  const pool = onDomain.length > 0 ? onDomain : emails;
  for (const p of preferred) {
    const hit = pool.find((e) => e.split("@")[0]?.toLowerCase().includes(p));
    if (hit) return hit;
  }
  return pool[0] ?? null;
}

/** Attach an email to a contact ONLY if its local part contains the surname —
 *  never fabricate a firstname.lastname@ address (§6). */
function emailForPerson(emails: string[], lastName?: string): string | undefined {
  if (!lastName) return undefined;
  const key = normalizeProduct(lastName).replace(/\s+/g, "");
  if (key.length < 3) return undefined;
  return emails.find((e) => normalizeProduct(e.split("@")[0] ?? "").replace(/\s+/g, "").includes(key));
}

const has = (roles: LeadRole[], set: LeadRole[]) => roles.some((r) => set.includes(r));

/** Deterministic model-fit for the SEARCHED model (§1/§5/§7). Store labels are
 *  never treated as proof of B2B on their own; supplier roles / explicit site
 *  signals are. Missing data → UNVERIFIED (never a negative). */
export function computeModelFit(
  searchModel: string,
  roles: LeadRole[],
  detectedModel: "B2B" | "B2C" | "BOTH" | null,
  siteChecked: boolean,
): { fit: ModelFit; evidence: string[] } {
  const evidence: string[] = [];
  const supplier = has(roles, B2B_SUPPLIER_ROLES);
  const strongSupplier = has(roles, B2B_STRONG_SUPPLIER_ROLES);
  const maker = has(roles, ["manufacturer"]);
  const buyer = has(roles, B2B_BUYER_ROLES);
  const b2cRole = has(roles, B2C_ROLES);
  const b2bSignal = detectedModel === "B2B" || detectedModel === "BOTH";
  const b2cSignal = detectedModel === "B2C" || detectedModel === "BOTH";

  if (searchModel === "B2C") {
    if (b2cRole || detectedModel === "B2C" || detectedModel === "BOTH") {
      if (b2cRole) evidence.push("Perakende / tüketici kanalı rolü");
      if (b2cSignal) evidence.push("Website'de B2C (sepet/mağaza) sinyali");
      return { fit: "VERIFIED", evidence };
    }
    const supplierOnly = roles.length > 0 && roles.every((r) => B2B_SUPPLIER_ROLES.includes(r));
    if (siteChecked && b2bSignal && supplierOnly) {
      evidence.push("Yalnızca toptan/B2B sinyali — tüketici satışı doğrulanamadı");
      return { fit: "NOT_SUITABLE", evidence };
    }
    if (supplier) { evidence.push("Toptan rol (perakende de yapabilir)"); return { fit: "POSSIBLE", evidence }; }
    evidence.push("Tüketici kanalı doğrulanamadı");
    return { fit: "UNVERIFIED", evidence };
  }

  // B2B search. VERIFIED requires REAL supply-channel proof: a strong supplier
  // role (importer/distributor/wholesaler/sourcing) that is NOT a B2C retailer's
  // internal sourcing. OR an explicit website B2B signal without B2C roles.
  // V3.2: If strong supplier role is detected BUT company is a B2C retailer (buyer),
  // it's likely internal procurement (sourcing own stores), not external supply.
  // Example: C&A + "Distribütör" = internal distribution network, not B2B supplier.
  if (strongSupplier && !buyer) {
    // Real B2B supplier (no B2C retailer tag)
    evidence.push("İthalatçı/Distribütör/Toptancı/Tedarik rolü");
    if (b2bSignal) evidence.push("Website'de wholesale / B2B / Händler sinyali");
    return { fit: "VERIFIED", evidence };
  }
  if (strongSupplier && buyer) {
    // Strong supplier role BUT company is primarily a B2C retailer → internal sourcing
    evidence.push("İthalatçı/Distribütör/Tedarik rolü bulundu");
    evidence.push("Ancak temel ticari rol perakendedir — iç tedarik zinciri olabilir");
    return { fit: "POSSIBLE", evidence };
  }
  if (b2bSignal && !buyer) {
    // Explicit B2B website signal, no B2C retailer roles
    evidence.push("Website'de wholesale / B2B / Händler sinyali");
    return { fit: "VERIFIED", evidence };
  }
  if (b2bSignal && buyer) {
    // Website has B2B/wholesale signal but company is a B2C retailer (chain/boutique)
    evidence.push("Website'de B2B/toptancı sinyali var ama temel ticari rol perakendedir");
    evidence.push("Potansiyel kurumsal/franşiz kanalı, doğrulanmış B2B tedarikçi değil");
    return { fit: "POSSIBLE", evidence };
  }
  if (maker) {
    evidence.push("Üretici etiketi — potansiyel B2B tedarikçi");
    evidence.push("Ancak toptan/B2B satış kanalı doğrulanamadı");
    return { fit: "POSSIBLE", evidence };
  }
  if (buyer) {
    evidence.push("Mağaza / zincir — potansiyel B2B alıcı (toptan satın alabilir)");
    evidence.push("Ancak B2B ticari rol doğrulanamadı");
    return { fit: "POSSIBLE", evidence };
  }
  if (siteChecked && b2cSignal) {
    evidence.push("Yalnızca B2C (tüketici) sinyali — B2B için uygun değil");
    return { fit: "NOT_SUITABLE", evidence };
  }
  evidence.push("B2B ticari rol doğrulanamadı");
  return { fit: "UNVERIFIED", evidence };
}

/** Derive a light product/business signal from a social profile URL handle only
 *  (we do NOT read the platform). e.g. instagram.com/xyz_lingerie → product. */
function socialSignals(socials: SocialProfile[], strongTerms: string[]): {
  product: "STRONG" | "WEAK" | null;
  business: "B2B" | "B2C" | null;
} {
  const handles = socials.map((s) => {
    try { return new URL(s.url).pathname.toLowerCase(); } catch { return s.url.toLowerCase(); }
  }).join(" ");
  const strong = strongTerms.some((t) => t.length >= 4 && handles.includes(t.toLocaleLowerCase("de")));
  let business: "B2B" | "B2C" | null = null;
  if (/wholesale|grosshandel|großhandel|b2b|trade/.test(handles)) business = "B2B";
  else if (/shop|store|retail/.test(handles)) business = "B2C";
  return { product: strong ? "STRONG" : null, business };
}

export async function verifyCandidate(
  dc: DedupedCandidate,
  classification: Classification,
  opts: {
    productTerms: string[];
    productMatched: boolean;
    domain?: string;
    searchModel: string;
    productSignals?: ProductSignals;
    /** How deeply to read the site (§V3.3). Defaults to the full read so every
     *  existing caller keeps its old behaviour. */
    depth?: SiteDepth;
    /** ISO country the firm was discovered in (§V3.9). Selects which sub-page
     *  paths to ask for — never which words to look for. Optional: without it the
     *  site's own ccTLD decides, and failing that the international path set. */
    country?: string | null;
  },
): Promise<VerifyOutcome> {
  const base: VerifyOutcome = {
    websiteStatus: dc.candidate.website ? "UNREACHABLE" : "NONE",
    productFit: classification.productFit,
    productFitTier: classification.productFitTier,
    productFitNote: classification.productFitNote,
    roles: classification.roles,
    size: classification.size,
    sizeSignals: classification.sizeSignals,
    detectedModel: null,
    modelFit: "UNVERIFIED",
    modelFitEvidence: [],
    productCategories: [],
    storeCount: null,
    employeeCount: null,
    legalName: null,
    email: null,
    phone: null,
    contacts: [],
    verifications: [],
    extraSources: [],
    socials: [],
    socialMatchStatus: null,
    socialProductSignal: null,
    socialBusinessSignal: null,
    socialVerified: false,
    verified: false,
  };

  // Preliminary model-fit from OSM roles alone (no website yet). Store labels are
  // never proof of B2B, so a store-only firm stays UNVERIFIED here, not high.
  {
    const mf = computeModelFit(opts.searchModel, classification.roles, null, false);
    base.modelFit = mf.fit;
    base.modelFitEvidence = mf.evidence;
  }

  // Base verification rows that don't need the website.
  base.verifications.push({
    check: "in-target-country",
    passed: true,
    evidence: "Hedef pazar içinde keşfedildi.",
    sourceUrl: dc.candidate.sourceUrl,
  });
  base.verifications.push({
    check: "address-verifiable",
    passed: dc.candidate.address ? true : null,
    evidence: dc.candidate.address ? "OSM adresi mevcut." : "Adres bulunamadı.",
    sourceUrl: dc.candidate.sourceUrl,
  });

  if (!dc.candidate.website) {
    base.verifications.push({ check: "website-present", passed: null, evidence: "Website bilgisi bulunamadı." });
    return base;
  }

  let intel: SiteIntel | null = null;
  try {
    intel = await fetchSiteIntel(
      dc.candidate.website,
      opts.productTerms,
      opts.productSignals,
      opts.depth ?? "full",
      opts.country ?? dc.candidate.country,
    );
  } catch {
    intel = null;
  }

  if (!intel || intel.status === "UNREACHABLE") {
    base.websiteStatus = "UNREACHABLE";
    base.verifications.push({
      check: "website-present",
      passed: null,
      evidence: "Website mevcut ama bu denemede ulaşılamadı (site kapalı anlamına gelmez).",
      sourceUrl: dc.candidate.website,
    });
    return base;
  }

  base.verified = true;
  base.websiteStatus = "ACTIVE";
  const src = intel.finalUrl;
  base.extraSources.push({ dataField: "website", sourceType: "OFFICIAL_WEBSITE", label: "Resmi website", sourceUrl: src });
  base.verifications.push({ check: "website-present", passed: true, evidence: "Website aktif.", sourceUrl: src });
  base.verifications.push({ check: "is-real-business", passed: true, evidence: "Aktif resmi website doğrulandı.", sourceUrl: src });

  // Roles (merge OSM + site signals).
  base.roles = mergeRoles(classification.roles, intel.roleSignals);
  if (intel.roleSignals.length > 0) {
    base.extraSources.push({ dataField: "commercialRole", sourceType: "OFFICIAL_WEBSITE", label: "Website içerik sinyalleri", sourceUrl: src });
  }
  base.verifications.push({
    check: "commercial-role",
    passed: base.roles.some((r) => r !== "other") ? true : null,
    evidence: base.roles.filter((r) => r !== "other").join(", ") || "Rol doğrulanamadı.",
    sourceUrl: src,
  });

  // Business model + model-fit for the searched model (§1/§5).
  const { b2b, b2c } = intel.modelSignals;
  base.detectedModel = b2b && b2c ? "BOTH" : b2b ? "B2B" : b2c ? "B2C" : null;
  {
    const mf = computeModelFit(opts.searchModel, base.roles, base.detectedModel, true);
    base.modelFit = mf.fit;
    base.modelFitEvidence = mf.evidence;
    base.verifications.push({
      check: "model-fit",
      passed: mf.fit === "VERIFIED" ? true : mf.fit === "NOT_SUITABLE" ? false : null,
      evidence: `${opts.searchModel} uygunluğu: ${mf.fit} — ${mf.evidence.join("; ")}`,
      sourceUrl: src,
    });
  }

  // Product fit — TIERED (§2). STRONG term → VERIFIED; MEDIUM → LIKELY; only
  // generic/weak terms → UNCLEAR (never "Doğrulandı"); nothing → keep/NOT_RELEVANT.
  base.productCategories = [...intel.strongFound, ...intel.mediumFound, ...intel.productTermsFound].slice(0, 8);
  if (intel.strongFound.length >= 1) {
    base.productFit = "VERIFIED";
    base.productFitTier = "STRONG";
    base.productFitNote = `Website'de güçlü ürün kanıtı: ${intel.strongFound.slice(0, 4).join(", ")}.`;
    base.extraSources.push({ dataField: "productFit", sourceType: "OFFICIAL_WEBSITE", label: "Güçlü ürün kanıtı", sourceUrl: src });
  } else if (intel.mediumFound.length >= 1) {
    base.productFit = "LIKELY";
    base.productFitTier = "MEDIUM";
    base.productFitNote = `Website'de orta düzey ürün sinyali: ${intel.mediumFound.slice(0, 4).join(", ")}.`;
    base.extraSources.push({ dataField: "productFit", sourceType: "OFFICIAL_WEBSITE", label: "Orta ürün sinyali", sourceUrl: src });
  } else if (intel.productTermsFound.length >= 1) {
    base.productFit = "UNCLEAR";
    base.productFitTier = "WEAK";
    base.productFitNote = "Yalnızca genel ürün/moda terimleri bulundu — ürün uyumu belirsiz.";
  } else {
    const wasWeak = classification.productFitTier === "WEAK" || classification.productFit === "UNCLEAR";
    if (opts.productMatched && wasWeak) {
      base.productFit = "NOT_RELEVANT";
      base.productFitTier = null;
      base.productFitNote = "Aktif website'de aranan ürünle ilgili terim bulunamadı.";
    } else {
      base.productFit = "UNCLEAR";
      base.productFitTier = "WEAK";
      base.productFitNote = "Website aktif; ürün terimleri sınırlı sayfa taramasında bulunamadı.";
    }
  }
  base.verifications.push({
    check: "product-connection",
    passed: base.productFit === "VERIFIED" || base.productFit === "LIKELY" ? true : base.productFit === "NOT_RELEVANT" ? false : null,
    evidence: base.productFitNote ?? "",
    sourceUrl: src,
  });

  // Company size — prefer the strongest verifiable signal.
  base.employeeCount = intel.employeeCount ?? null;
  base.storeCount = intel.storeCount ?? null;
  if (intel.employeeCount != null) {
    base.size = sizeFromEmployees(intel.employeeCount);
    base.sizeSignals = [{ label: "Çalışan sayısı (website)", value: String(intel.employeeCount), source: "Resmi website" }];
    base.extraSources.push({ dataField: "companySize", sourceType: "OFFICIAL_WEBSITE", label: "Çalışan sayısı", sourceUrl: src });
  } else if (intel.storeCount != null) {
    base.size = sizeFromStores(intel.storeCount);
    base.sizeSignals = [{ label: "Şube/mağaza sayısı (website)", value: String(intel.storeCount), source: "Resmi website" }];
    base.extraSources.push({ dataField: "companySize", sourceType: "OFFICIAL_WEBSITE", label: "Şube sayısı", sourceUrl: src });
  }
  // else keep the discovery-time size (branch count) — do NOT guess.

  if (intel.legalName) base.legalName = intel.legalName;

  // EU VAT registration (§V3.7) — the one thing a free source can tell us that
  // the company's own marketing cannot: that it is a real, currently registered
  // business cleared to trade across EU borders. The number is already on the
  // legal page we just read, so this costs one fast call and no new crawling.
  //
  // Only a POSITIVE answer is recorded. Our extraction of the number from page
  // text can be wrong, and VIES cannot tell "this firm is not registered" from
  // "you sent me the wrong string", so an invalid or unreachable answer is left
  // as silence rather than turned into a finding about the company.
  if (intel.vatId) {
    const vat = await checkVatId(intel.vatId);
    if (vat?.valid) {
      base.verifications.push({
        check: "eu-vat-registered",
        passed: true,
        evidence: vat.name
          ? `AB KDV numarası doğrulandı: ${vat.vatId} — kayıtlı unvan: ${vat.name}`
          : `AB KDV numarası doğrulandı: ${vat.vatId} (bu ülke unvanı VIES üzerinden paylaşmıyor)`,
        sourceUrl: vat.sourceUrl,
      });
      base.extraSources.push({
        dataField: "vatId",
        sourceType: "PUBLIC_WEB",
        label: "VIES (AB Komisyonu KDV doğrulama)",
        sourceUrl: vat.sourceUrl,
      });
      // Most member states disclose the registered name; Germany does not. Where
      // it exists it is the OFFICIAL one, so it fills a gap the Impressum parser
      // left — and it is the only company name we get in markets whose legal
      // pages this crawler cannot yet read.
      if (!base.legalName && vat.name) base.legalName = vat.name;
    }
  }

  // Company-level contact enrichment (only fill what was missing).
  const companyEmail = pickCompanyEmail(intel.emails, opts.domain);
  if (companyEmail) {
    base.email = companyEmail;
    base.extraSources.push({ dataField: "email", sourceType: "OFFICIAL_WEBSITE", label: "Website iletişim", sourceUrl: src });
  }
  if (intel.phones[0]) {
    base.phone = intel.phones[0];
    base.extraSources.push({ dataField: "phone", sourceType: "OFFICIAL_WEBSITE", label: "Website iletişim", sourceUrl: src });
  }

  // Decision-makers (§6/§7) — only real, sourced people.
  for (const dm of intel.decisionMakers) {
    const email = emailForPerson(intel.emails, dm.lastName);
    base.contacts.push({
      firstName: dm.firstName,
      lastName: dm.lastName,
      role: dm.role,
      roleVerified: true, // role literally stated on the official Impressum
      corporateEmail: email,
      profileUrl: undefined,
      confidence: email ? Math.min(95, dm.confidence + 5) : dm.confidence,
      source: "OFFICIAL_WEBSITE",
      sourceUrl: dm.sourceUrl,
    });
  }
  base.verifications.push({
    check: "contact-present",
    passed: base.contacts.length > 0 || base.email != null ? true : null,
    evidence:
      base.contacts.length > 0
        ? `${base.contacts.length} karar verici bulundu.`
        : base.email
          ? "Kurumsal iletişim e-postası bulundu."
          : "İletişim bilgisi bulunamadı.",
    sourceUrl: src,
  });
  if (base.contacts.length > 0) {
    base.extraSources.push({ dataField: "contact", sourceType: "OFFICIAL_WEBSITE", label: "Impressum / iletişim", sourceUrl: src });
  }

  // Social intelligence (§15) — links found on the company's OWN site are
  // ownership-verified. Platform-internal metrics are NOT read (login-walled).
  if (intel.socials.length > 0) {
    base.socials = intel.socials
      .filter((s) => SOCIAL_PLATFORMS.some((p) => p.key === s.platform))
      .map((s) => ({ platform: s.platform, url: s.url }));
    base.socialMatchStatus = "VERIFIED";
    base.socialVerified = true;
    const sig = socialSignals(base.socials, opts.productSignals?.strong ?? []);
    base.socialProductSignal = sig.product;
    base.socialBusinessSignal = sig.business;
    for (const s of base.socials) {
      base.extraSources.push({ dataField: `social:${s.platform}`, sourceType: "OFFICIAL_WEBSITE", label: `${s.platform} (website'den)`, sourceUrl: s.url });
    }
    base.verifications.push({
      check: "social-presence",
      passed: true,
      evidence: `${base.socials.length} sosyal profil website üzerinden doğrulandı: ${base.socials.map((s) => s.platform).join(", ")}.`,
      sourceUrl: src,
    });
  } else {
    base.socialMatchStatus = "UNVERIFIED";
  }

  return base;
}
