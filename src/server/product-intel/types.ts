/**
 * PRODUCT INTELLIGENCE — shared vocabulary (pure types, no imports of runtime).
 *
 * Provenance is deliberately the SAME union Import Intelligence uses: a fact
 * read from a web page means the same thing in both modules, and the UI renders
 * one set of labels. Nothing reaches a screen without one.
 */

import type { Provenance } from "../import/types";

export type { Provenance };

export type AnalysisStatus = "OK" | "INSUFFICIENT_DATA" | "BLOCKED";

export type EvidenceArea =
  | "PRODUCT"
  | "MARKET"
  | "COMPETITOR"
  | "GAP"
  | "KEYWORD"
  | "PRICE"
  | "SWOT"
  | "LAUNCH";

export type Polarity = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export type ScanStatus = "OK" | "BLOCKED" | "RATE_LIMITED" | "EMPTY" | "ROBOTS_DISALLOWED" | "ERROR";

/** One reason behind one conclusion. Mirrors ImportEvidence exactly. */
export type PiEvidence = {
  area: EvidenceArea;
  kind: string;
  polarity: Polarity;
  provenance: Provenance;
  text: string;
  detail?: Record<string, unknown>;
  sourceKey?: string;
  offerRank?: number;
};

/** A competitor offer as the measuring code sees it — no database types here,
 *  so every rule below can be unit-tested against plain objects. */
export type OfferView = {
  rank: number;
  title: string;
  brand: string | null;
  sellerName: string | null;
  price: number | null;
  currency: string;
  ratingAvg: number | null;
  ratingCount: number | null;
  /** Normalized text of everything this offer said about itself. */
  normalized: string;
  provenance: Provenance;
  sourceUrl: string | null;
};

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  OK: "Tamamlandı",
  INSUFFICIENT_DATA: "Veri yetersiz",
  BLOCKED: "Veri alınamadı",
};

export const SCAN_STATUS_LABELS: Record<ScanStatus, string> = {
  OK: "Okundu",
  BLOCKED: "Engellendi",
  RATE_LIMITED: "Hız sınırı",
  EMPTY: "Boş döndü",
  ROBOTS_DISALLOWED: "robots.txt izin vermiyor",
  ERROR: "Hata",
};

export const EVIDENCE_AREA_LABELS: Record<EvidenceArea, string> = {
  PRODUCT: "Ürün",
  MARKET: "Pazar",
  COMPETITOR: "Rakip",
  GAP: "Fırsat",
  KEYWORD: "Kelime",
  PRICE: "Fiyat",
  SWOT: "SWOT",
  LAUNCH: "Giriş planı",
};
