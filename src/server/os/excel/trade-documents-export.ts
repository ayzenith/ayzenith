import "server-only";

import { getDocument, type TradeDocumentDTO } from "../trade-documents";
import { docTitle, formatDocDate } from "@/config/trade-documents";
import { addSheet, addSummarySheet, createWorkbook, fileName, toBuffer, type SheetColumn } from "./workbook";
import type { ExportResult } from "./export";

/**
 * Excel counterpart of one trade document — same numbers as the PDF (both read
 * `getDocument`), formatted with the house spreadsheet conventions: frozen
 * header, autofilter, currency/date number formats (workbook.ts).
 */

type Row = TradeDocumentDTO["lines"][number];

export async function exportTradeDocument(id: string): Promise<ExportResult> {
  const doc = await getDocument(id);
  if (!doc) throw new Error("Belge bulunamadı.");

  const wb = createWorkbook();

  addSummarySheet(wb, `${docTitle("EN", doc.docType)} — ${doc.code}`, [
    { label: "Company", value: doc.company.companyLegalName },
    { label: "Document No", value: doc.code },
    { label: "Version", value: doc.version },
    { label: "Date", value: doc.issuedAt },
    { label: "Valid Until", value: doc.validUntil },
    { label: "Customer", value: doc.sale.customer?.name ?? "—" },
    { label: "Currency", value: doc.currency },
    { label: "Payment Terms", value: doc.paymentTermsOverride ?? (doc.sale.paymentTermDays ? `${doc.sale.paymentTermDays} days` : "—") },
    { label: "Incoterm", value: doc.incoterm ?? "—" },
    { label: "Country of Origin", value: doc.countryOfOrigin ?? "—" },
    { label: "Status", value: doc.status },
    { label: "Subtotal", value: doc.totals.subtotal },
    { label: "Discount", value: doc.totals.discountTotal },
    { label: "Total", value: doc.totals.total },
  ]);

  const isPackingList = doc.docType === "PACKING_LIST";

  const columns: SheetColumn<Row>[] = [
    { header: "SKU", key: "sku", type: "text", value: (r) => r.sku },
    { header: "Product", key: "name", type: "text", width: 32, value: (r) => r.name },
    { header: "Qty", key: "qty", type: "qty", value: (r) => r.quantity },
    { header: "Unit", key: "unit", type: "text", value: (r) => r.unit },
    ...(isPackingList
      ? ([
          { header: "Packages", key: "packages", type: "number", value: (r: Row) => r.packages ?? null },
          { header: "Net Weight (kg)", key: "net", type: "qty", value: (r: Row) => r.netWeight ?? null },
          { header: "Gross Weight (kg)", key: "gross", type: "qty", value: (r: Row) => r.grossWeight ?? null },
          { header: "Dimensions", key: "dims", type: "text", value: (r: Row) => r.dimensions ?? "" },
        ] satisfies SheetColumn<Row>[])
      : ([
          { header: "Unit Price", key: "price", type: "money", value: (r: Row) => r.unitPrice },
          { header: "Discount %", key: "discount", type: "percent", value: (r: Row) => r.discountRate },
          { header: "VAT %", key: "vat", type: "percent", value: (r: Row) => r.vatRate },
          { header: "Currency", key: "currency", type: "text", value: () => doc.currency },
          { header: "Amount", key: "amount", type: "money", value: (r: Row) => r.lineTotal },
        ] satisfies SheetColumn<Row>[])),
    ...(doc.show.hsCode ? ([{ header: "HS Code", key: "hs", type: "text", value: (r: Row) => r.hsCode ?? "" }] satisfies SheetColumn<Row>[]) : []),
    ...(doc.show.countryOfOrigin ? ([{ header: "Country of Origin", key: "origin", type: "text", value: (r: Row) => r.countryOfOrigin ?? "" }] satisfies SheetColumn<Row>[]) : []),
  ];

  addSheet(wb, "Items", columns, doc.lines);

  const buffer = await toBuffer(wb);
  return { buffer, filename: fileName(`${doc.docType}-${doc.code}-${formatDocDate(doc.issuedAt, "EN").replace(/\s/g, "-")}`) };
}
