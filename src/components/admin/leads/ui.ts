/**
 * AYZENITH LEAD FINDER — shared, client-safe presentation helpers.
 *
 * Pure formatting + the lead-band vocabulary. No data, no fetching, no scoring —
 * the score/confidence are always computed in the backend; this only decides how
 * an already-computed result LOOKS. Reuses RADAR's formatters where identical so
 * the two modules read the same. Kept free of `server-only` for client imports.
 */

import type { LeadBand } from "@/config/leads";

// Re-export the identical date/flag helpers RADAR already ships, so lead screens
// format dates and country flags exactly like RADAR screens.
export { fmtDate, countryName } from "@/components/admin/radar/ui";

export type BandStyle = {
  label: string;
  dot: string;
  fg: string;
  bg: string;
  border: string;
};

/** Colour AND text together (colour is never the only signal). Matches RADAR's
 *  green / gold / red / neutral palette. */
export const LEAD_BAND: Record<LeadBand, BandStyle> = {
  VERY_STRONG: { label: "ÇOK GÜÇLÜ ADAY", dot: "🟢", fg: "#2f7a48", bg: "#eaf3ec", border: "#bcd8c4" },
  STRONG: { label: "GÜÇLÜ ADAY", dot: "🟢", fg: "#2f7a48", bg: "#eaf3ec", border: "#bcd8c4" },
  POTENTIAL: { label: "POTANSİYEL", dot: "🟡", fg: "#8a6d1f", bg: "#f8f1dc", border: "#e5d4a0" },
  LOW: { label: "DÜŞÜK ÖNCELİK", dot: "🔴", fg: "#8a2b2b", bg: "#fbeaea", border: "#e0b4b4" },
  INSUFFICIENT_DATA: { label: "VERİ YETERSİZ", dot: "⚠", fg: "#5b5b5b", bg: "#f1f0ee", border: "#d9d6d1" },
};

/** Every value LeadProductFit can take MUST have an entry (§V3.8).
 *
 *  LIKELY and NOT_RELEVANT were missing, and the lookup falls back to
 *  UNVERIFIED, so a firm we had genuinely placed as "Muhtemel" was shown to the
 *  owner as "Doğrulanamadı". In the first live Berlin search that hit every one
 *  of the seven real lingerie shops — Mode & Dessous, Rose Rosa
 *  Dessous-Fachgeschäft, Anna Dessous, Change Lingerie and the rest — so the
 *  screen was hiding the best product signal the run produced. Understating what
 *  we know is the same failure as overstating it. */
export const FIT_STYLE: Record<string, { fg: string; bg: string; label: string }> = {
  VERIFIED: { fg: "#2f7a48", bg: "#eaf3ec", label: "Doğrulandı" },
  LIKELY: { fg: "#8a6d1f", bg: "#f8f1dc", label: "Muhtemel" },
  UNCLEAR: { fg: "#8a6d1f", bg: "#f8f1dc", label: "Belirsiz" },
  NOT_RELEVANT: { fg: "#8a2b2b", bg: "#fbeaea", label: "İlgisiz" },
  UNVERIFIED: { fg: "#5b5b5b", bg: "#f1f0ee", label: "Doğrulanamadı" },
};

/** Country ISO alpha-2 → flag emoji (same technique as RADAR). */
export function flagEmoji(cc: string): string {
  if (!cc || cc.length !== 2) return "🌍";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

/** Confidence as filled/empty dots out of 5 (mirrors RADAR's confidence dots). */
export function confidencePct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `%${Math.round(n)}`;
}
