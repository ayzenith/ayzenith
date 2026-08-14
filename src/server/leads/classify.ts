import "server-only";

import type { DedupedCandidate } from "./dedup";
import { normalizeProduct, type LeadRole } from "@/config/leads";

/**
 * AYZENITH LEAD FINDER — classification (roles, size, product fit).
 *
 * Turns the RAW signals a free source gave us (OSM shop/office tags, branch
 * counts, whether the shop type matched the searched product) into the module's
 * structured fields — WITHOUT inventing anything:
 *
 *  • Commercial roles come from real tags; a firm keeps ALL that apply (§9).
 *  • Size is set ONLY from a verifiable signal (branch count seen); otherwise it
 *    stays UNKNOWN — never a guess (§8).
 *  • Product fit from OSM is at most "UNCLEAR" (the shop type is a hint, not
 *    proof); real verification against the company's own site happens in a later
 *    batch and is the only path to "VERIFIED" (§4/§11).
 */

export type SizeSignal = { label: string; value: string; source: string };

export type Classification = {
  roles: LeadRole[];
  size: "LARGE" | "MEDIUM" | "SMALL" | "ONLINE" | "UNKNOWN";
  sizeSignals: SizeSignal[];
  productFit: "VERIFIED" | "LIKELY" | "UNCLEAR" | "NOT_RELEVANT" | "UNVERIFIED";
  productFitTier: "STRONG" | "MEDIUM" | "WEAK" | null;
  productFitNote: string | null;
};

/** OSM shop/office value → commercial role(s). Unknown tags fall back to a broad
 *  "specialty_store" (a named shop) or "other" (a company office). */
const SHOP_ROLE_MAP: Record<string, LeadRole[]> = {
  department_store: ["department_store"],
  general: ["independent_store"],
  variety_store: ["independent_store"],
  supermarket: ["retail_chain"],
  wholesale: ["wholesaler"],
  trade: ["wholesaler"],
  boutique: ["boutique"],
  // Named specialty retail — the common case for product-specific searches.
  lingerie: ["specialty_store"],
  clothes: ["specialty_store"],
  fashion: ["specialty_store"],
  fabric: ["specialty_store"],
  electronics: ["specialty_store"],
  hifi: ["specialty_store"],
  mobile_phone: ["specialty_store"],
  computer: ["specialty_store"],
  watches: ["specialty_store"],
  houseware: ["specialty_store"],
  kitchen: ["specialty_store"],
  hardware: ["specialty_store"],
  appliance: ["specialty_store"],
  medical_supply: ["specialty_store"],
};

function rolesFromHints(hints: string[]): LeadRole[] {
  const roles = new Set<LeadRole>();
  for (const h of hints) {
    const [tag, value] = h.split("=");
    if (tag === "shop" && value) {
      const mapped = SHOP_ROLE_MAP[value];
      if (mapped) mapped.forEach((r) => roles.add(r));
      else roles.add("specialty_store");
    } else if (tag === "office" && value === "company") {
      // A company office is a real B2B signal but its exact role (importer /
      // distributor / wholesaler) is NOT knowable from OSM — mark it honestly.
      roles.add("other");
    }
  }
  if (roles.size === 0) roles.add("other");
  return Array.from(roles);
}

/** Size from branch count seen in THIS search — a real, sourced signal (§8).
 *  Absence of a signal → UNKNOWN, never SMALL (missing ≠ small). */
function sizeFromBranches(branchCount: number): {
  size: Classification["size"];
  signals: SizeSignal[];
} {
  if (branchCount >= 2) {
    const signal: SizeSignal = {
      label: "Bu aramada bulunan şube sayısı",
      value: String(branchCount),
      source: "OpenStreetMap",
    };
    if (branchCount >= 10) return { size: "LARGE", signals: [signal] };
    return { size: "MEDIUM", signals: [signal] };
  }
  return { size: "UNKNOWN", signals: [] };
}

export function classify(
  dc: DedupedCandidate,
  opts: { productMatched: boolean; specificShops: string[]; strongTerms: string[] },
): Classification {
  const roles = rolesFromHints(dc.candidate.roleHints);
  const { size, signals } = sizeFromBranches(dc.branchCount);

  // Product fit from OSM alone is never "VERIFIED" (only a real source confirms).
  // Tiered honesty (§2):
  //  • a SPECIFIC shop tag (shop=lingerie) or a strong product term in the NAME
  //    → a genuine product signal → LIKELY (tier STRONG). Website may confirm.
  //  • a broad specialty tag (clothes/fashion/boutique) → WEAK → UNCLEAR, and it
  //    must NEVER be shown as "Doğrulandı".
  //  • otherwise UNVERIFIED (missing, not negative).
  const rawType = dc.candidate.rawType ?? "";
  const nameNorm = normalizeProduct(dc.candidate.name);
  const isSpecificShop = opts.specificShops.includes(rawType);
  const nameStrong = opts.strongTerms.some((t) => {
    const n = normalizeProduct(t);
    return n.length >= 3 && nameNorm.includes(n);
  });
  const isSpecialty = roles.includes("specialty_store") || roles.includes("boutique");

  let productFit: Classification["productFit"] = "UNVERIFIED";
  let productFitTier: Classification["productFitTier"] = null;
  let productFitNote: string | null = null;

  if (isSpecificShop || nameStrong) {
    productFit = "LIKELY";
    productFitTier = "STRONG";
    productFitNote = nameStrong
      ? "İşletme adı aranan ürünle güçlü şekilde eşleşiyor; web doğrulaması bekliyor."
      : `OSM mağaza türü (${rawType}) doğrudan bu ürüne özel; web doğrulaması bekliyor.`;
  } else if (opts.productMatched && isSpecialty) {
    productFit = "UNCLEAR";
    productFitTier = "WEAK";
    productFitNote = `Yalnızca genel mağaza etiketi (${rawType || "clothes/fashion"}); ürünle bağlantı doğrulanamadı — belirsiz.`;
  }

  return { roles, size, sizeSignals: signals, productFit, productFitTier, productFitNote };
}
