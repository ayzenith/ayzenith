/**
 * AYZENITH TRADE DOCUMENT SYSTEM — compiled configuration.
 *
 * Mirrors the shape of src/config/os.ts: pure, server+client safe (no `server-
 * only`, no DB access), the single source of truth for labels, defaults and
 * locale-aware formatting so the live preview and the PDF render from exactly
 * the same numbers and words.
 *
 * LANGUAGE ≠ CURRENCY. `formatDocMoney` takes both independently — a German-
 * language document quoting USD prints "12.450,00 $", not "$12,450.00".
 */

import type { TradeDocLanguage, TradeDocType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Document types
// ---------------------------------------------------------------------------

export const DOC_TYPES: TradeDocType[] = [
  "QUOTATION",
  "PROFORMA_INVOICE",
  "COMMERCIAL_INVOICE",
  "PACKING_LIST",
];

export const DOC_PREFIX: Record<TradeDocType, string> = {
  QUOTATION: "QT",
  PROFORMA_INVOICE: "PI",
  COMMERCIAL_INVOICE: "CI",
  PACKING_LIST: "PL",
};

/** Packing lists read better wide; everything else is portrait. */
export function docOrientation(docType: TradeDocType): "portrait" | "landscape" {
  return docType === "PACKING_LIST" ? "landscape" : "portrait";
}

export const LANGUAGES: TradeDocLanguage[] = ["TR", "EN", "DE"];

export const LANGUAGE_LABELS: Record<TradeDocLanguage, string> = {
  TR: "Türkçe",
  EN: "English",
  DE: "Deutsch",
};

// ---------------------------------------------------------------------------
// Static document copy, per language
// ---------------------------------------------------------------------------

export type DocLabelKey =
  | "docTitle_QUOTATION" | "docTitle_PROFORMA_INVOICE" | "docTitle_COMMERCIAL_INVOICE" | "docTitle_PACKING_LIST"
  | "docNumberLabel_QUOTATION" | "docNumberLabel_PROFORMA_INVOICE" | "docNumberLabel_COMMERCIAL_INVOICE" | "docNumberLabel_PACKING_LIST"
  | "from" | "billTo" | "shipTo"
  | "date" | "dueDate" | "validUntil" | "page" | "of"
  | "description" | "sku" | "quantity" | "unit" | "unitPrice" | "amount"
  | "subtotal" | "discount" | "tax" | "vat" | "shipping" | "total" | "grandTotal"
  | "paymentTerms" | "deliveryTerms" | "incoterm" | "shippingMethod" | "countryOfOrigin" | "hsCode"
  | "bankDetails" | "bankName" | "accountHolder" | "iban" | "swift"
  | "notes" | "customerNote" | "paymentNote" | "deliveryNote" | "specialTerms"
  | "authorizedSignatory" | "preparedBy" | "footerLegal"
  | "packages" | "netWeight" | "grossWeight" | "dimensions"
  | "totalPackages" | "totalNetWeight" | "totalGrossWeight"
  | "draft" | "currency" | "taxNumber" | "vatNumber";

const LABELS: Record<TradeDocLanguage, Record<DocLabelKey, string>> = {
  EN: {
    docTitle_QUOTATION: "QUOTATION",
    docTitle_PROFORMA_INVOICE: "PROFORMA INVOICE",
    docTitle_COMMERCIAL_INVOICE: "COMMERCIAL INVOICE",
    docTitle_PACKING_LIST: "PACKING LIST",
    docNumberLabel_QUOTATION: "Quotation No",
    docNumberLabel_PROFORMA_INVOICE: "PI Number",
    docNumberLabel_COMMERCIAL_INVOICE: "Invoice Number",
    docNumberLabel_PACKING_LIST: "Packing List No",
    from: "From", billTo: "Bill To", shipTo: "Ship To",
    date: "Date", dueDate: "Due Date", validUntil: "Valid Until", page: "Page", of: "of",
    description: "Description", sku: "SKU", quantity: "Qty", unit: "Unit", unitPrice: "Unit Price", amount: "Amount",
    subtotal: "Subtotal", discount: "Discount", tax: "Tax", vat: "VAT", shipping: "Shipping", total: "Total", grandTotal: "Grand Total",
    paymentTerms: "Payment Terms", deliveryTerms: "Delivery Terms", incoterm: "Incoterm",
    shippingMethod: "Shipping Method", countryOfOrigin: "Country of Origin", hsCode: "HS Code",
    bankDetails: "Bank Details", bankName: "Bank Name", accountHolder: "Account Holder", iban: "IBAN", swift: "SWIFT / BIC",
    notes: "Notes", customerNote: "Customer Note", paymentNote: "Payment Note", deliveryNote: "Delivery Note", specialTerms: "Special Terms",
    authorizedSignatory: "Authorized Signatory", preparedBy: "Prepared by", footerLegal: "This document was generated electronically and is valid without a signature unless otherwise required.",
    packages: "Packages", netWeight: "Net Weight", grossWeight: "Gross Weight", dimensions: "Dimensions",
    totalPackages: "Total Packages", totalNetWeight: "Total Net Weight", totalGrossWeight: "Total Gross Weight",
    draft: "DRAFT", currency: "Currency", taxNumber: "Tax No", vatNumber: "VAT No",
  },
  TR: {
    docTitle_QUOTATION: "TEKLİF",
    docTitle_PROFORMA_INVOICE: "PROFORMA FATURA",
    docTitle_COMMERCIAL_INVOICE: "TİCARİ FATURA",
    docTitle_PACKING_LIST: "ÇEKİ LİSTESİ",
    docNumberLabel_QUOTATION: "Teklif No",
    docNumberLabel_PROFORMA_INVOICE: "Proforma No",
    docNumberLabel_COMMERCIAL_INVOICE: "Fatura No",
    docNumberLabel_PACKING_LIST: "Çeki Listesi No",
    from: "Gönderen", billTo: "Fatura Adresi", shipTo: "Teslimat Adresi",
    date: "Tarih", dueDate: "Vade Tarihi", validUntil: "Geçerlilik Tarihi", page: "Sayfa", of: "/",
    description: "Açıklama", sku: "Stok Kodu", quantity: "Miktar", unit: "Birim", unitPrice: "Birim Fiyat", amount: "Tutar",
    subtotal: "Ara Toplam", discount: "İskonto", tax: "Vergi", vat: "KDV", shipping: "Nakliye", total: "Toplam", grandTotal: "Genel Toplam",
    paymentTerms: "Ödeme Şartları", deliveryTerms: "Teslimat Şartları", incoterm: "Teslim Şekli (Incoterm)",
    shippingMethod: "Nakliye Yöntemi", countryOfOrigin: "Menşe Ülke", hsCode: "GTİP Kodu",
    bankDetails: "Banka Bilgileri", bankName: "Banka Adı", accountHolder: "Hesap Sahibi", iban: "IBAN", swift: "SWIFT / BIC",
    notes: "Notlar", customerNote: "Müşteri Notu", paymentNote: "Ödeme Notu", deliveryNote: "Teslimat Notu", specialTerms: "Özel Şartlar",
    authorizedSignatory: "Yetkili İmza", preparedBy: "Hazırlayan", footerLegal: "Bu belge elektronik olarak oluşturulmuştur ve aksi belirtilmedikçe imzasız geçerlidir.",
    packages: "Koli Adedi", netWeight: "Net Ağırlık", grossWeight: "Brüt Ağırlık", dimensions: "Ölçüler",
    totalPackages: "Toplam Koli", totalNetWeight: "Toplam Net Ağırlık", totalGrossWeight: "Toplam Brüt Ağırlık",
    draft: "TASLAK", currency: "Para Birimi", taxNumber: "Vergi No", vatNumber: "KDV No",
  },
  DE: {
    docTitle_QUOTATION: "ANGEBOT",
    docTitle_PROFORMA_INVOICE: "PROFORMA-RECHNUNG",
    docTitle_COMMERCIAL_INVOICE: "HANDELSRECHNUNG",
    docTitle_PACKING_LIST: "PACKLISTE",
    docNumberLabel_QUOTATION: "Angebotsnummer",
    docNumberLabel_PROFORMA_INVOICE: "Proforma-Nr.",
    docNumberLabel_COMMERCIAL_INVOICE: "Rechnungsnummer",
    docNumberLabel_PACKING_LIST: "Packlisten-Nr.",
    from: "Von", billTo: "Rechnungsadresse", shipTo: "Lieferadresse",
    date: "Datum", dueDate: "Fälligkeitsdatum", validUntil: "Gültig bis", page: "Seite", of: "von",
    description: "Beschreibung", sku: "Artikel-Nr.", quantity: "Menge", unit: "Einheit", unitPrice: "Einzelpreis", amount: "Betrag",
    subtotal: "Zwischensumme", discount: "Rabatt", tax: "Steuer", vat: "MwSt.", shipping: "Versand", total: "Summe", grandTotal: "Gesamtsumme",
    paymentTerms: "Zahlungsbedingungen", deliveryTerms: "Lieferbedingungen", incoterm: "Incoterm",
    shippingMethod: "Versandart", countryOfOrigin: "Ursprungsland", hsCode: "HS-Code",
    bankDetails: "Bankverbindung", bankName: "Bankname", accountHolder: "Kontoinhaber", iban: "IBAN", swift: "SWIFT / BIC",
    notes: "Hinweise", customerNote: "Kundenhinweis", paymentNote: "Zahlungshinweis", deliveryNote: "Lieferhinweis", specialTerms: "Besondere Bedingungen",
    authorizedSignatory: "Bevollmächtigter Unterzeichner", preparedBy: "Erstellt von", footerLegal: "Dieses Dokument wurde elektronisch erstellt und ist ohne Unterschrift gültig, sofern nicht anders angegeben.",
    packages: "Packstücke", netWeight: "Nettogewicht", grossWeight: "Bruttogewicht", dimensions: "Maße",
    totalPackages: "Packstücke gesamt", totalNetWeight: "Nettogewicht gesamt", totalGrossWeight: "Bruttogewicht gesamt",
    draft: "ENTWURF", currency: "Währung", taxNumber: "Steuer-Nr.", vatNumber: "USt-IdNr.",
  },
};

export function t(lang: TradeDocLanguage, key: DocLabelKey): string {
  return LABELS[lang][key];
}

export function docTitle(lang: TradeDocLanguage, docType: TradeDocType): string {
  return t(lang, `docTitle_${docType}` as DocLabelKey);
}

export function docNumberLabel(lang: TradeDocLanguage, docType: TradeDocType): string {
  return t(lang, `docNumberLabel_${docType}` as DocLabelKey);
}

// ---------------------------------------------------------------------------
// Locale-aware formatting — independent of currency
// ---------------------------------------------------------------------------

const INTL_LOCALE: Record<TradeDocLanguage, string> = { TR: "tr-TR", EN: "en-US", DE: "de-DE" };

export function docLocale(lang: TradeDocLanguage): string {
  return INTL_LOCALE[lang];
}

export function formatDocMoney(value: number | null | undefined, currency: string, lang: TradeDocLanguage, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  const n = new Intl.NumberFormat(docLocale(lang), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  const symbol = currencySymbolFor(currency);
  // English convention puts the symbol first when it's a glyph; TR/DE print the code/symbol after.
  return lang === "EN" && /^[^A-Za-z]/.test(symbol) ? `${symbol}${n}` : `${n} ${symbol}`;
}

function currencySymbolFor(code: string): string {
  const map: Record<string, string> = { TRY: "₺", EUR: "€", USD: "$", GBP: "£", CHF: "CHF", AED: "AED", SAR: "SAR", RUB: "₽", CNY: "¥", PLN: "zł" };
  return map[code] ?? code;
}

export function formatDocDate(d: Date | string | null | undefined, lang: TradeDocLanguage): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  if (lang === "EN") {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat(docLocale(lang), { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatDocNumber(value: number | null | undefined, lang: TradeDocLanguage, decimals = 3): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(docLocale(lang), { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value);
}

export function formatDocPercent(value: number | null | undefined, lang: TradeDocLanguage): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat(docLocale(lang), { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)}%`;
}

// ---------------------------------------------------------------------------
// Compiled defaults — used until an admin fills in Settings → Company Profile
// ---------------------------------------------------------------------------

export const DEFAULT_COMPANY_PROFILE = {
  companyLegalName: "AYZENITH",
  companyTradingName: "AYZENITH",
  companyAddress: "Ataköy, İstanbul",
  companyCountry: "Türkiye",
  companyCity: "İstanbul",
  companyPostalCode: null as string | null,
  companyPhone: "+90 541 437 19 07",
  companyEmail: "info@ayzenith.com",
  companyWebsite: "ayzenith.com",
  companyTaxNumber: null as string | null,
  companyVatNumber: null as string | null,
  companyChamberReg: null as string | null,
  companyLogoUrl: null as string | null,
  defaultDocLanguage: "EN" as TradeDocLanguage,
  defaultDocFooterNote: null as string | null,
};

export const DEFAULT_SIGNATORY = {
  firstName: "Ayaz",
  lastName: "Kaya",
  jobTitle: "CEO & Founder",
  email: "info@ayzenith.com",
  phone: "+90 541 437 19 07",
};

export const COMPANY_TAGLINE = "International Trade & Market Intelligence";

/** Common Incoterms 2020, offered as suggestions in the document editor. */
export const INCOTERMS = ["EXW", "FCA", "FOB", "FAS", "CPT", "CIP", "CFR", "CIF", "DAP", "DPU", "DDP"];
