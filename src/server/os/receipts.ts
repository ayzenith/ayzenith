import "server-only";

import { db } from "@/lib/db";
import { toNum } from "./money";
import { getOsSettings } from "./settings";
import { getDefaultSignatory } from "./signatories";

/**
 * Simple, no-persistence receipt/voucher documents for Payments, Expenses and
 * Tax records — deliberately lighter than the Trade Document System (no
 * drafts, no versions, no overrides): these read the live transaction row and
 * render straight to PDF. The "receipt number" is derived from the row's own
 * id + date rather than a counter, so re-printing the same payment always
 * shows the same number without a persisted document row to keep in sync.
 */

export type ReceiptData = {
  kind: "payment" | "expense" | "tax";
  title: string; // "TAHSİLAT MAKBUZU" | "ÖDEME MAKBUZU" | "GİDER FİŞİ" | "VERGİ KAYDI"
  receiptNo: string;
  date: Date;
  partyName: string | null;
  description: string; // what this money relates to
  amount: number;
  currency: string;
  method: string | null;
  status: string;
  note: string | null;
  company: Awaited<ReturnType<typeof getOsSettings>>["company"];
  signatory: { name: string; title: string | null; signatureUrl: string | null } | null;
};

function receiptNo(prefix: string, id: string, date: Date): string {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${stamp}-${id.slice(-6).toUpperCase()}`;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "Havale / EFT", CASH: "Nakit", CARD: "Kart", CHEQUE: "Çek / senet",
  LETTER_OF_CREDIT: "Akreditif", PLATFORM: "Platform ödemesi", OTHER: "Diğer",
};
const PAYMENT_STATUS_LABELS: Record<string, string> = { PENDING: "Bekliyor", PARTIAL: "Kısmen ödendi", PAID: "Ödendi", CANCELLED: "İptal" };
const EXPENSE_KIND_LABELS: Record<string, string> = {
  RENT: "Kira", SALARY: "Maaş", SOFTWARE: "Yazılım / abonelik", UTILITIES: "Elektrik / su / internet",
  ACCOUNTING: "Muhasebe", MARKETING: "Reklam", BANK: "Banka", LOGISTICS: "Lojistik", TRAVEL: "Seyahat", TAX: "Vergi", OTHER: "Diğer",
};
const TAX_STATUS_LABELS: Record<string, string> = { PLANNED: "Planlandı", DUE: "Vadesi geldi", PAID: "Ödendi", CANCELLED: "İptal" };

async function shared() {
  const [settings, signatory] = await Promise.all([getOsSettings(), getDefaultSignatory()]);
  return {
    company: settings.company,
    signatory: signatory
      ? { name: [signatory.firstName, signatory.lastName].filter(Boolean).join(" "), title: signatory.jobTitle, signatureUrl: signatory.signatureUrl }
      : null,
  };
}

export async function getPaymentReceipt(id: string): Promise<ReceiptData | null> {
  const p = await db.payment.findUnique({
    where: { id },
    include: {
      party: { select: { name: true } },
      sale: { select: { code: true } },
      purchase: { select: { code: true } },
      expense: { select: { title: true } },
      taxRecord: { select: { kind: true, period: true } },
    },
  });
  if (!p) return null;
  const { company, signatory } = await shared();
  const docCode = p.sale?.code ?? p.purchase?.code ?? p.expense?.title ?? (p.taxRecord ? `${p.taxRecord.kind} ${p.taxRecord.period}` : null);
  const date = p.paidAt ?? p.dueDate;
  return {
    kind: "payment",
    title: p.direction === "IN" ? "TAHSİLAT MAKBUZU" : "ÖDEME MAKBUZU",
    receiptNo: receiptNo(p.direction === "IN" ? "TAH" : "ODM", p.id, date),
    date,
    partyName: p.party?.name ?? null,
    description: docCode ?? (p.note || "—"),
    amount: toNum(p.paidAmount) || toNum(p.amount),
    currency: p.currency,
    method: p.method ? (PAYMENT_METHOD_LABELS[p.method] ?? p.method) : null,
    status: PAYMENT_STATUS_LABELS[p.status] ?? p.status,
    note: p.note,
    company, signatory,
  };
}

export async function getExpenseReceipt(id: string): Promise<ReceiptData | null> {
  const e = await db.expense.findUnique({ where: { id }, include: { party: { select: { name: true } } } });
  if (!e) return null;
  const { company, signatory } = await shared();
  return {
    kind: "expense",
    title: "GİDER FİŞİ",
    receiptNo: receiptNo("GID", e.id, e.occurredAt),
    date: e.occurredAt,
    partyName: e.party?.name ?? null,
    description: `${e.title} — ${EXPENSE_KIND_LABELS[e.kind] ?? e.kind}`,
    amount: toNum(e.amount),
    currency: e.currency,
    method: null,
    status: EXPENSE_KIND_LABELS[e.kind] ?? e.kind,
    note: e.note,
    company, signatory,
  };
}

export async function getTaxReceipt(id: string): Promise<ReceiptData | null> {
  const t = await db.taxRecord.findUnique({ where: { id } });
  if (!t) return null;
  const { company, signatory } = await shared();
  return {
    kind: "tax",
    title: "VERGİ KAYDI",
    receiptNo: receiptNo("VRG", t.id, t.dueDate),
    date: t.dueDate,
    partyName: null,
    description: `${t.kind} — ${t.period}`,
    amount: toNum(t.amount ?? 0),
    currency: t.currency,
    method: null,
    status: TAX_STATUS_LABELS[t.status] ?? t.status,
    note: t.note,
    company, signatory,
  };
}
