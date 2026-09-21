/**
 * IMPORT INTELLIGENCE — shared vocabulary (pure types).
 *
 * Every value the module shows carries WHERE IT CAME FROM. The UI renders these
 * labels verbatim, so nothing can reach the screen without one.
 */

export type Provenance =
  | "OFFICIAL" // read from an official source version stored in ImportSource
  | "AI_PREDICTED" // produced by the classification model
  | "USER_ENTERED" // typed by the user
  | "CALCULATED" // arithmetic on the values above
  | "WEB_EXTRACTED" // read from a fetched web page (manufacturer / third party)
  | "INFERRED" // the system's own reasoning or built-in knowledge, not a source
  | "UNKNOWN";

export const PROVENANCE_LABELS: Record<Provenance, string> = {
  OFFICIAL: "RESMİ KAYNAK",
  AI_PREDICTED: "AI TAHMİNİ",
  USER_ENTERED: "KULLANICI GİRDİSİ",
  CALCULATED: "HESAPLANDI",
  WEB_EXTRACTED: "WEB'DEN ÇIKARILDI",
  INFERRED: "ÇIKARIM",
  UNKNOWN: "BİLİNMİYOR",
};

/** Who asserted a GTİP. Nothing in code ever upgrades one status to another. */
export type ClassificationStatus = "AI_PREDICTED" | "USER_ENTERED" | "BTB_DECLARED" | "OFFICIAL_VERIFIED" | "INSUFFICIENT";

export type Polarity = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export type EvidenceKind =
  | "MATCHING_ATTRIBUTE"
  | "TARIFF_WORDING"
  | "HEADING_MATCH"
  | "CONCEPT_RULE"
  | "EXCLUSION"
  | "MANUFACTURER"
  | "TECHNICAL"
  | "PRECEDENT"
  | "BTB"
  | "CONFLICT"
  | "MISSING_INFO"
  | "RULE"
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_STALE"
  | "DATE_WARNING"
  | "NOTE";

export type EvidenceItem = {
  area: "PRODUCT" | "CLASSIFICATION" | "ORIGIN" | "COMPLIANCE" | "TAX" | "LOGISTICS" | "LANDED";
  kind: EvidenceKind;
  polarity: Polarity;
  provenance: Provenance;
  text: string;
  /** ImportSource.key the fact came from, when it came from a document. */
  sourceKey?: string;
  ruleId?: string;
  detail?: Record<string, unknown>;
};

/** A reference to one stored source version, as shown in the source trace. */
export type SourceRef = {
  sourceId: string | null;
  key: string;
  name: string;
  publisher: string | null;
  tier: number;
  url: string | null;
  fetchedAt: string | null;
  version: string | null;
  status: string;
  consolidatedAsOf: string | null;
  note?: string | null;
};

/** Landed-cost value classes, exactly as the brief names them. */
export type CostValueStatus = "USER_ENTERED" | "OFFICIAL" | "CALCULATED" | "ESTIMATED" | "UNKNOWN";

export type ComplianceLevel = "GREEN" | "YELLOW" | "RED" | "INSUFFICIENT";
