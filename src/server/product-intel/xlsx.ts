import "server-only";

import ExcelJS from "exceljs";

/**
 * PRODUCT INTELLIGENCE — an uploaded spreadsheet, flattened to text.
 *
 * Deliberately thin: the sheet becomes tab-separated lines and then goes
 * through the SAME parser as a pasted block (`offers.ts`). One reader means one
 * set of rules about headers, prices and skipped rows — an Excel upload and a
 * paste cannot drift apart into two behaviours, and only one of them has to be
 * tested.
 */

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: Array<{ text?: string }>; hyperlink?: string };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? "").join("").trim();
    if (typeof o.text === "string") return o.text.trim();
    if (typeof o.result === "string" || typeof o.result === "number") return String(o.result);
    if (typeof o.hyperlink === "string") return o.hyperlink;
  }
  return "";
}

export async function sheetToDelimitedText(buffer: Buffer): Promise<{ text: string; sheetName: string | null; rowCount: number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { text: "", sheetName: null, rowCount: 0 };

  const lines: string[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    // ExcelJS row.values is 1-based with a leading hole.
    const raw = (row.values as ExcelJS.CellValue[]).slice(1);
    const cells = raw.map(cellText);
    // A tab inside a cell would invent a column, so it is neutralised here
    // rather than confusing the shared parser downstream.
    if (cells.some((c) => c !== "")) lines.push(cells.map((c) => c.replace(/\t/g, " ")).join("\t"));
  });

  return { text: lines.join("\n"), sheetName: ws.name, rowCount: lines.length };
}
