/**
 * IMPORT INTELLIGENCE — countries and the İthalat Rejimi Kararı country groups
 * (pure, no DB).
 *
 * The groups below are copied from the OFFICIAL 2026 İthalat Rejimi Kararı
 * annex files published by the Ministry of Trade ("rejim 2026.zip"):
 *   - "İçindekiler ve Kısaltmalar.docx" → the II Sayılı Liste (25-97. Fasıllar)
 *     column headings 1…7 (COLUMN_1_OFFICIAL_TEXT is that sentence verbatim);
 *   - "EK-1.xlsx" → Genelleştirilmiş Tercihler Sistemi countries (GYÜ, ÖTDÜ,
 *     EAGÜ) and their excluded sectors.
 * The ingestion script re-reads those files and flags a drift if any name here
 * no longer appears there. A country the list does not name is column 7
 * ("Diğer Ülkeler") — that is the Decision's own default, not an assumption.
 */

import { normalizeText } from "./text";

export type Country = { iso: string; tr: string; en: string; aliases?: string[] };

export const EU27 = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
] as const;
export const EFTA = ["IS", "LI", "NO", "CH"] as const;

/** Verbatim from "İçindekiler ve Kısaltmalar.docx", II SAYILI LİSTE (25-97. FASILLAR) SÜTUN BAŞLIKLARI. */
export const COLUMN_1_OFFICIAL_TEXT =
  "AB Üyesi Ülkeler, EFTA Üyesi Ülkeler, Serbest Ticaret Anlaşması Ülkeleri: Arnavutluk, Bolivarcı Venezuela Cumhuriyeti, Büyük Britanya ve Kuzey İrlanda Birleşik Krallığı, Bosna-Hersek, Fas, Faroe Adaları, Filistin, Gürcistan, Güney Kore, İsrail, Karadağ, Kosova, Kuzey Makedonya Cumhuriyeti, Malezya, Mısır Arap Cumhuriyeti, Morityus, Moldova, Sırbistan, Singapur Cumhuriyeti, Şili, Tunus";

/** The FTA partners named in COLUMN_1_OFFICIAL_TEXT, in the same order. */
export const FTA_COLUMN_1 = [
  "AL", "VE", "GB", "BA", "MA", "FO", "PS", "GE", "KR", "IL", "ME", "XK", "MK", "MY", "EG", "MU", "MD", "RS", "SG",
  "CL", "TN",
] as const;

/** EK-1 A — Gelişme Yolundaki Ülkeler (column 6). */
export const GYU = ["BO", "CV", "CK", "PH", "KE", "KG", "CG", "FM", "NG", "NU", "UZ", "PK", "LK", "TJ"] as const;
/** EK-1 B — Özel Teşvik Düzenlemelerinden Yararlanacak Ülkeler (column 5). The 2026 annex lists none. */
export const OTDU = [] as const;
/** EK-1 C — En Az Gelişmiş Ülkeler (column 4). */
export const EAGU = [
  "AF", "AO", "BD", "BF", "BI", "BJ", "BT", "TD", "CD", "CF", "DJ", "ER", "ET", "GM", "GN", "GQ", "GW", "SS", "HT",
  "KH", "KI", "KM", "LA", "LR", "LS", "MG", "ML", "MM", "MW", "MN", "MR", "MZ", "NE", "NP", "RW", "SB", "SD", "SL",
  "SN", "SO", "ST", "TL", "TG", "TV", "TZ", "UG", "YE", "ZM",
] as const;

/** EK-1 "HARİÇ SEKTÖRLER", verbatim. A GTS rate for these origins needs a sector check the system does not do. */
export const GTS_EXCLUDED_SECTORS: Record<string, string> = {
  PK: "S-8b, S-11a, S-11b",
  LK: "S-11b",
  BD: "S-11a, S-11b",
  NP: "S-11a* (5509.21, 5509.22,5509.51)",
  ET: "S-11a* (5209.42)",
  KH: "S-8b*(42. Fasıl), S-11b, S-12a",
};

export type DutyColumn = "1" | "2" | "3" | "4" | "5" | "6" | "7";

export const DUTY_COLUMN_LABELS: Record<DutyColumn, string> = {
  "1": "Sütun 1 — AB, EFTA ve STA ülkeleri",
  "2": "Sütun 2 — Katar",
  "3": "Sütun 3 — Birleşik Arap Emirlikleri",
  "4": "Sütun 4 — GTS: En Az Gelişmiş Ülkeler",
  "5": "Sütun 5 — GTS: Özel Teşvik Düzenlemeleri",
  "6": "Sütun 6 — GTS: Gelişme Yolundaki Ülkeler",
  "7": "Sütun 7 — Diğer Ülkeler",
};

const COL1 = new Set<string>([...EU27, ...EFTA, ...FTA_COLUMN_1]);

/** The column an ORIGIN belongs to. Whether its preferential rate may actually
 *  be used (proof of origin, A.TR) is decided in origin.ts, not here. */
export function originColumn(iso: string): DutyColumn {
  if (COL1.has(iso)) return "1";
  if (iso === "QA") return "2";
  if (iso === "AE") return "3";
  if ((EAGU as readonly string[]).includes(iso)) return "4";
  if ((OTDU as readonly string[]).includes(iso)) return "5";
  if ((GYU as readonly string[]).includes(iso)) return "6";
  return "7";
}

export function isEu(iso: string | null | undefined): boolean {
  return !!iso && (EU27 as readonly string[]).includes(iso);
}

export const COUNTRIES: Country[] = [
  { iso: "TR", tr: "Türkiye", en: "Turkey", aliases: ["turkiye", "turkey"] },
  // EU
  { iso: "AT", tr: "Avusturya", en: "Austria" },
  { iso: "BE", tr: "Belçika", en: "Belgium" },
  { iso: "BG", tr: "Bulgaristan", en: "Bulgaria" },
  { iso: "HR", tr: "Hırvatistan", en: "Croatia" },
  { iso: "CY", tr: "Kıbrıs (GKRY)", en: "Cyprus" },
  { iso: "CZ", tr: "Çekya", en: "Czech Republic", aliases: ["cek cumhuriyeti", "czechia"] },
  { iso: "DK", tr: "Danimarka", en: "Denmark" },
  { iso: "EE", tr: "Estonya", en: "Estonia" },
  { iso: "FI", tr: "Finlandiya", en: "Finland" },
  { iso: "FR", tr: "Fransa", en: "France", aliases: ["french republic"] },
  { iso: "DE", tr: "Almanya", en: "Germany" },
  { iso: "GR", tr: "Yunanistan", en: "Greece" },
  { iso: "HU", tr: "Macaristan", en: "Hungary" },
  { iso: "IE", tr: "İrlanda", en: "Ireland" },
  { iso: "IT", tr: "İtalya", en: "Italy" },
  { iso: "LV", tr: "Letonya", en: "Latvia" },
  { iso: "LT", tr: "Litvanya", en: "Lithuania" },
  { iso: "LU", tr: "Lüksemburg", en: "Luxembourg" },
  { iso: "MT", tr: "Malta", en: "Malta" },
  { iso: "NL", tr: "Hollanda", en: "Netherlands", aliases: ["holland"] },
  { iso: "PL", tr: "Polonya", en: "Poland" },
  { iso: "PT", tr: "Portekiz", en: "Portugal", aliases: ["portuguese republic"] },
  { iso: "RO", tr: "Romanya", en: "Romania" },
  { iso: "SK", tr: "Slovakya", en: "Slovakia", aliases: ["slovak cumhuriyeti", "slovak republic"] },
  { iso: "SI", tr: "Slovenya", en: "Slovenia" },
  { iso: "ES", tr: "İspanya", en: "Spain" },
  { iso: "SE", tr: "İsveç", en: "Sweden" },
  // EFTA
  { iso: "IS", tr: "İzlanda", en: "Iceland" },
  { iso: "LI", tr: "Lihtenştayn", en: "Liechtenstein" },
  { iso: "NO", tr: "Norveç", en: "Norway" },
  { iso: "CH", tr: "İsviçre", en: "Switzerland" },
  // Column-1 FTA partners
  { iso: "AL", tr: "Arnavutluk", en: "Albania" },
  { iso: "VE", tr: "Venezuela", en: "Venezuela", aliases: ["bolivarci venezuela cumhuriyeti"] },
  { iso: "GB", tr: "Birleşik Krallık", en: "United Kingdom", aliases: ["ingiltere", "uk", "great britain", "buyuk britanya ve kuzey irlanda birlesik kralligi"] },
  { iso: "BA", tr: "Bosna-Hersek", en: "Bosnia and Herzegovina", aliases: ["bosna hersek"] },
  { iso: "MA", tr: "Fas", en: "Morocco" },
  { iso: "FO", tr: "Faroe Adaları", en: "Faroe Islands" },
  { iso: "PS", tr: "Filistin", en: "Palestine" },
  { iso: "GE", tr: "Gürcistan", en: "Georgia" },
  { iso: "KR", tr: "Güney Kore", en: "South Korea", aliases: ["kore cumhuriyeti", "korea rep of", "korea republic of", "korea"] },
  { iso: "IL", tr: "İsrail", en: "Israel" },
  { iso: "ME", tr: "Karadağ", en: "Montenegro" },
  { iso: "XK", tr: "Kosova", en: "Kosovo" },
  { iso: "MK", tr: "Kuzey Makedonya", en: "North Macedonia", aliases: ["kuzey makedonya cumhuriyeti", "republic of macedonia", "macedonia"] },
  { iso: "MY", tr: "Malezya", en: "Malaysia" },
  { iso: "EG", tr: "Mısır", en: "Egypt", aliases: ["misir arap cumhuriyeti", "arab republic of egypt", "arap republic of egypt"] },
  { iso: "MU", tr: "Morityus", en: "Mauritius" },
  { iso: "MD", tr: "Moldova", en: "Moldova" },
  { iso: "RS", tr: "Sırbistan", en: "Serbia" },
  { iso: "SG", tr: "Singapur", en: "Singapore", aliases: ["singapur cumhuriyeti"] },
  { iso: "CL", tr: "Şili", en: "Chile" },
  { iso: "TN", tr: "Tunus", en: "Tunisia" },
  // Columns 2 and 3
  { iso: "QA", tr: "Katar", en: "Qatar", aliases: ["katar devleti"] },
  { iso: "AE", tr: "Birleşik Arap Emirlikleri", en: "United Arab Emirates", aliases: ["bae", "uae"] },
  // Major partners (column 7 unless listed above)
  { iso: "CN", tr: "Çin", en: "China", aliases: ["cin halk cumhuriyeti", "china p r", "prc"] },
  { iso: "TW", tr: "Tayvan", en: "Taiwan", aliases: ["cin tayvani", "chinese taipei"] },
  { iso: "HK", tr: "Hong Kong", en: "Hong Kong" },
  { iso: "JP", tr: "Japonya", en: "Japan" },
  { iso: "IN", tr: "Hindistan", en: "India" },
  { iso: "VN", tr: "Vietnam", en: "Viet Nam", aliases: ["vietnam"] },
  { iso: "TH", tr: "Tayland", en: "Thailand" },
  { iso: "ID", tr: "Endonezya", en: "Indonesia" },
  { iso: "US", tr: "ABD", en: "United States", aliases: ["amerika", "amerika birlesik devletleri", "usa"] },
  { iso: "CA", tr: "Kanada", en: "Canada" },
  { iso: "MX", tr: "Meksika", en: "Mexico" },
  { iso: "BR", tr: "Brezilya", en: "Brazil" },
  { iso: "AR", tr: "Arjantin", en: "Argentina" },
  { iso: "AU", tr: "Avustralya", en: "Australia" },
  { iso: "NZ", tr: "Yeni Zelanda", en: "New Zealand" },
  { iso: "RU", tr: "Rusya", en: "Russia", aliases: ["rusya federasyonu", "russian federation"] },
  { iso: "UA", tr: "Ukrayna", en: "Ukraine" },
  { iso: "BY", tr: "Belarus", en: "Belarus" },
  { iso: "AZ", tr: "Azerbaycan", en: "Azerbaijan" },
  { iso: "KZ", tr: "Kazakistan", en: "Kazakhstan" },
  { iso: "TM", tr: "Türkmenistan", en: "Turkmenistan" },
  { iso: "IR", tr: "İran", en: "Iran", aliases: ["iran islam cumhuriyeti", "islamic republic of iran"] },
  { iso: "IQ", tr: "Irak", en: "Iraq" },
  { iso: "SA", tr: "Suudi Arabistan", en: "Saudi Arabia" },
  { iso: "KW", tr: "Kuveyt", en: "Kuwait" },
  { iso: "BH", tr: "Bahreyn", en: "Bahrain", aliases: ["bahreyn kralligi", "kingdom of bahrain"] },
  { iso: "OM", tr: "Umman", en: "Oman" },
  { iso: "JO", tr: "Ürdün", en: "Jordan" },
  { iso: "LB", tr: "Lübnan", en: "Lebanon" },
  { iso: "SY", tr: "Suriye", en: "Syria" },
  { iso: "DZ", tr: "Cezayir", en: "Algeria" },
  { iso: "LY", tr: "Libya", en: "Libya" },
  { iso: "ZA", tr: "Güney Afrika", en: "South Africa" },
  { iso: "PH", tr: "Filipinler", en: "Philippines", aliases: ["the philippines"] },
  { iso: "PK", tr: "Pakistan", en: "Pakistan" },
  { iso: "LK", tr: "Sri Lanka", en: "Sri Lanka" },
  { iso: "BD", tr: "Bangladeş", en: "Bangladesh" },
  { iso: "KH", tr: "Kamboçya", en: "Cambodia", aliases: ["kambocya kralligi", "kingdom of cambodia"] },
  { iso: "MM", tr: "Myanmar", en: "Myanmar", aliases: ["burma"] },
  { iso: "NP", tr: "Nepal", en: "Nepal" },
  { iso: "ET", tr: "Etiyopya", en: "Ethiopia" },
  { iso: "UZ", tr: "Özbekistan", en: "Uzbekistan" },
  { iso: "KG", tr: "Kırgızistan", en: "Kyrgyzstan" },
  { iso: "TJ", tr: "Tacikistan", en: "Tajikistan" },
  { iso: "KE", tr: "Kenya", en: "Kenya" },
  { iso: "NG", tr: "Nijerya", en: "Nigeria" },
  { iso: "BO", tr: "Bolivya", en: "Bolivia" },
  { iso: "CO", tr: "Kolombiya", en: "Colombia" },
  { iso: "PE", tr: "Peru", en: "Peru" },
  { iso: "MN", tr: "Moğolistan", en: "Mongolia" },
  { iso: "AF", tr: "Afganistan", en: "Afghanistan" },
  { iso: "TZ", tr: "Tanzanya", en: "Tanzania" },
  { iso: "UG", tr: "Uganda", en: "Uganda" },
];

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));

export function countryName(iso: string | null | undefined): string {
  if (!iso) return "—";
  return BY_ISO.get(iso)?.tr ?? iso;
}

let nameIndex: Map<string, string> | null = null;
function index(): Map<string, string> {
  if (nameIndex) return nameIndex;
  nameIndex = new Map();
  for (const c of COUNTRIES) {
    for (const n of [c.iso, c.tr, c.en, ...(c.aliases ?? [])]) nameIndex.set(normalizeText(n), c.iso);
  }
  return nameIndex;
}

/**
 * Official lists spell countries out in full ("Hırvatistan Cumhuriyeti",
 * "Kingdom of Belgium"), so the state-form words are dropped before a second
 * attempt. Still null when unknown — never a guess.
 */
const STATE_WORDS = [
  "cumhuriyeti", "cumhuriyet", "kralligi", "krallik", "federal", "federasyonu", "islam", "arap", "buyuk", "dukaligi",
  "devleti", "sultanligi", "hasimi", "bolivarci", "halk", "demokratik", "birlesik", "republic", "of", "the", "kingdom",
  "federation", "state", "grand", "duchy", "peoples", "democratic", "islamic", "arab", "sultanate",
];

export function lookupCountry(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const n = normalizeText(raw);
  const direct = index().get(n);
  if (direct) return direct;
  const stripped = n.split(" ").filter((w) => !STATE_WORDS.includes(w)).join(" ").trim();
  return stripped && stripped !== n ? index().get(stripped) ?? null : null;
}
