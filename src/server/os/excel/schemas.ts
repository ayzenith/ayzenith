import "server-only";

/**
 * AYZENITH BUSINESS OS — the import contract.
 *
 * One declarative table per importable entity: what the column is called in
 * Turkish, what else it might be called in a file the owner pastes from
 * somewhere else, whether it is required, and how the value is coerced.
 *
 * The aliases matter more than they look. Real spreadsheets arrive with
 * "Firma Adı", "FIRMA ADI", "Unvan", "Company", "Cari Ünvan" — auto-mapping on a
 * normalised alias list is the difference between an import that works on the
 * first try and one the owner abandons at the column-mapping screen.
 */

export type FieldType = "text" | "number" | "money" | "date" | "bool" | "enum";

export type ImportField = {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
  type: FieldType;
  /** For `enum`: accepted Turkish/English inputs → stored value. */
  values?: Record<string, string>;
  hint?: string;
  /** Value written into the downloadable template's example row. */
  example?: string;
};

export type ImportSchema = {
  entity: string;
  label: string;
  /** Column whose repeated value groups rows into one multi-line document. */
  groupBy?: string;
  fields: ImportField[];
  note?: string;
};

/** Header normalisation: case, accents, spacing and punctuation all ignored. */
export function normalizeHeader(h: string): string {
  return h
    .toString()
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

const ROLE_VALUES: Record<string, string> = {
  musteri: "CUSTOMER", customer: "CUSTOMER", alici: "CUSTOMER",
  tedarikci: "SUPPLIER", supplier: "SUPPLIER", satici: "SUPPLIER",
  bayi: "DEALER", dealer: "DEALER",
  distributor: "DISTRIBUTOR",
  magaza: "STORE", store: "STORE",
  isortagi: "PARTNER", partner: "PARTNER",
  nakliyeci: "CARRIER", carrier: "CARRIER",
  hizmetsaglayici: "SERVICE_PROVIDER",
  diger: "OTHER", other: "OTHER",
};

const EXPENSE_KIND_VALUES: Record<string, string> = {
  kira: "RENT", rent: "RENT",
  maas: "SALARY", salary: "SALARY", personel: "SALARY",
  yazilim: "SOFTWARE", software: "SOFTWARE", abonelik: "SOFTWARE",
  elektrik: "UTILITIES", su: "UTILITIES", internet: "UTILITIES", fatura: "UTILITIES",
  muhasebe: "ACCOUNTING", accounting: "ACCOUNTING",
  reklam: "MARKETING", marketing: "MARKETING", pazarlama: "MARKETING",
  banka: "BANK", bank: "BANK",
  lojistik: "LOGISTICS", nakliye: "LOGISTICS", kargo: "LOGISTICS",
  seyahat: "TRAVEL", travel: "TRAVEL",
  vergi: "TAX", tax: "TAX",
  diger: "OTHER", other: "OTHER",
};

const STOCK_REASON_VALUES: Record<string, string> = {
  acilis: "OPENING", opening: "OPENING", acilisstogu: "OPENING",
  duzeltme: "ADJUSTMENT", adjustment: "ADJUSTMENT", sayim: "ADJUSTMENT",
  fire: "DAMAGE", hasar: "DAMAGE", damage: "DAMAGE",
  iade: "RETURN", return: "RETURN",
};

export const PARTY_SCHEMA: ImportSchema = {
  entity: "party",
  label: "Firmalar",
  note: "Aynı vergi numarası veya aynı isim + ülke zaten varsa kayıt güncellenir, yenisi açılmaz.",
  fields: [
    { key: "name", label: "Firma Adı", aliases: ["firmaadi", "firma", "unvan", "cariunvan", "company", "companyname", "ad"], required: true, type: "text", example: "ABC GmbH" },
    { key: "legalName", label: "Resmi Unvan", aliases: ["resmiunvan", "legalname", "ticariunvan"], type: "text", example: "ABC Handels GmbH" },
    { key: "roles", label: "İlişki", aliases: ["iliski", "rol", "roller", "tip", "role", "type"], type: "enum", values: ROLE_VALUES, hint: "Birden fazla için virgülle ayır: Müşteri, Tedarikçi", example: "Müşteri, Tedarikçi" },
    { key: "taxNumber", label: "Vergi No", aliases: ["vergino", "verginumarasi", "vkn", "taxnumber", "vatnumber", "tckn"], type: "text", example: "1234567890" },
    { key: "taxOffice", label: "Vergi Dairesi", aliases: ["vergidairesi", "taxoffice"], type: "text", example: "Ataşehir" },
    { key: "country", label: "Ülke", aliases: ["ulke", "country", "ulkekodu"], type: "text", hint: "İki harfli kod: TR, DE, AE", example: "DE" },
    { key: "city", label: "Şehir", aliases: ["sehir", "city", "il"], type: "text", example: "Berlin" },
    { key: "address", label: "Adres", aliases: ["adres", "address"], type: "text", example: "Musterstr. 12" },
    { key: "postalCode", label: "Posta Kodu", aliases: ["postakodu", "postalcode", "zip"], type: "text", example: "10115" },
    { key: "phone", label: "Telefon", aliases: ["telefon", "phone", "tel", "gsm"], type: "text", example: "+49 30 123456" },
    { key: "email", label: "E-posta", aliases: ["eposta", "email", "mail", "epostaadresi"], type: "text", example: "info@abc.de" },
    { key: "website", label: "Web Sitesi", aliases: ["websitesi", "website", "web", "site", "url"], type: "text", example: "https://abc.de" },
    { key: "currency", label: "Para Birimi", aliases: ["parabirimi", "currency", "kur", "dovizcinsi"], type: "text", example: "EUR" },
    { key: "paymentTermDays", label: "Vade (gün)", aliases: ["vade", "vadegun", "odemevadesi", "paymentterm", "term"], type: "number", example: "60" },
    { key: "notes", label: "Not", aliases: ["not", "notlar", "aciklama", "note", "notes"], type: "text", example: "" },
  ],
};

export const ITEM_SCHEMA: ImportSchema = {
  entity: "item",
  label: "Ürünler",
  note: "SKU (stok kodu) benzersizdir; aynı SKU varsa ürün güncellenir.",
  fields: [
    { key: "sku", label: "SKU", aliases: ["sku", "stokkodu", "urunkodu", "kod", "code", "stockcode"], required: true, type: "text", example: "TSH-001" },
    { key: "name", label: "Ürün Adı", aliases: ["urunadi", "urun", "ad", "name", "productname", "aciklama"], required: true, type: "text", example: "Pamuklu T-shirt" },
    { key: "barcode", label: "Barkod", aliases: ["barkod", "barcode", "ean", "gtin"], type: "text", example: "8690000000001" },
    { key: "category", label: "Kategori", aliases: ["kategori", "category", "grup"], type: "text", example: "Tekstil" },
    { key: "brand", label: "Marka", aliases: ["marka", "brand"], type: "text", example: "AYZENITH" },
    { key: "unit", label: "Birim", aliases: ["birim", "unit", "olcu"], type: "text", example: "adet" },
    { key: "purchasePrice", label: "Alış Fiyatı", aliases: ["alisfiyati", "alis", "maliyet", "purchaseprice", "cost", "costprice"], type: "money", example: "120" },
    { key: "purchaseCurrency", label: "Alış Para Birimi", aliases: ["alisparabirimi", "alisdoviz", "purchasecurrency"], type: "text", example: "TRY" },
    { key: "salePrice", label: "Satış Fiyatı", aliases: ["satisfiyati", "satis", "fiyat", "saleprice", "price", "listprice"], type: "money", example: "199" },
    { key: "saleCurrency", label: "Satış Para Birimi", aliases: ["satisparabirimi", "satisdoviz", "salecurrency", "currency", "parabirimi"], type: "text", example: "TRY" },
    { key: "vatRate", label: "KDV %", aliases: ["kdv", "kdvorani", "vat", "vatrate", "tax"], type: "number", hint: "Sadece kayıt amaçlı; vergi hesaplanmaz.", example: "20" },
    { key: "minStock", label: "Minimum Stok", aliases: ["minimumstok", "minstok", "kritikstok", "minstock", "reorder"], type: "number", example: "10" },
    { key: "description", label: "Açıklama", aliases: ["aciklama", "description", "detay"], type: "text", example: "" },
  ],
};

export const EXPENSE_SCHEMA: ImportSchema = {
  entity: "expense",
  label: "Giderler",
  fields: [
    { key: "title", label: "Gider", aliases: ["gider", "baslik", "aciklama", "title", "description"], required: true, type: "text", example: "Ofis kirası" },
    { key: "kind", label: "Tür", aliases: ["tur", "kategori", "kind", "type"], type: "enum", values: EXPENSE_KIND_VALUES, example: "Kira" },
    { key: "amount", label: "Tutar", aliases: ["tutar", "amount", "meblag", "total"], required: true, type: "money", example: "35000" },
    { key: "currency", label: "Para Birimi", aliases: ["parabirimi", "currency", "doviz"], type: "text", example: "TRY" },
    { key: "occurredAt", label: "Tarih", aliases: ["tarih", "date", "giderTarihi"], type: "date", example: "01.08.2026" },
    { key: "dueDate", label: "Vade", aliases: ["vade", "vadetarihi", "duedate", "sonodeme"], type: "date", example: "05.08.2026" },
    { key: "partyName", label: "Firma", aliases: ["firma", "firmaadi", "tedarikci", "party", "vendor"], type: "text", hint: "Varsa mevcut firmayla eşleştirilir.", example: "" },
    { key: "note", label: "Not", aliases: ["not", "notlar", "note"], type: "text", example: "" },
  ],
};

export const STOCK_SCHEMA: ImportSchema = {
  entity: "stock",
  label: "Stok Girişi",
  note: "Mevcut stoğu sisteme taşımak için. Her satır bir stok hareketi oluşturur; mevcut miktarın üzerine EKLENİR, yerine geçmez.",
  fields: [
    { key: "sku", label: "SKU", aliases: ["sku", "stokkodu", "urunkodu", "kod", "code"], required: true, type: "text", example: "TSH-001" },
    { key: "locationName", label: "Konum", aliases: ["konum", "depo", "lokasyon", "location", "warehouse"], type: "text", hint: "Boşsa varsayılan depoya girer.", example: "Ana Depo" },
    { key: "quantity", label: "Miktar", aliases: ["miktar", "adet", "quantity", "qty", "stok"], required: true, type: "number", example: "50" },
    { key: "unitCost", label: "Birim Maliyet", aliases: ["birimmaliyet", "maliyet", "unitcost", "cost", "alisfiyati"], type: "money", hint: "Stok değerlemesi için. Boşsa ürünün alış fiyatı kullanılır.", example: "120" },
    { key: "reason", label: "Sebep", aliases: ["sebep", "neden", "reason", "tur"], type: "enum", values: STOCK_REASON_VALUES, example: "Açılış stoğu" },
    { key: "note", label: "Not", aliases: ["not", "aciklama", "note"], type: "text", example: "" },
  ],
};

export const PURCHASE_SCHEMA: ImportSchema = {
  entity: "purchase",
  label: "Alışlar",
  groupBy: "docRef",
  note: "Aynı 'Belge No' değerine sahip satırlar TEK bir alış belgesi olur. Belge No boşsa her satır ayrı belge sayılır.",
  fields: [
    { key: "docRef", label: "Belge No", aliases: ["belgeno", "fisno", "faturano", "docno", "reference", "ref"], type: "text", hint: "Çok satırlı belgeleri gruplar.", example: "FT-1001" },
    { key: "supplierName", label: "Tedarikçi", aliases: ["tedarikci", "firma", "satici", "supplier", "vendor"], required: true, type: "text", example: "ABC GmbH" },
    { key: "issuedAt", label: "Tarih", aliases: ["tarih", "date", "belgetarihi"], type: "date", example: "05.08.2026" },
    { key: "sku", label: "SKU", aliases: ["sku", "stokkodu", "urunkodu", "kod"], required: true, type: "text", example: "TSH-001" },
    { key: "quantity", label: "Miktar", aliases: ["miktar", "adet", "quantity", "qty"], required: true, type: "number", example: "50" },
    { key: "unitPrice", label: "Birim Fiyat", aliases: ["birimfiyat", "fiyat", "unitprice", "price"], required: true, type: "money", example: "120" },
    { key: "discountRate", label: "İskonto %", aliases: ["iskonto", "indirim", "discount"], type: "number", example: "0" },
    { key: "vatRate", label: "KDV %", aliases: ["kdv", "kdvorani", "vat"], type: "number", example: "20" },
    { key: "currency", label: "Para Birimi", aliases: ["parabirimi", "currency", "doviz"], type: "text", example: "EUR" },
    { key: "fxRate", label: "Kur", aliases: ["kur", "fxrate", "rate", "doviz kuru"], type: "money", hint: "1 birim para biriminin ana para birimindeki karşılığı.", example: "47.20" },
    { key: "dueDate", label: "Vade", aliases: ["vade", "vadetarihi", "duedate"], type: "date", example: "05.10.2026" },
    { key: "locationName", label: "Depo", aliases: ["depo", "konum", "location", "warehouse"], type: "text", example: "Ana Depo" },
    { key: "note", label: "Not", aliases: ["not", "aciklama", "note"], type: "text", example: "" },
  ],
};

export const SALE_SCHEMA: ImportSchema = {
  entity: "sale",
  label: "Satışlar",
  groupBy: "docRef",
  note: "Aynı 'Belge No' değerine sahip satırlar TEK bir satış belgesi olur. Stok, satış onaylandığında düşer.",
  fields: [
    { key: "docRef", label: "Belge No", aliases: ["belgeno", "siparisno", "faturano", "orderno", "docno", "ref"], type: "text", example: "SP-2001" },
    { key: "customerName", label: "Müşteri", aliases: ["musteri", "firma", "alici", "customer", "buyer"], type: "text", example: "İslam Mağazacılık" },
    { key: "channelName", label: "Satış Kanalı", aliases: ["kanal", "satiskanali", "channel", "platform", "pazaryeri"], type: "text", example: "Trendyol" },
    { key: "issuedAt", label: "Tarih", aliases: ["tarih", "date", "satistarihi"], type: "date", example: "10.08.2026" },
    { key: "sku", label: "SKU", aliases: ["sku", "stokkodu", "urunkodu", "kod"], required: true, type: "text", example: "TSH-001" },
    { key: "quantity", label: "Miktar", aliases: ["miktar", "adet", "quantity", "qty"], required: true, type: "number", example: "3" },
    { key: "unitPrice", label: "Birim Fiyat", aliases: ["birimfiyat", "fiyat", "unitprice", "price", "satisfiyati"], required: true, type: "money", example: "199" },
    { key: "discountRate", label: "İskonto %", aliases: ["iskonto", "indirim", "discount"], type: "number", example: "0" },
    { key: "vatRate", label: "KDV %", aliases: ["kdv", "kdvorani", "vat"], type: "number", example: "20" },
    { key: "currency", label: "Para Birimi", aliases: ["parabirimi", "currency", "doviz"], type: "text", example: "TRY" },
    { key: "fxRate", label: "Kur", aliases: ["kur", "fxrate", "rate"], type: "money", example: "1" },
    { key: "dueDate", label: "Vade", aliases: ["vade", "vadetarihi", "duedate"], type: "date", example: "10.09.2026" },
    { key: "locationName", label: "Depo", aliases: ["depo", "konum", "location"], type: "text", example: "Ana Depo" },
    { key: "note", label: "Not", aliases: ["not", "aciklama", "note"], type: "text", example: "" },
  ],
};

export const IMPORT_SCHEMAS: Record<string, ImportSchema> = {
  party: PARTY_SCHEMA,
  item: ITEM_SCHEMA,
  expense: EXPENSE_SCHEMA,
  stock: STOCK_SCHEMA,
  purchase: PURCHASE_SCHEMA,
  sale: SALE_SCHEMA,
};

export function schemaFor(entity: string): ImportSchema | null {
  return IMPORT_SCHEMAS[entity] ?? null;
}

/**
 * Match a spreadsheet's headers to schema fields. Exact normalised label first,
 * then the alias list, then a containment check — so "Firma Adı (zorunlu)" still
 * lands on `name`.
 */
export function autoMap(headers: string[], schema: ImportSchema): Record<number, string> {
  const mapping: Record<number, string> = {};
  const taken = new Set<string>();

  const candidates = schema.fields.map((f) => ({
    key: f.key,
    keys: new Set([normalizeHeader(f.label), normalizeHeader(f.key), ...f.aliases.map(normalizeHeader)]),
  }));

  headers.forEach((raw, index) => {
    const h = normalizeHeader(raw);
    if (!h) return;
    let hit = candidates.find((c) => !taken.has(c.key) && c.keys.has(h));
    if (!hit) {
      hit = candidates.find(
        (c) => !taken.has(c.key) && [...c.keys].some((k) => k.length >= 4 && (h.includes(k) || k.includes(h))),
      );
    }
    if (hit) {
      mapping[index] = hit.key;
      taken.add(hit.key);
    }
  });
  return mapping;
}
