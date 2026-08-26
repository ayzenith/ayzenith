/**
 * AYZENITH LEAD FINDER — "Neden bu lead?" (Why This Lead) builder (V3, §2/§7/§10).
 *
 * A PURE, deterministic explainer. It turns the already-verified, already-persisted
 * signals of a lead (product fit, model fit, website status, contact route,
 * decision-maker, social presence) into a short, human-readable list of reasons —
 * WITHOUT inventing anything. Every reason is derived from a real field the pipeline
 * sourced; when a signal is missing the reason is honestly "Doğrulanamadı", never a
 * positive assumption. No AI, no network, no scoring — it only RE-PRESENTS facts, so
 * it is safe to compute at render time on both the card and the detail screen.
 *
 * Client-safe (no `server-only`): imported by server pages AND the results/export
 * layers. Input is a minimal structural shape so it never couples to a DB type.
 */

export type WhyStatus = "verified" | "partial" | "unverified" | "negative";

export type WhyReason = {
  key: string;
  /** Short Turkish category label, e.g. "Ürün uyumu". */
  label: string;
  /** One-line sourced detail, e.g. "Website'de ürün doğrulandı." */
  detail: string;
  status: WhyStatus;
  /** Colour dot paired with text (colour is never the only signal). */
  dot: string;
};

export type WhyInput = {
  businessModel: string; // "B2B" | "B2C"
  productFit: string; // VERIFIED | LIKELY | UNCLEAR | NOT_RELEVANT | UNVERIFIED
  modelFit: string | null; // VERIFIED | POSSIBLE | NOT_SUITABLE | UNVERIFIED
  modelFitEvidence?: string[];
  websiteStatus: string | null; // ACTIVE | UNREACHABLE | NONE | null
  hasEmail: boolean;
  hasPhone: boolean;
  contactCount: number;
  /** Role of the strongest decision-maker, when known (detail screen only). */
  topContactRole?: string | null;
  socialMatchStatus: string | null; // VERIFIED | POSSIBLE | UNVERIFIED | null
  hasInstagram?: boolean;
  hasLinkedin?: boolean;
  /** The persisted `scoreBreakdown.components` from `scoring.ts` (§ audit
   *  finding — `companyQuality` and `marketRelevance` were scored but had no
   *  matching "why" entry, so 2 of the 6 scored components were invisible to
   *  this explainer). Reading the component's own `note` here — rather than
   *  re-deriving separate wording — means this can never drift from what the
   *  scorer actually said, for exactly these two. Optional so older callers
   *  that don't have the breakdown handy keep working unchanged. */
  scoreComponents?: Array<{ key: string; score: number | null; available: boolean; note: string }>;
};

const DOT: Record<WhyStatus, string> = {
  verified: "🟢",
  partial: "🟡",
  unverified: "⚪",
  negative: "🔴",
};

function reason(key: string, label: string, detail: string, status: WhyStatus): WhyReason {
  return { key, label, detail, status, dot: DOT[status] };
}

/**
 * Build the ordered "Neden bu lead?" reasons. Order mirrors the qualification
 * hierarchy (§7): product → commercial role/model → website → contact → decision
 * maker → social. Product & commercial role come first because they are the gate.
 */
export function buildWhyLead(i: WhyInput): WhyReason[] {
  const model = i.businessModel === "B2C" ? "B2C" : "B2B";
  const out: WhyReason[] = [];

  // 1. Ürün uyumu — only VERIFIED/LIKELY are positive; missing ≠ negative.
  if (i.productFit === "VERIFIED") {
    out.push(reason("product", "Ürün uyumu", "Aranan ürün website üzerinde doğrulandı.", "verified"));
  } else if (i.productFit === "LIKELY") {
    out.push(reason("product", "Ürün uyumu", "Website'de ürünle güçlü bağlantılı sinyaller bulundu (muhtemel).", "partial"));
  } else if (i.productFit === "NOT_RELEVANT") {
    out.push(reason("product", "Ürün uyumu", "Aktif website'de aranan ürünle ilgili terim bulunamadı.", "negative"));
  } else if (i.productFit === "UNCLEAR") {
    out.push(reason("product", "Ürün uyumu", "Yalnızca genel kategori sinyalleri var — ürün uyumu belirsiz.", "partial"));
  } else {
    out.push(reason("product", "Ürün uyumu", "Website taranmadığından ürün uyumu doğrulanamadı.", "unverified"));
  }

  // 2. Ticari rol / model uygunluğu — the B2B/B2C gate (§8).
  if (i.modelFit === "VERIFIED") {
    const ev = (i.modelFitEvidence ?? []).find((e) => e.length > 0);
    out.push(reason("role", "Ticari rol", ev ?? `${model} ticari rol doğrulandı.`, "verified"));
  } else if (i.modelFit === "POSSIBLE") {
    out.push(reason("role", "Ticari rol", `${model} için olası — ticari rol kesin doğrulanamadı.`, "partial"));
  } else if (i.modelFit === "NOT_SUITABLE") {
    out.push(reason("role", "Ticari rol", `${model} araması için uygun değil.`, "negative"));
  } else {
    out.push(reason("role", "Ticari rol", `${model} ticari rolü doğrulanamadı.`, "unverified"));
  }

  // 3. Website.
  if (i.websiteStatus === "ACTIVE") {
    out.push(reason("website", "Website", "Aktif şirket websitesi doğrulandı.", "verified"));
  } else if (i.websiteStatus === "UNREACHABLE") {
    out.push(reason("website", "Website", "Website mevcut ama bu turda ulaşılamadı (kapalı anlamına gelmez).", "unverified"));
  } else if (i.websiteStatus === "NONE") {
    out.push(reason("website", "Website", "Website bilgisi bulunamadı.", "unverified"));
  } else {
    out.push(reason("website", "Website", "Website bu turda doğrulanmadı.", "unverified"));
  }

  // 4. İletişim — corporate contact route.
  if (i.hasEmail && i.hasPhone) {
    out.push(reason("contact", "İletişim", "Kurumsal e-posta ve telefon bulundu.", "verified"));
  } else if (i.hasEmail) {
    out.push(reason("contact", "İletişim", "Kurumsal e-posta bulundu.", "verified"));
  } else if (i.hasPhone) {
    out.push(reason("contact", "İletişim", "Telefon bulundu.", "verified"));
  } else {
    out.push(reason("contact", "İletişim", "Doğrudan iletişim bilgisi bulunamadı.", "unverified"));
  }

  // 5. Karar verici.
  if (i.contactCount > 0) {
    const roleTxt = i.topContactRole ? ` (${i.topContactRole})` : "";
    out.push(reason("decision", "Karar verici", `Karar verici bulundu${roleTxt}.`, "verified"));
  } else {
    out.push(reason("decision", "Karar verici", "Karar verici doğrulanamadı.", "unverified"));
  }

  // 6. Şirket kalitesi + 7. Pazar uyumu — read straight from the scorer's own
  // component notes, when the caller has them, rather than re-deriving.
  const comp = (key: string) => i.scoreComponents?.find((c) => c.key === key);
  const companyQuality = comp("companyQuality");
  if (companyQuality) {
    const status: WhyStatus = !companyQuality.available
      ? "unverified"
      : (companyQuality.score ?? 0) >= 70
        ? "verified"
        : (companyQuality.score ?? 0) >= 40
          ? "partial"
          : "unverified";
    out.push(reason("companyQuality", "Şirket kalitesi", companyQuality.note, status));
  }
  const marketRelevance = comp("marketRelevance");
  if (marketRelevance) {
    const status: WhyStatus = !marketRelevance.available
      ? "unverified"
      : (marketRelevance.score ?? 0) >= 90
        ? "verified"
        : (marketRelevance.score ?? 0) >= 60
          ? "partial"
          : "unverified";
    out.push(reason("marketRelevance", "Pazar uyumu", marketRelevance.note, status));
  }

  // 8. Sosyal — enrichment only, never the qualifier (§4).
  if (i.socialMatchStatus === "VERIFIED") {
    const nets: string[] = [];
    if (i.hasInstagram) nets.push("Instagram");
    if (i.hasLinkedin) nets.push("LinkedIn");
    const netTxt = nets.length > 0 ? nets.join(" + ") : "Sosyal profil";
    out.push(reason("social", "Sosyal", `${netTxt} şirket websitesinden doğrulandı.`, "verified"));
  } else {
    out.push(reason("social", "Sosyal", "Website üzerinden sosyal profil doğrulanamadı.", "unverified"));
  }

  return out;
}

/** Only the positive (verified/partial) reasons — for compact card/top-lead/export
 *  summaries where a short "why it's here" line is wanted. */
export function positiveWhy(reasons: WhyReason[]): WhyReason[] {
  return reasons.filter((r) => r.status === "verified" || r.status === "partial");
}

/** A single compact "why" line for export/CSV (positive reasons only). */
export function whySummaryLine(i: WhyInput): string {
  return positiveWhy(buildWhyLead(i))
    .map((r) => `${r.label}: ${r.detail}`)
    .join(" · ");
}
