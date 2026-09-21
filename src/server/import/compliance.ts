/**
 * IMPORT INTELLIGENCE — import controls (pure).
 *
 * V1 reads two official Ministry of Trade pages: "İthalatta Denetimi
 * Gerçekleştirilen Ürün Grupları" (the product-safety / TAREKS communiqués and
 * what each covers) and "İthalat Tebliğleri" (special regimes). It does NOT
 * hold the GTİP annex lists of those communiqués — they are in Resmî Gazete
 * PDFs. So a check can say "this product group is named in communiqué X" and
 * point at it, but never "this GTİP is / is not on the list": nothing here is
 * ever GREEN, and "no match" is INSUFFICIENT, not "no control".
 */

import type { ProductAttributes } from "./attributes";
import type { ComplianceTag } from "./concepts";
import { normalizeText } from "./text";
import type { ComplianceLevel, EvidenceItem } from "./types";
import type { ImportCommunique, UgdGroup } from "./parsers";

export type ComplianceCheck = {
  key: string;
  label: string;
  level: ComplianceLevel;
  statusText: string;
  detail: string;
  links: Array<{ label: string; url: string }>;
  evidence: EvidenceItem[];
};

export const COMPLIANCE_LEVEL_LABELS: Record<ComplianceLevel, string> = {
  GREEN: "UYGUN",
  YELLOW: "KONTROL GEREKLİ",
  RED: "KISITLAMA OLABİLİR",
  INSUFFICIENT: "VERİ YETERSİZ",
};

/** Which communiqué title a product trait points at. Titles are matched, not numbers — numbers change every year. */
const TAG_TO_TITLE: Array<{ tag: ComplianceTag; title: RegExp; why: string }> = [
  { tag: "RADIO", title: /Telsiz/i, why: "Kablosuz (telsiz) bağlantılı ürün" },
  { tag: "ELECTRICAL", title: /“?CE”? İşareti/i, why: "Elektrikli / elektronik ürün (düşük gerilim, elektromanyetik uyumluluk)" },
  { tag: "TOY", title: /Oyuncak/i, why: "Oyuncak" },
  { tag: "PPE", title: /Kişisel Koruyucu/i, why: "Kişisel koruyucu donanım niteliği" },
  { tag: "CONSUMER", title: /Tüketici Ürünleri/i, why: "Tüketiciye yönelik ürün" },
  { tag: "BATTERY", title: /Pil ve Akümülatör/i, why: "Pil / akümülatör içeriyor" },
  { tag: "MEDICAL", title: /Tıbbi Cihaz/i, why: "Tıbbi cihaz niteliği" },
  { tag: "BABY", title: /Anne ve Bebek/i, why: "Bebek ürünü" },
  { tag: "TEXTILE", title: /Tekstil/i, why: "Tekstil / konfeksiyon ürünü" },
  { tag: "FOOTWEAR_LEATHER", title: /Tekstil, Konfeksiyon ve Deri/i, why: "Deri / ayakkabı ürünü" },
  { tag: "VEHICLE_PART", title: /Araç Parça/i, why: "Taşıt parçası" },
  { tag: "MACHINERY", title: /Makinaların İthalat/i, why: "Makine" },
  { tag: "FOOD_CONTACT", title: /Tarım ve Orman Bakanlığı/i, why: "Gıda ile temas eden ürün (Tarım ve Orman Bakanlığı kontrolü olabilir)" },
];

/** Special import regimes whose titles name the product family. */
const REGIME_WORDS: Array<{ re: RegExp; words: string[] }> = [
  { re: /Bıçak|Ateşli Silah|Patlayıcı/i, words: ["bicak", "knife", "silah", "tabanca", "fisek", "patlayici", "havai fisek"] },
  { re: /Harita/i, words: ["harita", "map", "kure", "globe"] },
  { re: /Tatlandırıcı/i, words: ["tatlandirici", "sweetener", "stevia", "aspartam"] },
  { re: /Gübre/i, words: ["gubre", "fertilizer"] },
  { re: /Radyoaktif/i, words: ["radyoaktif", "radioactive", "x ray", "rontgen"] },
  { re: /Elektronik Kimlik/i, words: ["imei", "telefon", "phone", "smartphone", "akilli saat", "tablet", "sim kart", "esim"] },
  { re: /Hibrit Araç|Elektrikli ve Haricen/i, words: ["elektrikli arac", "elektrikli otomobil", "hybrid", "hibrit"] },
  { re: /Sivil Hava Taşıt/i, words: ["ucak", "aircraft", "helikopter"] },
];

function ev(text: string, provenance: EvidenceItem["provenance"], polarity: EvidenceItem["polarity"] = "NEUTRAL", sourceKey?: string): EvidenceItem {
  return { area: "COMPLIANCE", kind: provenance === "OFFICIAL" ? "RULE" : "NOTE", polarity, provenance, text, sourceKey };
}

export function checkCompliance(input: {
  attributes: ProductAttributes;
  tags: ComplianceTag[];
  conceptKeywords: string[];
  gtip: string | null;
  ugd: { groups: UgdGroup[]; sourceKey: string; available: boolean; pageDate: string | null };
  communiques: { items: ImportCommunique[]; sourceKey: string; available: boolean };
}): { checks: ComplianceCheck[]; overall: ComplianceLevel } {
  const a = input.attributes;
  const tags = new Set<ComplianceTag>(input.tags);
  if (a.wireless.length > 0) tags.add("RADIO");
  if (a.electrical) tags.add("ELECTRICAL");
  if (a.battery) tags.add("BATTERY");
  const checks: ComplianceCheck[] = [];

  // --- TAREKS / product-safety communiqués ----------------------------------
  if (!input.ugd.available) {
    checks.push({
      key: "TAREKS", label: "TAREKS / ürün güvenliği denetimi", level: "INSUFFICIENT", statusText: "KAYNAĞA ERİŞİLEMEDİ",
      detail: "Ticaret Bakanlığı ürün grupları sayfası okunamadı.", links: [], evidence: [ev("Kaynak okunamadığı için denetim kapsamı değerlendirilemedi.", "UNKNOWN", "NEGATIVE")],
    });
  } else {
    const hits: Array<{ g: UgdGroup; direct: string | null; why: string }> = [];
    for (const g of input.ugd.groups) {
      const scope = normalizeText(`${g.title} ${g.scope}`);
      const direct = input.conceptKeywords.map((k) => k.replace(/^[=^]/, "")).find((k) => k.length >= 4 && scope.includes(k)) ?? null;
      const tagged = TAG_TO_TITLE.find((m) => tags.has(m.tag) && m.title.test(g.title));
      if (direct || tagged) hits.push({ g, direct, why: direct ? `Resmi açıklamada ürün grubu adıyla geçiyor ("${direct}")` : tagged!.why });
    }
    if (hits.length === 0) {
      checks.push({
        key: "TAREKS", label: "TAREKS / ürün güvenliği denetimi", level: "INSUFFICIENT", statusText: "VERİ YETERSİZ",
        detail: "Ürün, Bakanlığın denetlenen ürün grupları açıklamalarından hiçbiriyle eşleşmedi. Tebliğ eklerindeki GTİP listeleri sisteme yüklenmediği için bu, denetim olmadığı anlamına gelmez.",
        links: [], evidence: [ev("Eşleşme yok; GTİP ek listeleri kontrol edilmedi.", "INFERRED", "NEGATIVE", input.ugd.sourceKey)],
      });
    }
    for (const h of hits) {
      checks.push({
        key: `TAREKS_${h.g.no}`,
        label: `${h.g.group || h.g.title} — ÜGD ${h.g.no}`,
        level: "YELLOW",
        statusText: "RESMİ DOĞRULAMA GEREKLİ",
        detail: `${h.why}. Bu tebliğ kapsamındaki ürünlerin ithalatı TAREKS üzerinden denetlenebilir; GTİP'in tebliğ ekindeki listede olup olmadığı sistemce doğrulanmadı.`,
        links: [h.g.rgUrl ? { label: "Tebliğ (Resmî Gazete)", url: h.g.rgUrl } : null, h.g.guideUrl ? { label: "Denetim rehberi", url: h.g.guideUrl } : null].filter((x): x is { label: string; url: string } => !!x),
        evidence: [
          ev(`Resmi sayfa (${input.ugd.pageDate ?? "?"}): ${h.g.title}. ${h.g.scope.slice(0, 400)}`, "OFFICIAL", "NEUTRAL", input.ugd.sourceKey),
          ev(h.direct ? `Ürün grubunun adı resmi açıklamada geçiyor: "${h.direct}".` : `Eşleşme ürün özelliğine dayanıyor: ${h.why} (sistem çıkarımı).`, h.direct ? "OFFICIAL" : "INFERRED"),
        ],
      });
    }
  }

  // --- CE / conformity ---------------------------------------------------------
  const ceRelevant = ["ELECTRICAL", "TOY", "PPE", "MACHINERY", "MEDICAL", "RADIO"].some((t) => tags.has(t as ComplianceTag));
  checks.push({
    key: "CE",
    label: "CE işareti / uygunluk değerlendirmesi",
    level: ceRelevant ? "YELLOW" : "INSUFFICIENT",
    statusText: ceRelevant ? "GEREKLİ OLABİLİR — DOĞRULANMADI" : "VERİ YETERSİZ",
    detail: ceRelevant
      ? "Ürün türü CE işareti taşıması gereken ürün gruplarına giriyor olabilir (elektrikli teçhizat, elektromanyetik uyumluluk, telsiz, oyuncak, KKD, makine). Uygunluk beyanı ve test raporlarını tedarikçiden isteyin."
      : "Ürünün CE kapsamına girip girmediğine dair yeterli bilgi yok.",
    links: [],
    evidence: [ev(ceRelevant ? "Ürün özelliklerinden çıkarım (elektrik/telsiz/oyuncak vb.)." : "Kapsamı belirleyecek özellik bulunamadı.", "INFERRED")],
  });

  // --- Radio / wireless ------------------------------------------------------------
  if (tags.has("RADIO")) {
    checks.push({
      key: "RADIO",
      label: "Telsiz / kablosuz ekipman",
      level: "YELLOW",
      statusText: "KONTROL GEREKLİ",
      detail: `Ürün kablosuz bağlantı içeriyor (${a.wireless.map((w) => w.value).join(", ") || "hücresel"}). Telsiz ekipmanları ithalat aşamasında denetlenebilir; BTK kayıt / uygunluk gereklilikleri olabilir.`,
      links: [],
      evidence: a.wireless.map((w) => ev(`"${w.value}" — kaynak: ${w.from}`, w.provenance)),
    });
  }

  // --- Battery ------------------------------------------------------------------
  if (tags.has("BATTERY")) {
    checks.push({
      key: "BATTERY", label: "Pil / akümülatör", level: "YELLOW", statusText: "KONTROL GEREKLİ",
      detail: "Pil veya akümülatör içeren ürünlerde atık pil yükümlülükleri ve taşımada tehlikeli madde (lityum) kuralları söz konusu olabilir.",
      links: [], evidence: [ev(`Pil bilgisi: ${a.battery?.value ?? "ürün türünden"}`, a.battery?.provenance ?? "INFERRED")],
    });
  }

  // --- Used / refurbished goods ----------------------------------------------
  const used = a.condition && a.condition.value !== "NEW";
  const usedCommunique = input.communiques.items.find((c) => /Kullanılmış veya Yenileştirilmiş/i.test(c.title));
  checks.push({
    key: "USED_GOODS",
    label: "Kullanılmış / yenilenmiş eşya",
    level: used ? "RED" : a.condition ? "GREEN" : "INSUFFICIENT",
    statusText: used ? "KISITLAMA OLABİLİR" : a.condition ? "YENİ ÜRÜN (KULLANICI BEYANI)" : "VERİ YETERSİZ",
    detail: used
      ? `Kullanılmış veya yenileştirilmiş eşya ithalatı özel tebliğe tabidir${usedCommunique ? ` (${usedCommunique.title})` : ""}; izin gerekebilir veya yasak olabilir.`
      : a.condition
        ? "Ürün yeni olarak belirtildi."
        : "Ürünün yeni mi kullanılmış mı olduğu belirtilmedi.",
    links: used && usedCommunique?.url ? [{ label: "Tebliğ", url: usedCommunique.url }] : [],
    evidence: used ? [ev(usedCommunique ? `Resmi liste: ${usedCommunique.title}` : "Tebliğ listesi okunamadı.", usedCommunique ? "OFFICIAL" : "UNKNOWN", "NEGATIVE", input.communiques.sourceKey)] : a.condition ? [ev(`Durum: ${a.condition.value} — ${a.condition.from}`, a.condition.provenance)] : [],
  });

  // --- Special import regimes --------------------------------------------------------
  if (input.communiques.available) {
    for (const r of REGIME_WORDS) {
      const word = r.words.find((w) => a.normalized.includes(w));
      if (!word) continue;
      const c = input.communiques.items.find((x) => r.re.test(x.title));
      if (!c) continue;
      checks.push({
        key: `REGIME_${c.no}`,
        label: `Özel ithalat rejimi — İthalat ${c.no}`,
        level: "YELLOW",
        statusText: "KONTROL GEREKLİ",
        detail: `Ürün metnindeki "${word}" ifadesi şu tebliğin konusuyla ilişkili olabilir: ${c.title}. Kapsamda olup olmadığını tebliğ ekinden kontrol edin.`,
        links: c.url ? [{ label: "Tebliğ", url: c.url }] : [],
        evidence: [ev(`Resmi liste: ${c.title}`, "OFFICIAL", "NEUTRAL", input.communiques.sourceKey), ev(`Eşleşme kelimesi: "${word}" (sistem çıkarımı)`, "INFERRED")],
      });
    }
  }

  // --- Not connected in V1 -----------------------------------------------------------
  checks.push({
    key: "SURVEILLANCE_QUOTA", label: "Gözetim / kota / lisans", level: "INSUFFICIENT", statusText: "KONTROL EDİLMEDİ",
    detail: "Gözetim, kota ve lisans listeleri V1'de sisteme bağlı değil. TARA (Ticaret Bakanlığı tarife sorgulama) üzerinden elle kontrol edin.",
    links: [{ label: "TARA — Tarife Arama Motoru", url: "https://uygulama.gtb.gov.tr/Tara/" }], evidence: [ev("TARA güvenlik kodu (CAPTCHA) istediği için otomatik sorgulanmıyor.", "INFERRED")],
  });
  checks.push({
    key: "LABELING", label: "Etiketleme / Türkçe kullanım kılavuzu", level: "INSUFFICIENT", statusText: "VERİ YETERSİZ",
    detail: "Etiketleme ve belge gereklilikleri ürün grubuna özgü teknik düzenlemelerde yer alır; sistemde bu düzenlemeler yüklü değil.",
    links: [], evidence: [],
  });

  const order: ComplianceLevel[] = ["RED", "YELLOW", "INSUFFICIENT", "GREEN"];
  const overall = order.find((l) => checks.some((c) => c.level === l)) ?? "INSUFFICIENT";
  return { checks, overall };
}
