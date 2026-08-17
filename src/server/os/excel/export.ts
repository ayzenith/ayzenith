import "server-only";

import { db } from "@/lib/db";
import {
  CHANNEL_TYPE_LABELS, COST_KIND_LABELS, DOC_STATUS_LABELS, EXPENSE_KIND_LABELS,
  PARTY_ROLE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS,
  STOCK_LOCATION_TYPE_LABELS, STOCK_REASON_LABELS, TAX_STATUS_LABELS, TRADE_MODEL_LABELS,
} from "@/config/os";
import { toNum, toNumOrNull } from "../money";
import { getOsSettings } from "../settings";
import { listParties, partyStats } from "../parties";
import { listItems } from "../items";
import { listChannels } from "../channels";
import { listMovements } from "../inventory";
import { listPurchases } from "../purchases";
import { listSales } from "../sales";
import { listPayments, listExpenses, listTaxRecords } from "../finance";
import {
  cashflowReport, channelReport, customerReport, profitByItem,
  purchaseReport, salesReport, stockReport, supplierReport, type ReportFilter,
} from "../reports";
import { addSheet, addSummarySheet, createWorkbook, fileName, toBuffer } from "./workbook";

/**
 * AYZENITH BUSINESS OS — Excel export.
 *
 * Every list screen and every report exports through this module, reusing the
 * SAME read functions the screens use. That is the point: a spreadsheet built
 * from its own private query would eventually disagree with the page it was
 * exported from, and the owner would have no way to tell which one was lying.
 *
 * Reports get two sheets — "Özet" then the data — because the first question
 * asked of a profit report is the total, and it should not require scrolling to
 * the bottom of 4.000 rows.
 */

export type ExportResult = { buffer: Buffer; filename: string };

const LARGE = 5000; // a hard ceiling, so an export can never try to page forever

// ---------------------------------------------------------------------------
// List exports
// ---------------------------------------------------------------------------

export async function exportParties(filter: { search?: string; role?: string; country?: string } = {}): Promise<ExportResult> {
  const { rows } = await listParties({
    search: filter.search,
    role: filter.role as never,
    country: filter.country,
    perPage: LARGE,
  });
  const ids = rows.map((r) => r.id);
  const [full, stats] = await Promise.all([
    db.party.findMany({
      where: { id: { in: ids } },
      include: { relations: true, contacts: { orderBy: { isPrimary: "desc" } } },
    }),
    partyStats(ids),
  ]);
  const byId = new Map(full.map((f) => [f.id, f]));
  const ordered = ids.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));

  const wb = createWorkbook();
  addSheet(wb, "Firmalar", [
    { header: "Firma Adı", key: "name", width: 32, value: (p) => p.name },
    { header: "Resmi Unvan", key: "legal", width: 30, value: (p) => p.legalName ?? "" },
    { header: "İlişki", key: "roles", width: 28, value: (p) => p.relations.map((r) => PARTY_ROLE_LABELS[r.role] ?? r.role).join(", ") },
    { header: "Ticari Model", key: "model", width: 18, value: (p) => p.relations.map((r) => (r.tradeModel ? TRADE_MODEL_LABELS[r.tradeModel] : "")).filter(Boolean).join(", ") },
    { header: "Ülke", key: "country", width: 8, value: (p) => p.country },
    { header: "Şehir", key: "city", width: 16, value: (p) => p.city ?? "" },
    { header: "Adres", key: "address", width: 34, value: (p) => p.address ?? "" },
    { header: "Vergi No", key: "tax", width: 16, value: (p) => p.taxNumber ?? "" },
    { header: "Vergi Dairesi", key: "taxoffice", width: 16, value: (p) => p.taxOffice ?? "" },
    { header: "Telefon", key: "phone", width: 18, value: (p) => p.phone ?? "" },
    { header: "E-posta", key: "email", width: 26, value: (p) => p.email ?? "" },
    { header: "Web", key: "web", width: 26, value: (p) => p.website ?? "" },
    { header: "Para Birimi", key: "cur", width: 12, value: (p) => p.currency },
    { header: "Vade (gün)", key: "term", width: 11, type: "number", value: (p) => p.paymentTermDays ?? null },
    { header: "Toplam Satış", key: "sales", width: 16, type: "money", value: (p) => stats.get(p.id)?.salesTotal ?? 0 },
    { header: "Toplam Kâr", key: "profit", width: 16, type: "money", value: (p) => stats.get(p.id)?.profitTotal ?? 0 },
    { header: "Toplam Alış", key: "purch", width: 16, type: "money", value: (p) => stats.get(p.id)?.purchaseTotal ?? 0 },
    { header: "Açık Alacak", key: "recv", width: 16, type: "money", value: (p) => stats.get(p.id)?.openReceivable ?? 0 },
    { header: "Açık Borç", key: "pay", width: 16, type: "money", value: (p) => stats.get(p.id)?.openPayable ?? 0 },
    { header: "Durum", key: "status", width: 10, value: (p) => (p.active ? "Aktif" : "Pasif") },
    { header: "Lead Finder Kaynağı", key: "lead", width: 18, value: (p) => (p.leadCompanyId ? "Evet" : "") },
    { header: "Not", key: "notes", width: 34, value: (p) => p.notes ?? "" },
  ], ordered);

  addSheet(wb, "Kişiler", [
    { header: "Firma", key: "party", width: 30, value: (c: { partyName: string; firstName: string; lastName: string | null; title: string | null; email: string | null; phone: string | null; isPrimary: boolean }) => c.partyName },
    { header: "Ad", key: "first", width: 18, value: (c) => c.firstName },
    { header: "Soyad", key: "last", width: 18, value: (c) => c.lastName ?? "" },
    { header: "Görev", key: "title", width: 22, value: (c) => c.title ?? "" },
    { header: "E-posta", key: "email", width: 26, value: (c) => c.email ?? "" },
    { header: "Telefon", key: "phone", width: 18, value: (c) => c.phone ?? "" },
    { header: "Birincil", key: "primary", width: 10, value: (c) => (c.isPrimary ? "Evet" : "") },
  ], ordered.flatMap((p) => p.contacts.map((c) => ({ ...c, partyName: p.name }))));

  return { buffer: await toBuffer(wb), filename: fileName("Firmalar") };
}

export async function exportItems(filter: { search?: string; category?: string } = {}): Promise<ExportResult> {
  const { rows } = await listItems({ search: filter.search, category: filter.category, perPage: LARGE });
  const prices = await db.itemChannelPrice.findMany({
    where: { itemId: { in: rows.map((r) => r.id) } },
    include: { channel: { select: { name: true } }, item: { select: { sku: true, name: true } } },
  });

  const wb = createWorkbook();
  addSheet(wb, "Ürünler", [
    { header: "SKU", key: "sku", width: 16, value: (i) => i.sku },
    { header: "Ürün Adı", key: "name", width: 34, value: (i) => i.name },
    { header: "Kategori", key: "cat", width: 18, value: (i) => i.category ?? "" },
    { header: "Marka", key: "brand", width: 16, value: (i) => i.brand ?? "" },
    { header: "Birim", key: "unit", width: 10, value: (i) => i.unit },
    { header: "Stok", key: "stock", width: 12, type: "qty", value: (i) => i.onHand },
    { header: "Min. Stok", key: "min", width: 11, type: "qty", value: (i) => i.minStock },
    { header: "Gerçek Maliyet", key: "avg", width: 15, type: "money", value: (i) => i.avgCost },
    { header: "Alış Fiyatı", key: "buy", width: 14, type: "money", value: (i) => i.purchasePrice },
    { header: "Alış PB", key: "buycur", width: 10, value: (i) => i.purchaseCurrency },
    { header: "Satış Fiyatı", key: "sell", width: 14, type: "money", value: (i) => i.salePrice },
    { header: "Satış PB", key: "sellcur", width: 10, value: (i) => i.saleCurrency },
    { header: "Marj %", key: "margin", width: 10, type: "percent", value: (i) => i.marginPct },
    { header: "Satılan Adet", key: "sold", width: 13, type: "qty", value: (i) => i.soldQty },
    { header: "Durum", key: "status", width: 10, value: (i) => (i.active ? "Aktif" : "Pasif") },
  ], rows);

  addSheet(wb, "Kanal Fiyatları", [
    { header: "SKU", key: "sku", width: 16, value: (p) => p.item.sku },
    { header: "Ürün", key: "name", width: 30, value: (p) => p.item.name },
    { header: "Kanal", key: "ch", width: 22, value: (p) => p.channel.name },
    { header: "Fiyat", key: "price", width: 14, type: "money", value: (p) => toNum(p.price) },
    { header: "Para Birimi", key: "cur", width: 12, value: (p) => p.currency },
    { header: "Aktif", key: "active", width: 10, value: (p) => (p.active ? "Evet" : "Hayır") },
  ], prices);

  return { buffer: await toBuffer(wb), filename: fileName("Urunler") };
}

export async function exportStock(): Promise<ExportResult> {
  const [{ rows, totalValue }, byLocation, settings] = await Promise.all([
    stockReport(),
    db.stockMovement.groupBy({
      by: ["locationId", "itemId"],
      _sum: { quantity: true },
    }),
    getOsSettings(),
  ]);
  const [locations, items] = await Promise.all([
    db.stockLocation.findMany({ select: { id: true, name: true, type: true } }),
    db.item.findMany({ select: { id: true, sku: true, name: true, unit: true } }),
  ]);
  const locName = new Map(locations.map((l) => [l.id, l]));
  const itemById = new Map(items.map((i) => [i.id, i]));

  const wb = createWorkbook();
  addSummarySheet(wb, "Stok Raporu", [
    { label: "Toplam stok değeri", value: totalValue },
    { label: "Para birimi", value: settings.baseCurrency },
    { label: "Ürün sayısı", value: rows.length },
    { label: "Düşük stoklu ürün", value: rows.filter((r) => r.low).length },
    { label: "Rapor tarihi", value: new Date() },
  ]);
  addSheet(wb, "Stok", [
    { header: "SKU", key: "sku", width: 16, value: (r) => r.sku },
    { header: "Ürün", key: "name", width: 34, value: (r) => r.name },
    { header: "Kategori", key: "cat", width: 18, value: (r) => r.category ?? "" },
    { header: "Birim", key: "unit", width: 10, value: (r) => r.unit },
    { header: "Mevcut", key: "onhand", width: 12, type: "qty", value: (r) => r.onHand },
    { header: "Min. Stok", key: "min", width: 11, type: "qty", value: (r) => r.minStock },
    { header: "Ortalama Maliyet", key: "avg", width: 16, type: "money", value: (r) => r.avgCost },
    { header: "Stok Değeri", key: "value", width: 16, type: "money", value: (r) => r.value },
    { header: "Düşük mü?", key: "low", width: 11, value: (r) => (r.low ? "EVET" : "") },
  ], rows);

  addSheet(wb, "Konum Dağılımı", [
    { header: "Konum", key: "loc", width: 24, value: (r: (typeof byLocation)[number]) => locName.get(r.locationId)?.name ?? "" },
    { header: "Konum Tipi", key: "type", width: 16, value: (r) => {
      const t = locName.get(r.locationId)?.type;
      return t ? (STOCK_LOCATION_TYPE_LABELS[t] ?? t) : "";
    } },
    { header: "SKU", key: "sku", width: 16, value: (r) => itemById.get(r.itemId)?.sku ?? "" },
    { header: "Ürün", key: "item", width: 30, value: (r) => itemById.get(r.itemId)?.name ?? "" },
    { header: "Miktar", key: "qty", width: 12, type: "qty", value: (r) => toNum(r._sum.quantity) },
  ], byLocation.filter((r) => toNum(r._sum.quantity) !== 0));

  return { buffer: await toBuffer(wb), filename: fileName("Stok") };
}

export async function exportMovements(itemId?: string): Promise<ExportResult> {
  const { rows } = await listMovements({ itemId, perPage: LARGE });
  const wb = createWorkbook();
  addSheet(wb, "Stok Hareketleri", [
    { header: "Tarih", key: "date", width: 14, type: "date", value: (m) => m.occurredAt },
    { header: "SKU", key: "sku", width: 16, value: (m) => m.item.sku },
    { header: "Ürün", key: "item", width: 30, value: (m) => m.item.name },
    { header: "Konum", key: "loc", width: 22, value: (m) => m.location.name },
    { header: "Sebep", key: "reason", width: 16, value: (m) => STOCK_REASON_LABELS[m.reason] ?? m.reason },
    { header: "Miktar", key: "qty", width: 12, type: "qty", value: (m) => m.quantity },
    { header: "Birim Maliyet", key: "cost", width: 15, type: "money", value: (m) => m.unitCost },
    { header: "Belge", key: "doc", width: 18, value: (m) => m.docCode ?? "" },
    { header: "Not", key: "note", width: 30, value: (m) => m.note ?? "" },
  ], rows);
  return { buffer: await toBuffer(wb), filename: fileName("Stok-Hareketleri") };
}

export async function exportChannels(): Promise<ExportResult> {
  const rows = await listChannels();
  const wb = createWorkbook();
  addSheet(wb, "Satış Kanalları", [
    { header: "Kanal", key: "name", width: 24, value: (c) => c.name },
    { header: "Tip", key: "type", width: 18, value: (c) => CHANNEL_TYPE_LABELS[c.type] ?? c.type },
    { header: "Komisyon %", key: "com", width: 12, type: "percent", value: (c) => c.commissionRate },
    { header: "Para Birimi", key: "cur", width: 12, value: (c) => c.currency },
    { header: "Bağlı Firma", key: "party", width: 26, value: (c) => c.partyName ?? "" },
    { header: "Satış Adedi", key: "cnt", width: 12, type: "number", value: (c) => c.salesCount },
    { header: "Ciro", key: "rev", width: 16, type: "money", value: (c) => c.revenue },
    { header: "Komisyon Gideri", key: "comcost", width: 16, type: "money", value: (c) => c.commissionCost },
    { header: "Kâr", key: "profit", width: 16, type: "money", value: (c) => c.profit },
    { header: "Durum", key: "status", width: 10, value: (c) => (c.active ? "Aktif" : "Pasif") },
  ], rows);
  return { buffer: await toBuffer(wb), filename: fileName("Satis-Kanallari") };
}

export async function exportPurchases(filter: { from?: Date; to?: Date; supplierId?: string } = {}): Promise<ExportResult> {
  const { rows } = await listPurchases({ ...filter, perPage: LARGE });
  const lines = await db.purchaseLine.findMany({
    where: { purchaseId: { in: rows.map((r) => r.id) } },
    include: { item: { select: { sku: true, name: true, unit: true } }, purchase: { select: { code: true, currency: true } } },
  });
  const costs = await db.costLine.findMany({
    where: { purchaseId: { in: rows.map((r) => r.id) } },
    include: { purchase: { select: { code: true } } },
  });

  const wb = createWorkbook();
  addSheet(wb, "Alışlar", [
    { header: "Belge No", key: "code", width: 16, value: (p) => p.code },
    { header: "Tarih", key: "date", width: 13, type: "date", value: (p) => p.issuedAt },
    { header: "Tedarikçi", key: "sup", width: 30, value: (p) => p.supplierName },
    { header: "Depo", key: "loc", width: 20, value: (p) => p.locationName ?? "" },
    { header: "Para Birimi", key: "cur", width: 12, value: (p) => p.currency },
    { header: "Mal Bedeli", key: "sub", width: 16, type: "money", value: (p) => p.subtotal },
    { header: "Ek Maliyetler", key: "cost", width: 16, type: "money", value: (p) => p.costTotal },
    { header: "Toplam", key: "total", width: 16, type: "money", value: (p) => p.total },
    { header: "Toplam (ana PB)", key: "base", width: 18, type: "money", value: (p) => p.baseTotal },
    { header: "Vade", key: "due", width: 13, type: "date", value: (p) => p.dueDate },
    { header: "Durum", key: "status", width: 12, value: (p) => DOC_STATUS_LABELS[p.status] ?? p.status },
  ], rows);

  addSheet(wb, "Satırlar", [
    { header: "Belge No", key: "code", width: 16, value: (l) => l.purchase.code },
    { header: "SKU", key: "sku", width: 16, value: (l) => l.item.sku },
    { header: "Ürün", key: "item", width: 30, value: (l) => l.item.name },
    { header: "Miktar", key: "qty", width: 12, type: "qty", value: (l) => toNum(l.quantity) },
    { header: "Birim", key: "unit", width: 10, value: (l) => l.item.unit },
    { header: "Birim Fiyat", key: "price", width: 14, type: "money", value: (l) => toNum(l.unitPrice) },
    { header: "İskonto %", key: "disc", width: 11, type: "percent", value: (l) => toNum(l.discountRate) },
    { header: "KDV %", key: "vat", width: 9, type: "percent", value: (l) => toNum(l.vatRate) },
    { header: "Satır Toplamı", key: "total", width: 15, type: "money", value: (l) => toNum(l.lineTotal) },
    { header: "Gerçek Birim Maliyet", key: "landed", width: 20, type: "money", value: (l) => toNumOrNull(l.landedUnitCost) },
  ], lines);

  addSheet(wb, "Ek Maliyetler", [
    { header: "Belge No", key: "code", width: 16, value: (c) => c.purchase?.code ?? "" },
    { header: "Tür", key: "kind", width: 16, value: (c) => COST_KIND_LABELS[c.kind] ?? c.kind },
    { header: "Açıklama", key: "label", width: 26, value: (c) => c.label ?? "" },
    { header: "Tutar", key: "amount", width: 14, type: "money", value: (c) => toNum(c.amount) },
    { header: "Para Birimi", key: "cur", width: 12, value: (c) => c.currency },
    { header: "Kur", key: "fx", width: 12, type: "money", value: (c) => toNum(c.fxRate) },
  ], costs);

  return { buffer: await toBuffer(wb), filename: fileName("Alislar") };
}

export async function exportSales(filter: { from?: Date; to?: Date; customerId?: string; channelId?: string } = {}): Promise<ExportResult> {
  const { rows } = await listSales({ ...filter, perPage: LARGE });
  const lines = await db.saleLine.findMany({
    where: { saleId: { in: rows.map((r) => r.id) } },
    include: { item: { select: { sku: true, name: true, unit: true } }, sale: { select: { code: true } } },
  });

  const wb = createWorkbook();
  addSheet(wb, "Satışlar", [
    { header: "Belge No", key: "code", width: 16, value: (s) => s.code },
    { header: "Tarih", key: "date", width: 13, type: "date", value: (s) => s.issuedAt },
    { header: "Müşteri", key: "cust", width: 30, value: (s) => s.customerName ?? "" },
    { header: "Kanal", key: "ch", width: 20, value: (s) => s.channelName ?? "" },
    { header: "Model", key: "model", width: 16, value: (s) => (s.tradeModel ? TRADE_MODEL_LABELS[s.tradeModel] ?? s.tradeModel : "") },
    { header: "Para Birimi", key: "cur", width: 12, value: (s) => s.currency },
    { header: "Tutar", key: "total", width: 16, type: "money", value: (s) => s.total },
    { header: "Ciro (ana PB)", key: "base", width: 16, type: "money", value: (s) => s.baseRevenue },
    { header: "Maliyet", key: "cogs", width: 16, type: "money", value: (s) => s.cogsTotal },
    { header: "Doğrudan Gider", key: "cost", width: 16, type: "money", value: (s) => s.costTotal },
    { header: "Kâr", key: "profit", width: 16, type: "money", value: (s) => s.profit },
    { header: "Marj %", key: "margin", width: 10, type: "percent", value: (s) => s.marginPct },
    { header: "Vade", key: "due", width: 13, type: "date", value: (s) => s.dueDate },
    { header: "Durum", key: "status", width: 12, value: (s) => DOC_STATUS_LABELS[s.status] ?? s.status },
  ], rows);

  addSheet(wb, "Satırlar", [
    { header: "Belge No", key: "code", width: 16, value: (l) => l.sale.code },
    { header: "SKU", key: "sku", width: 16, value: (l) => l.item.sku },
    { header: "Ürün", key: "item", width: 30, value: (l) => l.item.name },
    { header: "Miktar", key: "qty", width: 12, type: "qty", value: (l) => toNum(l.quantity) },
    { header: "Birim", key: "unit", width: 10, value: (l) => l.item.unit },
    { header: "Birim Fiyat", key: "price", width: 14, type: "money", value: (l) => toNum(l.unitPrice) },
    { header: "İskonto %", key: "disc", width: 11, type: "percent", value: (l) => toNum(l.discountRate) },
    { header: "Satır Toplamı", key: "total", width: 15, type: "money", value: (l) => toNum(l.lineTotal) },
    { header: "Birim Maliyet", key: "cost", width: 15, type: "money", value: (l) => toNumOrNull(l.unitCost) },
    { header: "Satır Kârı", key: "profit", width: 15, type: "money", value: (l) => toNum(l.profit) },
  ], lines);

  return { buffer: await toBuffer(wb), filename: fileName("Satislar") };
}

export async function exportPayments(filter: { direction?: "IN" | "OUT"; overdueOnly?: boolean } = {}): Promise<ExportResult> {
  const { rows, openTotal } = await listPayments({ ...filter, perPage: LARGE });
  const settings = await getOsSettings();
  const label = filter.direction === "IN" ? "Tahsilatlar" : filter.direction === "OUT" ? "Ödemeler" : "Odemeler-Tahsilatlar";

  const wb = createWorkbook();
  addSummarySheet(wb, label, [
    { label: "Açık toplam", value: openTotal },
    { label: "Para birimi", value: settings.baseCurrency },
    { label: "Kayıt sayısı", value: rows.length },
    { label: "Gecikmiş", value: rows.filter((r) => r.overdue).length },
    { label: "Rapor tarihi", value: new Date() },
  ]);
  addSheet(wb, label.slice(0, 31), [
    { header: "Yön", key: "dir", width: 12, value: (p) => (p.direction === "IN" ? "Tahsilat" : "Ödeme") },
    { header: "Firma", key: "party", width: 30, value: (p) => p.partyName ?? "" },
    { header: "Belge", key: "doc", width: 20, value: (p) => p.docCode ?? "" },
    { header: "Tutar", key: "amount", width: 16, type: "money", value: (p) => p.amount },
    { header: "Ödenen", key: "paid", width: 16, type: "money", value: (p) => p.paidAmount },
    { header: "Kalan", key: "open", width: 16, type: "money", value: (p) => p.open },
    { header: "Para Birimi", key: "cur", width: 12, value: (p) => p.currency },
    { header: "Vade", key: "due", width: 13, type: "date", value: (p) => p.dueDate },
    { header: "Ödendiği Tarih", key: "paidat", width: 15, type: "date", value: (p) => p.paidAt },
    { header: "Durum", key: "status", width: 14, value: (p) => PAYMENT_STATUS_LABELS[p.status] ?? p.status },
    { header: "Gecikmiş", key: "late", width: 10, value: (p) => (p.overdue ? "EVET" : "") },
    { header: "Yöntem", key: "method", width: 16, value: (p) => (p.method ? PAYMENT_METHOD_LABELS[p.method] ?? p.method : "") },
    { header: "Not", key: "note", width: 30, value: (p) => p.note ?? "" },
  ], rows);
  return { buffer: await toBuffer(wb), filename: fileName(label) };
}

export async function exportExpenses(filter: { from?: Date; to?: Date } = {}): Promise<ExportResult> {
  const { rows, baseTotal } = await listExpenses({ ...filter, perPage: LARGE });
  const settings = await getOsSettings();
  const wb = createWorkbook();
  addSummarySheet(wb, "Giderler", [
    { label: "Toplam gider", value: baseTotal },
    { label: "Para birimi", value: settings.baseCurrency },
    { label: "Kayıt sayısı", value: rows.length },
    { label: "Rapor tarihi", value: new Date() },
  ]);
  addSheet(wb, "Giderler", [
    { header: "Tarih", key: "date", width: 13, type: "date", value: (e) => e.occurredAt },
    { header: "Gider", key: "title", width: 32, value: (e) => e.title },
    { header: "Tür", key: "kind", width: 20, value: (e) => EXPENSE_KIND_LABELS[e.kind] ?? e.kind },
    { header: "Firma", key: "party", width: 26, value: (e) => e.partyName ?? "" },
    { header: "Tutar", key: "amount", width: 16, type: "money", value: (e) => e.amount },
    { header: "Para Birimi", key: "cur", width: 12, value: (e) => e.currency },
    { header: "Tutar (ana PB)", key: "base", width: 16, type: "money", value: (e) => e.baseAmount },
    { header: "Vade", key: "due", width: 13, type: "date", value: (e) => e.dueDate },
    { header: "Tekrarlayan", key: "rec", width: 12, value: (e) => (e.recurring ? "Evet" : "") },
    { header: "Ödendi", key: "paid", width: 10, value: (e) => (e.paid ? "Evet" : "") },
    { header: "Not", key: "note", width: 30, value: (e) => e.note ?? "" },
  ], rows);
  return { buffer: await toBuffer(wb), filename: fileName("Giderler") };
}

export async function exportTax(): Promise<ExportResult> {
  const rows = await listTaxRecords();
  const wb = createWorkbook();
  addSheet(wb, "Vergi Takvimi", [
    { header: "Tür", key: "kind", width: 22, value: (t) => t.kind },
    { header: "Dönem", key: "period", width: 14, value: (t) => t.period },
    { header: "Tutar", key: "amount", width: 16, type: "money", value: (t) => t.amount },
    { header: "Para Birimi", key: "cur", width: 12, value: (t) => t.currency },
    { header: "Son Tarih", key: "due", width: 13, type: "date", value: (t) => t.dueDate },
    { header: "Durum", key: "status", width: 14, value: (t) => TAX_STATUS_LABELS[t.status] ?? t.status },
    { header: "Gecikmiş", key: "late", width: 10, value: (t) => (t.overdue ? "EVET" : "") },
    { header: "Ödendiği Tarih", key: "paid", width: 15, type: "date", value: (t) => t.paidAt },
    { header: "Not", key: "note", width: 34, value: (t) => t.note ?? "" },
  ], rows);
  return { buffer: await toBuffer(wb), filename: fileName("Vergi-Takvimi") };
}

// ---------------------------------------------------------------------------
// Report exports
// ---------------------------------------------------------------------------

export async function exportReport(kind: string, filter: ReportFilter): Promise<ExportResult> {
  const settings = await getOsSettings();
  const wb = createWorkbook();
  const stamp = { label: "Para birimi", value: settings.baseCurrency };
  const period = {
    label: "Dönem",
    value: `${filter.from ? filter.from.toLocaleDateString("tr-TR") : "başlangıç"} — ${filter.to ? filter.to.toLocaleDateString("tr-TR") : "bugün"}`,
  };

  switch (kind) {
    case "sales": {
      const { rows, totals } = await salesReport(filter);
      addSummarySheet(wb, "Satış Raporu", [
        period, stamp,
        { label: "Ciro", value: totals.revenue },
        { label: "Satılan malın maliyeti", value: totals.cogs },
        { label: "Doğrudan giderler", value: totals.cost },
        { label: "Brüt kâr", value: totals.profit },
        { label: "Marj %", value: totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0 },
        { label: "Satış adedi", value: rows.length },
      ]);
      addSheet(wb, "Satışlar", [
        { header: "Belge No", key: "code", width: 16, value: (r) => r.code },
        { header: "Tarih", key: "date", width: 13, type: "date", value: (r) => r.issuedAt },
        { header: "Müşteri", key: "cust", width: 30, value: (r) => r.customerName ?? "" },
        { header: "Kanal", key: "ch", width: 20, value: (r) => r.channelName ?? "" },
        { header: "Ülke", key: "country", width: 8, value: (r) => r.country ?? "" },
        { header: "Para Birimi", key: "cur", width: 12, value: (r) => r.currency },
        { header: "Tutar", key: "total", width: 16, type: "money", value: (r) => r.total },
        { header: "Ciro (ana PB)", key: "rev", width: 16, type: "money", value: (r) => r.baseRevenue },
        { header: "Maliyet", key: "cogs", width: 16, type: "money", value: (r) => r.cogs },
        { header: "Doğrudan Gider", key: "cost", width: 16, type: "money", value: (r) => r.directCost },
        { header: "Kâr", key: "profit", width: 16, type: "money", value: (r) => r.profit },
        { header: "Marj %", key: "margin", width: 10, type: "percent", value: (r) => r.marginPct },
      ], rows);
      return { buffer: await toBuffer(wb), filename: fileName("Satis-Raporu") };
    }
    case "purchases": {
      const { rows, totals } = await purchaseReport(filter);
      addSummarySheet(wb, "Alış Raporu", [
        period, stamp,
        { label: "Mal bedeli", value: totals.goods },
        { label: "Ek maliyetler", value: totals.costs },
        { label: "Toplam", value: totals.total },
        { label: "Belge sayısı", value: rows.length },
      ]);
      addSheet(wb, "Alışlar", [
        { header: "Belge No", key: "code", width: 16, value: (r) => r.code },
        { header: "Tarih", key: "date", width: 13, type: "date", value: (r) => r.issuedAt },
        { header: "Tedarikçi", key: "sup", width: 30, value: (r) => r.supplierName },
        { header: "Ülke", key: "country", width: 8, value: (r) => r.country },
        { header: "Para Birimi", key: "cur", width: 12, value: (r) => r.currency },
        { header: "Mal Bedeli", key: "sub", width: 16, type: "money", value: (r) => r.subtotal },
        { header: "Ek Maliyet", key: "cost", width: 16, type: "money", value: (r) => r.costTotal },
        { header: "Toplam", key: "total", width: 16, type: "money", value: (r) => r.total },
        { header: "Toplam (ana PB)", key: "base", width: 18, type: "money", value: (r) => r.baseTotal },
      ], rows);
      return { buffer: await toBuffer(wb), filename: fileName("Alis-Raporu") };
    }
    case "profit": {
      const rows = await profitByItem(filter);
      const revenue = rows.reduce((a, r) => a + r.revenue, 0);
      const profit = rows.reduce((a, r) => a + r.profit, 0);
      addSummarySheet(wb, "Kâr Raporu", [
        period, stamp,
        { label: "Ciro", value: revenue },
        { label: "Maliyet", value: rows.reduce((a, r) => a + r.cost, 0) },
        { label: "Kâr", value: profit },
        { label: "Marj %", value: revenue > 0 ? (profit / revenue) * 100 : 0 },
        { label: "Ürün sayısı", value: rows.length },
      ]);
      addSheet(wb, "Ürün Bazında Kâr", [
        { header: "SKU", key: "sku", width: 16, value: (r) => r.sku },
        { header: "Ürün", key: "name", width: 34, value: (r) => r.name },
        { header: "Satılan", key: "qty", width: 12, type: "qty", value: (r) => r.qty },
        { header: "Birim", key: "unit", width: 10, value: (r) => r.unit },
        { header: "Ciro", key: "rev", width: 16, type: "money", value: (r) => r.revenue },
        { header: "Maliyet", key: "cost", width: 16, type: "money", value: (r) => r.cost },
        { header: "Kâr", key: "profit", width: 16, type: "money", value: (r) => r.profit },
        { header: "Marj %", key: "margin", width: 10, type: "percent", value: (r) => r.marginPct },
      ], rows);
      return { buffer: await toBuffer(wb), filename: fileName("Kar-Raporu") };
    }
    case "customers": {
      const rows = await customerReport(filter);
      addSummarySheet(wb, "Müşteri Raporu", [
        period, stamp,
        { label: "Müşteri sayısı", value: rows.length },
        { label: "Toplam ciro", value: rows.reduce((a, r) => a + r.revenue, 0) },
        { label: "Toplam kâr", value: rows.reduce((a, r) => a + r.profit, 0) },
        { label: "Açık alacak", value: rows.reduce((a, r) => a + r.openReceivable, 0) },
      ]);
      addSheet(wb, "Müşteriler", [
        { header: "Müşteri", key: "name", width: 32, value: (r) => r.name },
        { header: "Ülke", key: "country", width: 8, value: (r) => r.country },
        { header: "Satış Adedi", key: "cnt", width: 12, type: "number", value: (r) => r.salesCount },
        { header: "Ciro", key: "rev", width: 16, type: "money", value: (r) => r.revenue },
        { header: "Kâr", key: "profit", width: 16, type: "money", value: (r) => r.profit },
        { header: "Marj %", key: "margin", width: 10, type: "percent", value: (r) => r.marginPct },
        { header: "Açık Alacak", key: "open", width: 16, type: "money", value: (r) => r.openReceivable },
      ], rows);
      return { buffer: await toBuffer(wb), filename: fileName("Musteri-Raporu") };
    }
    case "suppliers": {
      const rows = await supplierReport(filter);
      addSummarySheet(wb, "Tedarikçi Raporu", [
        period, stamp,
        { label: "Tedarikçi sayısı", value: rows.length },
        { label: "Toplam alış", value: rows.reduce((a, r) => a + r.total, 0) },
        { label: "Açık borç", value: rows.reduce((a, r) => a + r.openPayable, 0) },
      ]);
      addSheet(wb, "Tedarikçiler", [
        { header: "Tedarikçi", key: "name", width: 32, value: (r) => r.name },
        { header: "Ülke", key: "country", width: 8, value: (r) => r.country },
        { header: "Alış Adedi", key: "cnt", width: 12, type: "number", value: (r) => r.purchaseCount },
        { header: "Toplam Alış", key: "total", width: 16, type: "money", value: (r) => r.total },
        { header: "Açık Borç", key: "open", width: 16, type: "money", value: (r) => r.openPayable },
      ], rows);
      return { buffer: await toBuffer(wb), filename: fileName("Tedarikci-Raporu") };
    }
    case "channels": {
      const rows = await channelReport(filter);
      addSummarySheet(wb, "Kanal Performansı", [
        period, stamp,
        { label: "Kanal sayısı", value: rows.length },
        { label: "Toplam ciro", value: rows.reduce((a, r) => a + r.revenue, 0) },
        { label: "Toplam komisyon", value: rows.reduce((a, r) => a + r.commission, 0) },
        { label: "Toplam kâr", value: rows.reduce((a, r) => a + r.profit, 0) },
      ]);
      addSheet(wb, "Kanallar", [
        { header: "Kanal", key: "name", width: 26, value: (r) => r.name },
        { header: "Tip", key: "type", width: 18, value: (r) => (r.type ? CHANNEL_TYPE_LABELS[r.type] ?? r.type : "") },
        { header: "Satış Adedi", key: "cnt", width: 12, type: "number", value: (r) => r.salesCount },
        { header: "Ciro", key: "rev", width: 16, type: "money", value: (r) => r.revenue },
        { header: "Maliyet", key: "cogs", width: 16, type: "money", value: (r) => r.cogs },
        { header: "Komisyon", key: "com", width: 16, type: "money", value: (r) => r.commission },
        { header: "Kâr", key: "profit", width: 16, type: "money", value: (r) => r.profit },
        { header: "Marj %", key: "margin", width: 10, type: "percent", value: (r) => r.marginPct },
      ], rows);
      return { buffer: await toBuffer(wb), filename: fileName("Kanal-Raporu") };
    }
    case "cashflow": {
      const rows = await cashflowReport(filter);
      addSummarySheet(wb, "Nakit Akışı", [
        stamp,
        { label: "Beklenen tahsilat", value: rows.reduce((a, r) => a + r.incoming, 0) },
        { label: "Planlanan ödeme", value: rows.reduce((a, r) => a + r.outgoing, 0) },
        { label: "Net", value: rows.reduce((a, r) => a + r.net, 0) },
        { label: "Rapor tarihi", value: new Date() },
      ]);
      addSheet(wb, "Aylık Nakit Akışı", [
        { header: "Ay", key: "month", width: 12, value: (r) => r.month },
        { header: "Girecek", key: "in", width: 18, type: "money", value: (r) => r.incoming },
        { header: "Çıkacak", key: "out", width: 18, type: "money", value: (r) => r.outgoing },
        { header: "Net", key: "net", width: 18, type: "money", value: (r) => r.net },
      ], rows);
      return { buffer: await toBuffer(wb), filename: fileName("Nakit-Akisi") };
    }
    case "stock":
      return exportStock();
    default:
      throw new Error(`Bilinmeyen rapor: ${kind}`);
  }
}
