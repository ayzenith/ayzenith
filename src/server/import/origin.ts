/**
 * IMPORT INTELLIGENCE — origin, dispatch and A.TR (pure).
 *
 * Three separate facts, never inferred from each other:
 *   - ORIGIN   — where the goods were made (decides the country-group column);
 *   - DISPATCH — where they are shipped from (Germany dispatch ≠ Germany origin);
 *   - A.TR     — a movement certificate proving FREE CIRCULATION in the EU–Turkey
 *                customs union. It is NOT a certificate of origin.
 *
 * Customs duty (İthalat Rejimi Kararı II Sayılı Liste): goods in free
 * circulation in the EU arriving with A.TR take column 1 whatever their origin.
 * Otherwise the origin's column applies, and a preferential column (1–6) only
 * with the proof of origin its agreement requires; without it, column 7.
 *
 * Additional customs duty (İGV Kararı, Karar Sayısı 3351, md. 2/2, verbatim in
 * IGV_ATR_RULE_TEXT): goods arriving with A.TR that are NOT of EU or Turkish
 * origin pay İGV at the "Diğer Ülkeler" rate, unless preferential origin within
 * a pan-Euro-Med cumulation zone is proven.
 */

import { COUNTRIES, DUTY_COLUMN_LABELS, EFTA, FTA_COLUMN_1, GTS_EXCLUDED_SECTORS, countryName, isEu, originColumn, type DutyColumn } from "./countries";
import type { EvidenceItem } from "./types";

export type OriginProof = "NONE" | "EUR1" | "EUR_MED" | "ORIGIN_DECLARATION" | "FORM_A" | "CERT_OF_ORIGIN";

export const ORIGIN_PROOF_LABELS: Record<OriginProof, string> = {
  NONE: "Yok",
  EUR1: "EUR.1 dolaşım belgesi",
  EUR_MED: "EUR-MED dolaşım belgesi",
  ORIGIN_DECLARATION: "Fatura / menşe beyanı",
  FORM_A: "Form A / REX (GTS)",
  CERT_OF_ORIGIN: "Menşe şahadetnamesi (tercihli olmayan)",
};

export const IGV_ATR_RULE_TEXT =
  "Ekli tablolarda yer alan ve A.TR dolaşım belgesi eşliğinde ithal edilen Avrupa Birliği ve Türk menşeli olmayan eşyadan “Diğer Ülkeler” sütununda belirtilen oran üzerinden ilave gümrük vergisi alınır. Ancak, Türkiye’nin taraf olduğu serbest ticaret anlaşmaları çerçevesinde bir çapraz menşe kümülasyon sistemine dahil ülkeler menşeli eşyadan tercihli menşeinin tevsiki halinde ilave gümrük vergisi alınmaz.";

export type OriginInput = {
  originCountry: string | null;
  dispatchCountry: string | null;
  atr: boolean | null;
  originProof: OriginProof | null;
  chapter: number | null;
};

export type OriginDecision = {
  status: "DETERMINED" | "INSUFFICIENT";
  customsStatus: "FREE_CIRCULATION_EU" | "THIRD_COUNTRY" | "UNKNOWN";
  originColumn: DutyColumn | null;
  dutyColumn: DutyColumn | null;
  additionalDutyColumn: DutyColumn | null;
  /** İGV waived by the pan-Euro-Med cumulation clause (needs verification). */
  additionalDutyWaived: boolean;
  preferential: boolean;
  dutyWhy: string[];
  additionalDutyWhy: string[];
  /** The column that WOULD apply if A.TR were presented — shown when A.TR is unknown. */
  atrScenario: { dutyColumn: DutyColumn; additionalDutyColumn: DutyColumn } | null;
  evidence: EvidenceItem[];
};

const PREF_FTA: OriginProof[] = ["EUR1", "EUR_MED", "ORIGIN_DECLARATION"];
const CUMULATION_ZONE = new Set<string>([...EFTA, ...FTA_COLUMN_1]);

function ev(kind: EvidenceItem["kind"], polarity: EvidenceItem["polarity"], provenance: EvidenceItem["provenance"], text: string, sourceKey?: string): EvidenceItem {
  return { area: "ORIGIN", kind, polarity, provenance, text, sourceKey };
}

export function decideOrigin(input: OriginInput): OriginDecision {
  const evidence: EvidenceItem[] = [];
  const origin = input.originCountry;
  const dispatch = input.dispatchCountry;
  const proof = input.originProof ?? null;

  if (dispatch && origin && dispatch !== origin) {
    evidence.push(ev("NOTE", "NEUTRAL", "USER_ENTERED", `Çıkış ülkesi (${countryName(dispatch)}) menşe ülkesi (${countryName(origin)}) değildir; vergi menşeye göre belirlenir.`));
  }
  if (dispatch && !origin) {
    evidence.push(ev("MISSING_INFO", "NEGATIVE", "INFERRED", `Menşe girilmedi. Ürünün ${countryName(dispatch)}'dan gelmesi menşeinin orası olduğunu göstermez — menşe varsayılmadı.`));
  }

  if (!origin) {
    return {
      status: "INSUFFICIENT",
      customsStatus: dispatch && isEu(dispatch) && input.atr ? "FREE_CIRCULATION_EU" : "UNKNOWN",
      originColumn: null,
      dutyColumn: dispatch && isEu(dispatch) && input.atr && input.chapter !== 72 ? "1" : null,
      additionalDutyColumn: null,
      additionalDutyWaived: false,
      preferential: false,
      dutyWhy: ["Menşe ülkesi girilmedi — sütun belirlenemedi."],
      additionalDutyWhy: ["Menşe ülkesi girilmedi — İGV sütunu belirlenemedi."],
      atrScenario: null,
      evidence,
    };
  }

  const natural = originColumn(origin);
  const dutyWhy: string[] = [];
  const igvWhy: string[] = [];
  let dutyColumn: DutyColumn = "7";
  let igvColumn: DutyColumn = "7";
  let waived = false;
  let preferential = false;
  let customsStatus: OriginDecision["customsStatus"] = "THIRD_COUNTRY";

  if (origin === "TR") {
    evidence.push(ev("CONFLICT", "NEGATIVE", "INFERRED", "Menşe Türkiye girildi: Türk menşeli eşyanın geri gelişi ayrı rejimlere tabidir; bu hesap o durumu kapsamaz."));
  }

  const atrUsable = input.atr === true && !!dispatch && isEu(dispatch) && input.chapter !== 72;
  if (input.atr === true && dispatch && !isEu(dispatch)) {
    evidence.push(ev("CONFLICT", "NEGATIVE", "INFERRED", `A.TR işaretlendi ama çıkış ülkesi ${countryName(dispatch)} AB üyesi değil; A.TR AB–Türkiye gümrük birliğinde serbest dolaşım belgesidir.`));
  }
  if (input.atr === true && input.chapter === 72) {
    evidence.push(ev("CONFLICT", "NEGATIVE", "INFERRED", "72. fasıl (demir-çelik) AKÇT ürünüdür; gümrük birliği kapsamında değildir, A.TR yerine EUR.1 aranır. A.TR dikkate alınmadı."));
  }
  if (input.atr === true && input.chapter === 73) {
    evidence.push(ev("NOTE", "NEUTRAL", "INFERRED", "73. fasılda bazı ürünler (7301–7306) AKÇT kapsamında olabilir; A.TR geçerliliğini kontrol edin."));
  }

  if (atrUsable) {
    customsStatus = "FREE_CIRCULATION_EU";
    dutyColumn = "1";
    preferential = true;
    dutyWhy.push("A.TR ile AB'de serbest dolaşımdaki eşya → Sütun 1 (menşeden bağımsız).");
    if (isEu(origin) || origin === "TR") {
      igvColumn = "1";
      igvWhy.push(`Menşe ${countryName(origin)} (AB/Türk menşeli) → İGV Sütun 1.`);
    } else if (CUMULATION_ZONE.has(origin) && proof === "EUR_MED") {
      igvColumn = "1";
      waived = true;
      igvWhy.push("A.TR + EUR-MED ile tercihli menşe tevsik edildi → İGV Kararı md. 2/2 istisnası (çapraz kümülasyon kapsamı doğrulanmalı).");
    } else {
      igvColumn = "7";
      igvWhy.push(`A.TR ile gelen, AB veya Türk menşeli olmayan eşya (menşe ${countryName(origin)}) → İGV "Diğer Ülkeler" sütunu (İGV Kararı md. 2/2).`);
      evidence.push(ev("RULE", "NEGATIVE", "OFFICIAL", IGV_ATR_RULE_TEXT, "TR_IGV_DECISION_PAGE"));
    }
  } else {
    if (dispatch && isEu(dispatch) && input.atr == null) {
      evidence.push(ev("MISSING_INFO", "NEGATIVE", "INFERRED", "A.TR durumu belirtilmedi. Hesap A.TR sunulmadığı durum için yapıldı; A.TR sunulursa senaryosu ayrıca gösterildi."));
    }
    switch (natural) {
      case "1":
        if (isEu(origin)) {
          dutyWhy.push(`AB menşeli sanayi ürününde tercihli rejim A.TR ile uygulanır; A.TR ${input.atr === false ? "yok" : "belirtilmedi"} → Sütun 7.`);
        } else if (proof && PREF_FTA.includes(proof)) {
          dutyColumn = "1";
          preferential = true;
          dutyWhy.push(`Menşe ${countryName(origin)} (STA ülkesi) + ${proof} menşe ispatı → Sütun 1.`);
        } else {
          dutyWhy.push(`Menşe ${countryName(origin)} STA ülkesi, ama tercihli menşe ispatı (EUR.1 / EUR-MED / menşe beyanı) yok → Sütun 7.`);
        }
        break;
      case "2":
      case "3":
        if (proof && proof !== "NONE" && proof !== "FORM_A") {
          dutyColumn = natural;
          preferential = true;
          dutyWhy.push(`Menşe ${countryName(origin)} + menşe belgesi → ${DUTY_COLUMN_LABELS[natural]}. Belgenin anlaşmanın öngördüğü belge olduğunu doğrulayın.`);
        } else {
          dutyWhy.push(`Menşe ${countryName(origin)}, ama tercihli menşe belgesi yok → Sütun 7.`);
        }
        break;
      case "4":
      case "5":
      case "6":
        if (proof === "FORM_A" || proof === "ORIGIN_DECLARATION") {
          dutyColumn = natural;
          preferential = true;
          dutyWhy.push(`Menşe ${countryName(origin)} (GTS) + ${proof} → ${DUTY_COLUMN_LABELS[natural]}.`);
          if (GTS_EXCLUDED_SECTORS[origin]) {
            evidence.push(ev("NOTE", "NEGATIVE", "OFFICIAL", `EK-1'e göre ${countryName(origin)} için hariç sektörler: ${GTS_EXCLUDED_SECTORS[origin]}. Ürünün bu sektörlerde olup olmadığı sistemce kontrol edilmedi.`, "TR_IRK_2026_ANNEX"));
          }
        } else {
          dutyWhy.push(`Menşe ${countryName(origin)} GTS ülkesi, ama Form A / REX menşe beyanı yok → Sütun 7.`);
        }
        break;
      default:
        dutyWhy.push(`Menşe ${countryName(origin)} hiçbir tercihli sütunda yok → Sütun 7 (Diğer Ülkeler).`);
    }
    igvColumn = dutyColumn;
    igvWhy.push(`İGV, İthalat Rejimi Kararı'ndaki aynı ülke gruplarıyla uygulanır → ${DUTY_COLUMN_LABELS[igvColumn]}.`);
  }

  const atrScenario = !atrUsable && dispatch && isEu(dispatch) && input.atr == null && input.chapter !== 72
    ? { dutyColumn: "1" as DutyColumn, additionalDutyColumn: (isEu(origin) || origin === "TR" ? "1" : "7") as DutyColumn }
    : null;

  return {
    status: "DETERMINED",
    customsStatus,
    originColumn: natural,
    dutyColumn,
    additionalDutyColumn: igvColumn,
    additionalDutyWaived: waived,
    preferential,
    dutyWhy,
    additionalDutyWhy: igvWhy,
    atrScenario,
    evidence,
  };
}

export const COUNTRY_OPTIONS = [...COUNTRIES].sort((a, b) => a.tr.localeCompare(b.tr, "tr"));
