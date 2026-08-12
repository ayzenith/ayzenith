/**
 * AYZENITH RADAR — shared, client-safe presentation helpers.
 *
 * Pure formatting + the decision-band vocabulary used across every RADAR screen.
 * No data, no fetching, no scoring — the score and decision are always computed
 * in the backend; this file only decides how an already-computed result LOOKS.
 * Kept free of `server-only` so client components can import it too.
 */

export type Decision =
  | "WORTH_RESEARCHING"
  | "MONITOR"
  | "NOT_PRIORITY"
  | "INSUFFICIENT_DATA";

export type BandStyle = {
  label: string;
  dot: string; // emoji marker (colour is never the ONLY signal — text always shown)
  /** Inline colours, matching the CMS palette (green / gold / red / neutral). */
  fg: string;
  bg: string;
  border: string;
  range: string;
};

export const BAND: Record<Decision, BandStyle> = {
  WORTH_RESEARCHING: {
    label: "ARAŞTIRMAYA DEĞER",
    dot: "🟢",
    fg: "#2f7a48",
    bg: "#eaf3ec",
    border: "#bcd8c4",
    range: "80–100",
  },
  MONITOR: {
    label: "İZLENMELİ",
    dot: "🟡",
    fg: "#8a6d1f",
    bg: "#f8f1dc",
    border: "#e5d4a0",
    range: "60–79",
  },
  NOT_PRIORITY: {
    label: "ŞİMDİLİK ÖNCELİK DEĞİL",
    dot: "🔴",
    fg: "#8a2b2b",
    bg: "#fbeaea",
    border: "#e0b4b4",
    range: "0–59",
  },
  INSUFFICIENT_DATA: {
    label: "VERİ YETERSİZ",
    dot: "⚠",
    fg: "#5b5b5b",
    bg: "#f1f0ee",
    border: "#d9d6d1",
    range: "—",
  },
};

/** Format a USD trade figure the way the owner reads it (Turkish units). */
export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(".", ",")} milyar $`;
  if (n >= 1e6) return `${Math.round(n / 1e6).toLocaleString("tr-TR")} milyon $`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("tr-TR")} bin $`;
  return `${Math.round(n).toLocaleString("tr-TR")} $`;
}

/** A signed percentage, Turkish decimal comma. */
export function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = n.toFixed(1).replace(".", ",");
  return `${n > 0 ? "+" : ""}%${s.replace("+", "")}`;
}

/** Confidence dots: filled = measured criteria, empty = missing. */
export function confidenceDots(measured: number, total = 5): string {
  const filled = Math.max(0, Math.min(total, measured));
  return "●".repeat(filled) + "○".repeat(total - filled);
}

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getDate()} ${MONTHS_TR[date.getMonth()]} ${date.getFullYear()}`;
}

/** Friendly label for a raw-input key shown in the "nasıl hesaplandı" panel. */
export const RAW_INPUT_LABELS: Record<string, string> = {
  targetImport: "Hedef pazar ithalatı",
  peerCount: "Karşılaştırılan pazar sayısı",
  cagrPct: "Yıllık ortalama değişim",
  years: "Veri yılı sayısı",
  trToTargetExport: "Türkiye'nin bu pazara ihracatı",
  trSharePct: "Türkiye'nin pazar payı",
  euDutyFree: "Gümrük Birliği vergi muafiyeti",
  customsDutyPct: "Gümrük vergisi oranı",
  certificationBurden: "Sertifikasyon yükü",
  dutyAssumed: "Gümrük vergisi varsayıldı",
  concentrationHhi: "Yoğunlaşma endeksi (HHI)",
  sources: "Kaynak ülke sayısı",
  anomaly: "Olağandışı değişim",
  topSources: "En büyük tedarikçi ülkeler",
};

export const BURDEN_LABELS: Record<string, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  "very-high": "Çok yüksek",
};

/** Turkish names for supplier/source countries shown in the competition
 *  breakdown — covers the major world exporters plus the European markets. */
const COUNTRY_NAMES_TR: Record<string, string> = {
  DE: "Almanya", FR: "Fransa", NL: "Hollanda", BE: "Belçika", IT: "İtalya",
  ES: "İspanya", PL: "Polonya", SE: "İsveç", AT: "Avusturya", DK: "Danimarka",
  FI: "Finlandiya", PT: "Portekiz", CZ: "Çekya", RO: "Romanya", GR: "Yunanistan",
  HU: "Macaristan", IE: "İrlanda", LU: "Lüksemburg", CH: "İsviçre", NO: "Norveç",
  SK: "Slovakya", SI: "Slovenya", BG: "Bulgaristan", HR: "Hırvatistan",
  EE: "Estonya", LV: "Letonya", LT: "Litvanya", CY: "Kıbrıs", MT: "Malta",
  TR: "Türkiye", CN: "Çin", VN: "Vietnam", US: "ABD", JP: "Japonya",
  KR: "Güney Kore", IN: "Hindistan", TW: "Tayvan", HK: "Hong Kong",
  GB: "Birleşik Krallık", MX: "Meksika", TH: "Tayland", MY: "Malezya",
  ID: "Endonezya", SG: "Singapur", PH: "Filipinler", BD: "Bangladeş",
  PK: "Pakistan", RU: "Rusya", UA: "Ukrayna", RS: "Sırbistan", EG: "Mısır",
  MA: "Fas", TN: "Tunus", BR: "Brezilya", CA: "Kanada", AU: "Avustralya",
  NZ: "Yeni Zelanda", ZA: "Güney Afrika", AE: "BAE", SA: "Suudi Arabistan",
};

/** Display a country/source code as a Turkish name, falling back to the code. */
export function countryName(cc: string): string {
  return COUNTRY_NAMES_TR[cc?.toUpperCase?.()] ?? cc;
}

export const MODEL_LABELS: Record<string, string> = { B2B: "B2B", B2C: "B2C" };
