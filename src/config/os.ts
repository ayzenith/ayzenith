/**
 * AYZENITH BUSINESS OS — compiled configuration.
 *
 * Turkish labels for every enum, the currency table, and the cash-flow buckets.
 * This module is imported by both server and client code, so it must stay free
 * of `server-only` imports and of any database access.
 */

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const PARTY_ROLE_LABELS: Record<string, string> = {
  CUSTOMER: "Müşteri",
  SUPPLIER: "Tedarikçi",
  DEALER: "Bayi",
  DISTRIBUTOR: "Distribütör",
  STORE: "Mağaza",
  PARTNER: "İş ortağı",
  CARRIER: "Nakliyeci",
  SERVICE_PROVIDER: "Hizmet sağlayıcı",
  OTHER: "Diğer",
};

export const PARTY_ROLE_ORDER = [
  "CUSTOMER",
  "SUPPLIER",
  "DEALER",
  "DISTRIBUTOR",
  "STORE",
  "PARTNER",
  "CARRIER",
  "SERVICE_PROVIDER",
  "OTHER",
] as const;

export const TRADE_MODEL_LABELS: Record<string, string> = {
  WHOLESALE: "Toptan",
  RETAIL: "Perakende",
  DROPSHIP: "Stoksuz satış",
  CONSIGNMENT: "Konsinye",
  MARKETPLACE: "Pazaryeri",
  AGENCY: "Acente / komisyon",
  OTHER: "Diğer",
};

export const RELATION_STATUS_LABELS: Record<string, string> = {
  PROSPECT: "Görüşülüyor",
  ACTIVE: "Aktif",
  PAUSED: "Duraklatıldı",
  ENDED: "Sona erdi",
};

export const CHANNEL_TYPE_LABELS: Record<string, string> = {
  MARKETPLACE: "Pazaryeri",
  OWN_WEBSITE: "Kendi web sitesi",
  PHYSICAL_STORE: "Fiziksel mağaza",
  B2B: "B2B",
  DEALER: "Bayi",
  DISTRIBUTOR: "Distribütör",
  MANUAL: "Manuel satış",
  OTHER: "Diğer",
};

export const STOCK_LOCATION_TYPE_LABELS: Record<string, string> = {
  WAREHOUSE: "Depo",
  STORE: "Mağaza",
  CHANNEL: "Kanal deposu",
  CONSIGNMENT: "Konsinye",
  TRANSIT: "Yolda",
  OTHER: "Diğer",
};

export const STOCK_REASON_LABELS: Record<string, string> = {
  OPENING: "Açılış stoğu",
  PURCHASE: "Alış",
  SALE: "Satış",
  TRANSFER: "Transfer",
  RETURN: "İade",
  ADJUSTMENT: "Düzeltme",
  DAMAGE: "Fire / hasar",
};

export const DOC_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  CONFIRMED: "Onaylı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Bekliyor",
  PARTIAL: "Kısmen ödendi",
  PAID: "Ödendi",
  CANCELLED: "İptal",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "Havale / EFT",
  CASH: "Nakit",
  CARD: "Kart",
  CHEQUE: "Çek / senet",
  LETTER_OF_CREDIT: "Akreditif",
  PLATFORM: "Platform ödemesi",
  OTHER: "Diğer",
};

export const COST_KIND_LABELS: Record<string, string> = {
  FREIGHT: "Nakliye",
  CUSTOMS: "Gümrük",
  COMMISSION: "Komisyon",
  PACKAGING: "Ambalaj",
  INSURANCE: "Sigorta",
  BANK: "Banka",
  MARKETING: "Reklam",
  OTHER: "Diğer",
};

export const COST_ALLOCATION_LABELS: Record<string, string> = {
  BY_VALUE: "Tutara göre dağıt",
  BY_QUANTITY: "Adede göre dağıt",
  NONE: "Dağıtma",
};

export const EXPENSE_KIND_LABELS: Record<string, string> = {
  RENT: "Kira",
  SALARY: "Maaş",
  SOFTWARE: "Yazılım / abonelik",
  UTILITIES: "Elektrik / su / internet",
  ACCOUNTING: "Muhasebe",
  MARKETING: "Reklam",
  BANK: "Banka",
  LOGISTICS: "Lojistik",
  TRAVEL: "Seyahat",
  TAX: "Vergi",
  OTHER: "Diğer",
};

export const RECURRENCE_LABELS: Record<string, string> = {
  WEEKLY: "Haftalık",
  MONTHLY: "Aylık",
  QUARTERLY: "3 aylık",
  YEARLY: "Yıllık",
};

export const TAX_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planlandı",
  DUE: "Vadesi geldi",
  PAID: "Ödendi",
  CANCELLED: "İptal",
};

/** Common Turkish obligations, offered as suggestions — never as a calculation. */
export const TAX_KIND_SUGGESTIONS = [
  "KDV",
  "Geçici Vergi",
  "Gelir Vergisi",
  "Kurumlar Vergisi",
  "Muhtasar / Stopaj",
  "SGK Primi",
  "Damga Vergisi",
  "Gümrük Vergisi",
  "Diğer",
];

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

export type CurrencyMeta = { code: string; symbol: string; label: string };

export const CURRENCIES: CurrencyMeta[] = [
  { code: "TRY", symbol: "₺", label: "Türk Lirası" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "USD", symbol: "$", label: "ABD Doları" },
  { code: "GBP", symbol: "£", label: "İngiliz Sterlini" },
  { code: "CHF", symbol: "CHF", label: "İsviçre Frangı" },
  { code: "AED", symbol: "AED", label: "BAE Dirhemi" },
  { code: "SAR", symbol: "SAR", label: "Suudi Riyali" },
  { code: "RUB", symbol: "₽", label: "Rus Rublesi" },
  { code: "CNY", symbol: "¥", label: "Çin Yuanı" },
  { code: "PLN", symbol: "zł", label: "Polonya Zlotisi" },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

export const DEFAULT_BASE_CURRENCY = "TRY";

/**
 * Format money for display.
 *
 * Deliberately NOT `Intl.NumberFormat(..., { style: "currency" })`: that renders
 * TRY as "₺1.234,56" but USD as "$1.234,56" in the tr locale, which reads
 * ambiguously in a multi-currency table. We always print the code-derived symbol
 * after a plain grouped number, so 10.000,00 € and 10.000,00 ₺ line up.
 */
export function formatMoney(
  value: number | null | undefined,
  currency = DEFAULT_BASE_CURRENCY,
  opts: { decimals?: number; sign?: boolean } = {},
): string {
  if (value == null || Number.isNaN(value)) return "—";
  const decimals = opts.decimals ?? 2;
  const n = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));
  const prefix = value < 0 ? "−" : opts.sign && value > 0 ? "+" : "";
  return `${prefix}${n} ${currencySymbol(currency)}`;
}

export function formatQty(value: number | null | undefined, unit?: string | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const n = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
  return unit ? `${n} ${unit}` : n;
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `%${new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)}`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

// ---------------------------------------------------------------------------
// Cash-flow buckets
// ---------------------------------------------------------------------------

/**
 * The finance calendar the owner asked for. `overdue` is first on purpose: money
 * that was already due outranks money that is merely coming.
 */
export const CASHFLOW_BUCKETS = [
  { key: "overdue", label: "Gecikmiş", fromDays: null, toDays: 0 },
  { key: "d30", label: "30 gün", fromDays: 0, toDays: 30 },
  { key: "m1_6", label: "1–6 ay", fromDays: 30, toDays: 183 },
  { key: "m6_12", label: "6–12 ay", fromDays: 183, toDays: 365 },
  { key: "m12p", label: "12+ ay", fromDays: 365, toDays: null },
] as const;

export type CashflowBucketKey = (typeof CASHFLOW_BUCKETS)[number]["key"];

/** Units a traded good can be counted in. Free text is still allowed. */
export const UNITS = ["adet", "kg", "lt", "m", "m²", "m³", "paket", "koli", "palet", "set"];

/** Default document code prefixes. */
export const DOC_PREFIX = { PURCHASE: "ALS", SALE: "SAT" } as const;
