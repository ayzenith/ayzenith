/**
 * AYZENITH RADAR — curated HS-6 seed for the seven launch categories.
 *
 * IMPORTANT — how these codes were produced:
 *  • They are drawn from the WCO Harmonized System 2022 nomenclature (the same
 *    classification UN Comtrade speaks), NOT invented.
 *  • Codes that are stable and unambiguous across HS editions are seeded as
 *    VERIFIED. The heading 8518 structure (851830 = headphones) was spot-checked
 *    against an official HS reference during seeding.
 *  • Codes affected by the HS-2022 reclassification (e.g. the smartphone split
 *    851712 → 851713/851714) or whose commercial↔HS mapping is genuinely
 *    debated (smartwatches sit between 8517 and 9102) are seeded as NEEDS_REVIEW.
 *    NEEDS_REVIEW codes are EXCLUDED from scoring until a human confirms them in
 *    Admin → Radar → HS Eşlemeleri.
 *  • A single HS-6 code may legitimately appear under more than one category
 *    (e.g. 851830 headphones under both Consumer Electronics and Mobile
 *    Accessories) — this is intentional and supported.
 *
 * This is only the INITIAL seed; the live table in the DB is the source of
 * truth and the owner edits it from the admin panel.
 */

export type HsSeedEntry = {
  hs6: string;
  productGroup: string;
  verification: "VERIFIED" | "NEEDS_REVIEW";
  /** Official reference the code was taken from. */
  source: string;
  note?: string;
};

const WCO = "WCO HS 2022 Nomenclature";

export const RADAR_HS_SEED: Record<string, HsSeedEntry[]> = {
  "consumer-electronics": [
    { hs6: "851830", productGroup: "Kulaklıklar ve mikrofonlu kulaklık setleri", verification: "VERIFIED", source: `${WCO} · resmi HS referansı ile teyit` },
    { hs6: "851821", productGroup: "Hoparlörler (tekli, kabinli)", verification: "VERIFIED", source: WCO },
    { hs6: "847130", productGroup: "Taşınabilir bilgisayarlar (dizüstü/tablet, ≤10kg)", verification: "VERIFIED", source: WCO },
    { hs6: "852872", productGroup: "Televizyon alıcıları (renkli)", verification: "VERIFIED", source: WCO },
    { hs6: "850760", productGroup: "Lityum-iyon aküler", verification: "NEEDS_REVIEW", source: WCO, note: "Akü/hücre bir BİLEŞENDİR, bitmiş tüketici elektroniği ürünü değildir; ekonomik hacmi yüksek olsa da AYZENITH'in 'Tüketici Elektroniği' ticari ağacına ait olduğu doğrulanmadan analize dahil edilmemeli. Kategori eşlemesi insan onayı bekliyor." },
    { hs6: "851713", productGroup: "Akıllı telefonlar", verification: "NEEDS_REVIEW", source: WCO, note: "HS2022 ile 851712'den 851713/851714'e ayrıldı; geçmiş yıl verisiyle tutarlılık kontrol edilmeli." },
  ],
  "smart-devices": [
    { hs6: "851762", productGroup: "Ses/veri alım-dönüştürme-iletim cihazları (router, akıllı hub)", verification: "VERIFIED", source: WCO },
    { hs6: "852580", productGroup: "Televizyon/dijital/video kameralar", verification: "VERIFIED", source: WCO },
    { hs6: "950450", productGroup: "Video oyun konsolları ve makineleri", verification: "VERIFIED", source: WCO },
    { hs6: "910212", productGroup: "Elektronik göstergeli kol saatleri (akıllı saat adayı)", verification: "NEEDS_REVIEW", source: WCO, note: "Akıllı saat sınıflandırması 8517 ile 9102 arasında tartışmalı; onay gerekli." },
  ],
  "mobile-accessories": [
    { hs6: "850440", productGroup: "Statik konvertörler (şarj cihazları/adaptörler)", verification: "VERIFIED", source: WCO },
    { hs6: "850760", productGroup: "Lityum-iyon aküler (power bank)", verification: "VERIFIED", source: WCO, note: "Tüketici Elektroniği ile ortak kod (kasıtlı)." },
    { hs6: "851830", productGroup: "Kulaklıklar", verification: "VERIFIED", source: WCO, note: "Tüketici Elektroniği ile ortak kod (kasıtlı)." },
    { hs6: "852351", productGroup: "Katı hal kalıcı bellek (USB/flash)", verification: "VERIFIED", source: WCO },
    { hs6: "851770", productGroup: "Telefon/veri cihazı parçaları", verification: "NEEDS_REVIEW", source: WCO, note: "Çok geniş kapsamlı; aksesuar dışı parçaları da içerir, onay gerekli." },
  ],
  "home-kitchen": [
    { hs6: "851660", productGroup: "Elektrikli fırınlar, ocaklar, pişirme plakaları", verification: "VERIFIED", source: WCO },
    { hs6: "850811", productGroup: "Elektrikli süpürgeler (≤1500W)", verification: "VERIFIED", source: WCO },
    { hs6: "850940", productGroup: "Gıda öğütücüler/mikserler, meyve-sebze sıkacakları", verification: "VERIFIED", source: WCO },
    { hs6: "841810", productGroup: "Buzdolabı-dondurucu kombinasyonları", verification: "VERIFIED", source: WCO },
    { hs6: "732393", productGroup: "Paslanmaz çelik sofra/mutfak eşyaları", verification: "VERIFIED", source: WCO },
  ],
  textile: [
    { hs6: "610910", productGroup: "Tişört/atlet, pamuklu, örme", verification: "VERIFIED", source: WCO },
    { hs6: "620342", productGroup: "Erkek pantolonları, pamuklu", verification: "VERIFIED", source: WCO },
    { hs6: "611020", productGroup: "Kazak/hırka, pamuklu, örme", verification: "VERIFIED", source: WCO },
    { hs6: "630260", productGroup: "Havlu cinsi mutfak/banyo tekstili, pamuklu", verification: "VERIFIED", source: WCO },
    { hs6: "610462", productGroup: "Kadın pantolonları, pamuklu, örme", verification: "VERIFIED", source: WCO },
  ],
  medical: [
    { hs6: "901839", productGroup: "İğneler, kateterler, kanüller (tıbbi)", verification: "VERIFIED", source: WCO },
    { hs6: "901890", productGroup: "Diğer tıbbi/cerrahi alet ve cihazlar", verification: "VERIFIED", source: WCO },
    { hs6: "300610", productGroup: "Steril cerrahi dikiş malzemeleri (katgüt vb.)", verification: "VERIFIED", source: WCO },
    { hs6: "902110", productGroup: "Ortopedik cihazlar ve kırık teçhizatı", verification: "VERIFIED", source: WCO },
    { hs6: "401511", productGroup: "Cerrahi eldivenler (kauçuk)", verification: "VERIFIED", source: WCO },
  ],
  "dental-implants": [
    { hs6: "902129", productGroup: "Diş protez parçaları (implantlar dahil), diğer", verification: "VERIFIED", source: WCO, note: "Dental implantlar 9021.29 altında sınıflandırılır." },
    { hs6: "902121", productGroup: "Suni dişler", verification: "VERIFIED", source: WCO },
    { hs6: "901849", productGroup: "Diş hekimliği alet ve cihazları, diğer", verification: "VERIFIED", source: WCO },
    { hs6: "300640", productGroup: "Diş dolgu maddeleri ve diş çimentoları", verification: "VERIFIED", source: WCO },
  ],
};
