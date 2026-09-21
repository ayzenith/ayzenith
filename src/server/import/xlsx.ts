import ExcelJS from "exceljs";
import type { Cell } from "./parsers";

/**
 * Reads an .xlsx into plain cell rows for the parsers: the text exactly as the
 * publisher formatted it, the underlying value, its number format, and any
 * hyperlink. Legacy .xls (BIFF) is not readable here — see the ingestion
 * script for how those files are handled.
 */
export type SheetRows = { name: string; rows: Cell[][] };

function cellOf(c: ExcelJS.Cell): Cell {
  const v = c.value as unknown;
  let hyperlink: string | undefined;
  let value: unknown = v;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { hyperlink?: string; text?: unknown; result?: unknown; richText?: Array<{ text: string }> };
    if (o.hyperlink) hyperlink = o.hyperlink;
    if (o.result !== undefined) value = o.result;
    else if (o.richText) value = o.richText.map((r) => r.text).join("");
    else if (o.text !== undefined) value = typeof o.text === "object" ? String((o.text as { richText?: Array<{ text: string }> }).richText?.map((r) => r.text).join("") ?? "") : o.text;
  }
  // exceljs' `text` is a string for most cells but a NUMBER for a hyperlink
  // cell whose label is numeric, so it is coerced rather than trusted.
  let text: string;
  try {
    const raw: unknown = c.text;
    text = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  } catch {
    text = value == null ? "" : String(value);
  }
  if (typeof value === "string" && (!text || text === "[object Object]")) text = value;
  return { text, value, numFmt: c.numFmt || undefined, hyperlink };
}

export async function readXlsx(data: Uint8Array | ArrayBuffer): Promise<SheetRows[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  return wb.worksheets.map((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: Cell[] = [];
      const n = Math.max(row.cellCount, ws.columnCount);
      for (let i = 1; i <= n; i += 1) cells.push(cellOf(row.getCell(i)));
      rows.push(cells);
    });
    return { name: ws.name, rows };
  });
}
