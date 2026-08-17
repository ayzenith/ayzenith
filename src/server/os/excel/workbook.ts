import "server-only";

import ExcelJS from "exceljs";

/**
 * AYZENITH BUSINESS OS — spreadsheet primitives.
 *
 * One place decides what a Business OS export looks like, so every module's file
 * opens the same way: bold frozen header, autofilter, sensible column widths,
 * Turkish date format, thousands-separated money with the currency in its own
 * column rather than glued to the number (a number glued to a symbol is a string
 * and stops being sortable).
 *
 * ExcelJS writes typed cells, so a value beginning with `=` is stored as text and
 * never evaluated — the CSV formula-injection problem the Lead Finder exporter
 * has to defend against does not exist in this format.
 */

export type ColumnType = "text" | "number" | "money" | "qty" | "percent" | "date" | "bool";

export type SheetColumn<T> = {
  header: string;
  key: string;
  width?: number;
  type?: ColumnType;
  value: (row: T) => string | number | Date | boolean | null | undefined;
};

const FORMAT: Record<ColumnType, string | undefined> = {
  text: undefined,
  number: "#,##0",
  money: "#,##0.00",
  qty: "#,##0.###",
  percent: "#,##0.0",
  date: "dd.mm.yyyy",
  bool: undefined,
};

export function createWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AYZENITH Business OS";
  wb.created = new Date();
  return wb;
}

export function addSheet<T>(
  wb: ExcelJS.Workbook,
  name: string,
  columns: SheetColumn<T>[],
  rows: T[],
): ExcelJS.Worksheet {
  // Excel refuses sheet names over 31 chars or containing : \ / ? * [ ]
  const ws = wb.addWorksheet(name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31));
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? Math.max(12, Math.min(40, c.header.length + 4)),
  }));

  for (const row of rows) {
    const record: Record<string, string | number | Date | boolean | null> = {};
    for (const c of columns) {
      const v = c.value(row);
      record[c.key] = v === undefined ? null : v;
    }
    ws.addRow(record);
  }

  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (rows.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }

  columns.forEach((c, i) => {
    const fmt = FORMAT[c.type ?? "text"];
    if (!fmt) return;
    const col = ws.getColumn(i + 1);
    col.numFmt = fmt;
    if (c.type !== "date") col.alignment = { horizontal: "right" };
  });

  return ws;
}

/** A "Özet" sheet of label/value pairs, used as the first page of every report. */
export function addSummarySheet(
  wb: ExcelJS.Workbook,
  title: string,
  entries: Array<{ label: string; value: string | number | Date | null }>,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet("Özet");
  ws.columns = [
    { header: "", key: "label", width: 34 },
    { header: "", key: "value", width: 28 },
  ];
  const heading = ws.addRow({ label: title, value: "" });
  heading.font = { bold: true, size: 14 };
  ws.addRow({});
  for (const e of entries) {
    const row = ws.addRow({ label: e.label, value: e.value });
    row.getCell(1).font = { bold: true };
    if (typeof e.value === "number") row.getCell(2).numFmt = "#,##0.00";
    if (e.value instanceof Date) row.getCell(2).numFmt = "dd.mm.yyyy";
  }
  return ws;
}

export async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Filename with a date stamp, safe for the Content-Disposition header. */
export function fileName(base: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = base
    .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-");
  return `AYZENITH-${safe}-${stamp}.xlsx`;
}
