import "server-only";

import { getOsSettings } from "./settings";
import { getCashflow } from "./finance";
import { listItems } from "./items";
import { stockReport } from "./reports";
import { CASHFLOW_BUCKETS, formatMoney, formatQty, formatPercent } from "@/config/os";

/**
 * "Current list, as a PDF" — Finans / Ürünler / Stok. Reuses the same read
 * functions the screens and Excel exports already use (`listItems`,
 * `stockReport`, `getCashflow`), so the PDF can never disagree with what the
 * owner is looking at on screen. Deliberately a plain table report, not a
 * trade document: no versions, no signatory, just the list with a logo on it.
 */

export type ReportData = {
  title: string;
  generatedAt: Date;
  summary: Array<{ label: string; value: string }>;
  columns: Array<{ header: string; align?: "left" | "right" }>;
  rows: string[][];
  company: Awaited<ReturnType<typeof getOsSettings>>["company"];
};

const LARGE = 5000;

export async function getCashflowReportPdf(): Promise<ReportData> {
  const settings = await getOsSettings();
  const c = await getCashflow(settings.baseCurrency);
  const rows = CASHFLOW_BUCKETS.map((b) => {
    const inc = c.incoming[b.key];
    const out = c.outgoing[b.key];
    return [b.label, formatMoney(inc, settings.baseCurrency), formatMoney(out, settings.baseCurrency), formatMoney(inc - out, settings.baseCurrency)];
  });
  const totalIn = CASHFLOW_BUCKETS.reduce((a, b) => a + c.incoming[b.key], 0);
  const totalOut = CASHFLOW_BUCKETS.reduce((a, b) => a + c.outgoing[b.key], 0);
  return {
    title: "Nakit Akışı Takvimi",
    generatedAt: new Date(),
    summary: [
      { label: "Toplam gelecek", value: formatMoney(totalIn, settings.baseCurrency) },
      { label: "Toplam gidecek", value: formatMoney(totalOut, settings.baseCurrency) },
      { label: "Net", value: formatMoney(totalIn - totalOut, settings.baseCurrency) },
    ],
    columns: [
      { header: "Vade" }, { header: "Girecek", align: "right" }, { header: "Çıkacak", align: "right" }, { header: "Net", align: "right" },
    ],
    rows,
    company: settings.company,
  };
}

export async function getProductsReportPdf(filter: { search?: string; category?: string } = {}): Promise<ReportData> {
  const settings = await getOsSettings();
  const { rows: items, total } = await listItems({ search: filter.search, category: filter.category, perPage: LARGE });
  return {
    title: "Ürün Listesi",
    generatedAt: new Date(),
    summary: [{ label: "Ürün sayısı", value: String(total) }],
    columns: [
      { header: "SKU" }, { header: "Ürün" }, { header: "Stok", align: "right" },
      { header: "Maliyet", align: "right" }, { header: "Satış Fiyatı", align: "right" }, { header: "Marj", align: "right" },
    ],
    rows: items.map((i) => [
      i.sku, i.name, formatQty(i.onHand, i.unit),
      i.avgCost == null ? "—" : formatMoney(i.avgCost, settings.baseCurrency),
      i.salePrice == null ? "—" : formatMoney(i.salePrice, i.saleCurrency),
      formatPercent(i.marginPct),
    ]),
    company: settings.company,
  };
}

export async function getInventoryReportPdf(): Promise<ReportData> {
  const settings = await getOsSettings();
  const { rows, totalValue } = await stockReport();
  return {
    title: "Stok Durumu",
    generatedAt: new Date(),
    summary: [
      { label: "Toplam stok değeri", value: formatMoney(totalValue, settings.baseCurrency) },
      { label: "Ürün sayısı", value: String(rows.length) },
      { label: "Düşük stoklu", value: String(rows.filter((r) => r.low).length) },
    ],
    columns: [
      { header: "SKU" }, { header: "Ürün" }, { header: "Mevcut", align: "right" },
      { header: "Ortalama Maliyet", align: "right" }, { header: "Stok Değeri", align: "right" },
    ],
    rows: rows.map((r) => [
      r.sku, r.name, formatQty(r.onHand, r.unit),
      r.avgCost == null ? "—" : formatMoney(r.avgCost, settings.baseCurrency),
      formatMoney(r.value, settings.baseCurrency),
    ]),
    company: settings.company,
  };
}
