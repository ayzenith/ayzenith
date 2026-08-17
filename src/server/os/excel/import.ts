import "server-only";

import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/server/activity";
import { D, ZERO, parseOptionalDecimal, type Dec } from "../money";
import { getOsSettings, suggestFxRate } from "../settings";
import { ensureDefaultLocation, postMovements } from "../inventory";
import { createPurchase } from "../purchases";
import { createSale } from "../sales";
import { createExpense } from "../finance";
import { autoMap, normalizeHeader, schemaFor, type ImportField, type ImportSchema } from "./schemas";
import { addSheet, createWorkbook, toBuffer } from "./workbook";

/**
 * AYZENITH BUSINESS OS — Excel import.
 *
 * The spreadsheet is a DOOR, never the source of truth. Rows are read, coerced,
 * validated and written into the database; after that the file is irrelevant.
 *
 * Two properties matter more than throughput:
 *
 *   • NOTHING IS GUESSED. A row that cannot be resolved (unknown SKU, unparseable
 *     amount, missing required column) is REJECTED with a reason and a row
 *     number. It is never silently coerced into a zero, and never creates a
 *     half-record that looks fine until someone reconciles it.
 *
 *   • FAILURE IS PER-RECORD, NOT PER-FILE. Master-data rows are independent, so
 *     one bad row must not discard 146 good ones. Documents are different: a
 *     purchase and its lines succeed or fail together, inside one transaction,
 *     because half a purchase is worse than none.
 *
 * The result carries every rejected row back, so it can be downloaded as a
 * spreadsheet, fixed, and re-imported.
 */

export type ImportError = { row: number; field?: string; message: string; values?: Record<string, string> };

export type ImportResult = {
  entity: string;
  totalRows: number;
  created: number;
  updated: number;
  failed: number;
  errors: ImportError[];
  batchId: string | null;
};

export type ImportPreview = {
  entity: string;
  headers: string[];
  /** column index → schema field key */
  mapping: Record<number, string>;
  sample: string[][];
  totalRows: number;
  missingRequired: string[];
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type Cell = string | number | Date | null;

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return (v.result as Cell) ?? null;
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((t) => t.text).join("");
    }
    if ("hyperlink" in v && typeof v.hyperlink === "string") return v.hyperlink;
  }
  return String(v);
}

async function readSheet(buffer: Buffer): Promise<{ headers: string[]; rows: Cell[][] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Dosyada okunabilir bir sayfa bulunamadı.");

  const rows: Cell[][] = [];
  let headers: string[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values: Cell[] = [];
    // ExcelJS row.values is 1-based with a leading hole.
    const raw = row.values as ExcelJS.CellValue[];
    for (let i = 1; i < raw.length; i += 1) values.push(cellValue(raw[i] ?? null));
    if (rowNumber === 1) {
      headers = values.map((v) => (v == null ? "" : String(v).trim()));
      return;
    }
    if (values.every((v) => v == null || String(v).trim() === "")) return;
    rows.push(values);
  });

  if (headers.length === 0) throw new Error("Dosyanın ilk satırında başlık bulunamadı.");
  return { headers, rows };
}

/** Step one of the import: what is in this file and how did we read it? */
export async function previewImport(entity: string, buffer: Buffer): Promise<ImportPreview> {
  const schema = schemaFor(entity);
  if (!schema) throw new Error(`Bilinmeyen içe aktarma türü: ${entity}`);
  const { headers, rows } = await readSheet(buffer);
  const mapping = autoMap(headers, schema);
  const mapped = new Set(Object.values(mapping));
  const missingRequired = schema.fields
    .filter((f) => f.required && !mapped.has(f.key))
    .map((f) => f.label);

  return {
    entity,
    headers,
    mapping,
    sample: rows.slice(0, 8).map((r) => r.map((c) => (c == null ? "" : formatCell(c)))),
    totalRows: rows.length,
    missingRequired,
  };
}

function formatCell(c: Cell): string {
  if (c instanceof Date) return c.toLocaleDateString("tr-TR");
  return String(c);
}

// ---------------------------------------------------------------------------
// Coercion
// ---------------------------------------------------------------------------

class RowError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

function parseDate(v: Cell, field: string): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial date (days since 1899-12-30).
    const ms = (v - 25569) * 86_400_000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const [, dd, mm, yy] = dmy;
    const year = Number(yy) < 100 ? 2000 + Number(yy) : Number(yy);
    const d = new Date(year, Number(mm) - 1, Number(dd));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  throw new RowError(`"${s}" bir tarih olarak okunamadı (gg.aa.yyyy bekleniyor).`, field);
}

function coerce(field: ImportField, raw: Cell): string | number | Date | Dec | string[] | null {
  if (raw == null || String(raw).trim() === "") {
    if (field.required) throw new RowError(`"${field.label}" zorunlu ve boş.`, field.label);
    return null;
  }
  switch (field.type) {
    case "money": {
      const d = parseOptionalDecimal(raw);
      if (!d) throw new RowError(`"${String(raw)}" sayı olarak okunamadı.`, field.label);
      return d;
    }
    case "number": {
      const d = parseOptionalDecimal(raw);
      if (!d) throw new RowError(`"${String(raw)}" sayı olarak okunamadı.`, field.label);
      return d;
    }
    case "date":
      return parseDate(raw, field.label);
    case "bool": {
      const s = normalizeHeader(String(raw));
      return ["evet", "true", "1", "aktif", "yes", "var"].includes(s) ? 1 : 0;
    }
    case "enum": {
      const parts = String(raw).split(/[,;/|]/).map((p) => normalizeHeader(p)).filter(Boolean);
      const mapped = parts
        .map((p) => field.values?.[p])
        .filter((v): v is string => Boolean(v));
      if (mapped.length === 0) {
        throw new RowError(
          `"${String(raw)}" tanınmadı. Geçerli değerler: ${[...new Set(Object.keys(field.values ?? {}))].slice(0, 8).join(", ")}`,
          field.label,
        );
      }
      return mapped;
    }
    default:
      return String(raw).trim();
  }
}

type RowValues = Record<string, string | number | Date | Dec | string[] | null>;

function buildRow(schema: ImportSchema, mapping: Record<number, string>, cells: Cell[]): RowValues {
  const byKey = new Map(schema.fields.map((f) => [f.key, f]));
  const out: RowValues = {};
  for (const [indexStr, key] of Object.entries(mapping)) {
    const field = byKey.get(key);
    if (!field) continue;
    out[key] = coerce(field, cells[Number(indexStr)] ?? null);
  }
  // Required fields absent from the mapping entirely.
  for (const f of schema.fields) {
    if (f.required && out[f.key] == null) {
      throw new RowError(`"${f.label}" zorunlu ve boş.`, f.label);
    }
  }
  return out;
}

// `RowValues` is an index signature, so every lookup is `T | undefined` under
// noUncheckedIndexedAccess. These accessors absorb that and hand back a clean
// nullable — a missing column and an empty cell mean the same thing here.
type Cellish = RowValues[string] | undefined;

const str = (v: Cellish): string | null =>
  v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v instanceof Date ? v.toISOString() : String(v);
const dec = (v: Cellish): Dec | null =>
  v == null ? null : v instanceof Prisma.Decimal ? v : parseOptionalDecimal(String(v));
const int = (v: Cellish): number | null => {
  const d = dec(v);
  return d ? Math.round(d.toNumber()) : null;
};
const date = (v: Cellish): Date | null => (v instanceof Date ? v : null);
const arr = (v: Cellish): string[] => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

export async function runImport(
  entity: string,
  buffer: Buffer,
  mapping: Record<number, string>,
  opts: { fileName?: string; userId?: string | null } = {},
): Promise<ImportResult> {
  const schema = schemaFor(entity);
  if (!schema) throw new Error(`Bilinmeyen içe aktarma türü: ${entity}`);
  const { headers, rows } = await readSheet(buffer);

  const result: ImportResult = {
    entity, totalRows: rows.length, created: 0, updated: 0, failed: 0, errors: [], batchId: null,
  };

  // Parse and validate everything BEFORE writing documents, so a file with a
  // typo on row 3 does not leave two of five orders posted.
  type Parsed = { rowNumber: number; values: RowValues };
  const parsed: Parsed[] = [];
  rows.forEach((cells, i) => {
    const rowNumber = i + 2; // +1 for the header, +1 because humans count from 1
    try {
      parsed.push({ rowNumber, values: buildRow(schema, mapping, cells) });
    } catch (e) {
      const err = e as RowError;
      result.failed += 1;
      result.errors.push({
        row: rowNumber,
        field: err.field,
        message: err.message,
        values: rowValues(headers, cells),
      });
    }
  });

  switch (entity) {
    case "party": await importParties(parsed, result, opts.userId); break;
    case "item": await importItems(parsed, result, opts.userId); break;
    case "expense": await importExpenses(parsed, result, opts.userId); break;
    case "stock": await importStock(parsed, result, opts.userId); break;
    case "purchase": await importDocuments(parsed, result, schema, "purchase", opts.userId); break;
    case "sale": await importDocuments(parsed, result, schema, "sale", opts.userId); break;
    default: throw new Error(`"${entity}" için içe aktarma henüz tanımlı değil.`);
  }

  const batch = await db.osImportBatch.create({
    data: {
      entity,
      fileName: opts.fileName ?? null,
      totalRows: result.totalRows,
      createdRows: result.created,
      updatedRows: result.updated,
      failedRows: result.failed,
      errors: result.errors as unknown as Prisma.InputJsonValue,
      createdById: opts.userId ?? null,
    },
    select: { id: true },
  });
  result.batchId = batch.id;

  await logActivity({
    userId: opts.userId ?? null,
    action: "os.import",
    entity: "OsImportBatch",
    entityId: batch.id,
    summary: `${schema.label}: ${result.created} yeni, ${result.updated} güncellendi, ${result.failed} hatalı`,
  });
  return result;
}

function rowValues(headers: string[], cells: Cell[]): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((h, i) => {
    const v = cells[i];
    if (v != null && String(v).trim() !== "") out[h || `Sütun ${i + 1}`] = formatCell(v);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Per-entity importers
// ---------------------------------------------------------------------------

async function importParties(parsed: Array<{ rowNumber: number; values: RowValues }>, result: ImportResult, userId?: string | null) {
  for (const { rowNumber, values } of parsed) {
    try {
      const name = str(values.name)!.trim();
      const country = (str(values.country) ?? "TR").toUpperCase().slice(0, 2);
      const taxNumber = str(values.taxNumber)?.trim() || null;

      // Duplicate rule: tax number is decisive when present; otherwise name +
      // country. Importing the same list twice must not double the customer base.
      const existing = taxNumber
        ? await db.party.findFirst({ where: { taxNumber } , select: { id: true } })
        : await db.party.findFirst({
            where: { name: { equals: name, mode: "insensitive" }, country },
            select: { id: true },
          });

      const data = {
        name,
        legalName: str(values.legalName),
        taxNumber,
        taxOffice: str(values.taxOffice),
        country,
        city: str(values.city),
        address: str(values.address),
        postalCode: str(values.postalCode),
        phone: str(values.phone),
        email: str(values.email),
        website: str(values.website),
        currency: (str(values.currency) ?? "TRY").toUpperCase(),
        paymentTermDays: int(values.paymentTermDays),
        notes: str(values.notes),
      };

      const roles = arr(values.roles);

      if (existing) {
        await db.party.update({ where: { id: existing.id }, data });
        result.updated += 1;
        for (const role of roles) {
          await db.partyRelation.upsert({
            where: { partyId_role: { partyId: existing.id, role: role as never } },
            create: { partyId: existing.id, role: role as never, status: "ACTIVE" },
            update: {},
          });
        }
      } else {
        await db.party.create({
          data: {
            ...data,
            createdById: userId ?? null,
            relations: roles.length
              ? { create: roles.map((role) => ({ role: role as never, status: "ACTIVE" as const })) }
              : undefined,
          },
        });
        result.created += 1;
      }
    } catch (e) {
      result.failed += 1;
      result.errors.push({ row: rowNumber, message: messageOf(e) });
    }
  }
}

async function importItems(parsed: Array<{ rowNumber: number; values: RowValues }>, result: ImportResult, userId?: string | null) {
  for (const { rowNumber, values } of parsed) {
    try {
      const sku = str(values.sku)!.trim();
      const data = {
        name: str(values.name)!.trim(),
        barcode: str(values.barcode),
        category: str(values.category),
        brand: str(values.brand),
        unit: str(values.unit) || "adet",
        purchasePrice: dec(values.purchasePrice),
        purchaseCurrency: (str(values.purchaseCurrency) ?? "TRY").toUpperCase(),
        salePrice: dec(values.salePrice),
        saleCurrency: (str(values.saleCurrency) ?? "TRY").toUpperCase(),
        vatRate: dec(values.vatRate),
        minStock: dec(values.minStock),
        description: str(values.description),
      };
      const existing = await db.item.findUnique({ where: { sku }, select: { id: true } });
      if (existing) {
        await db.item.update({ where: { id: existing.id }, data });
        result.updated += 1;
      } else {
        await db.item.create({ data: { sku, ...data, createdById: userId ?? null } });
        result.created += 1;
      }
    } catch (e) {
      result.failed += 1;
      result.errors.push({ row: rowNumber, message: messageOf(e) });
    }
  }
}

async function importExpenses(parsed: Array<{ rowNumber: number; values: RowValues }>, result: ImportResult, userId?: string | null) {
  const settings = await getOsSettings();
  for (const { rowNumber, values } of parsed) {
    try {
      const currency = (str(values.currency) ?? settings.baseCurrency).toUpperCase();
      const partyName = str(values.partyName);
      const party = partyName
        ? await db.party.findFirst({ where: { name: { equals: partyName, mode: "insensitive" } }, select: { id: true } })
        : null;
      await createExpense({
        title: str(values.title)!,
        kind: (arr(values.kind)[0] ?? "OTHER") as never,
        partyId: party?.id ?? null,
        amount: dec(values.amount)!,
        currency,
        fxRate: suggestFxRate(settings, currency),
        occurredAt: date(values.occurredAt) ?? new Date(),
        dueDate: date(values.dueDate),
        note: str(values.note),
        userId,
      });
      result.created += 1;
    } catch (e) {
      result.failed += 1;
      result.errors.push({ row: rowNumber, message: messageOf(e) });
    }
  }
}

async function importStock(parsed: Array<{ rowNumber: number; values: RowValues }>, result: ImportResult, userId?: string | null) {
  const defaultLocation = await ensureDefaultLocation();
  for (const { rowNumber, values } of parsed) {
    try {
      const sku = str(values.sku)!.trim();
      const item = await db.item.findUnique({ where: { sku }, select: { id: true, purchasePrice: true } });
      if (!item) throw new Error(`"${sku}" stok kodlu ürün bulunamadı. Önce ürünleri içe aktar.`);

      const locName = str(values.locationName);
      let locationId = defaultLocation;
      if (locName) {
        const loc = await db.stockLocation.findFirst({
          where: { name: { equals: locName, mode: "insensitive" } },
          select: { id: true },
        });
        if (!loc) throw new Error(`"${locName}" adlı konum bulunamadı. Önce Stok > Konumlar'dan ekle.`);
        locationId = loc.id;
      }

      const quantity = dec(values.quantity)!;
      if (quantity.isZero()) throw new Error("Miktar sıfır olamaz.");
      const cost = dec(values.unitCost) ?? item.purchasePrice ?? null;
      const reason = (arr(values.reason)[0] ?? "OPENING") as never;

      await db.$transaction(async (tx) => {
        await postMovements(tx, [
          {
            itemId: item.id,
            locationId,
            quantity,
            reason,
            unitCost: cost,
            note: str(values.note),
            createdById: userId ?? null,
          },
        ]);
      });
      result.created += 1;
    } catch (e) {
      result.failed += 1;
      result.errors.push({ row: rowNumber, message: messageOf(e) });
    }
  }
}

/**
 * Purchases and sales share one importer because they share one shape: rows
 * grouped into documents by `Belge No`. Each GROUP is written by the same
 * `createPurchase` / `createSale` the UI uses, so an imported document posts
 * stock, cost and payment exactly like a typed one — there is no second, weaker
 * write path that could drift.
 */
async function importDocuments(
  parsed: Array<{ rowNumber: number; values: RowValues }>,
  result: ImportResult,
  schema: ImportSchema,
  kind: "purchase" | "sale",
  userId?: string | null,
) {
  const settings = await getOsSettings();
  const defaultLocation = await ensureDefaultLocation();

  // Group by document reference; an empty reference means "its own document".
  const groups = new Map<string, Array<{ rowNumber: number; values: RowValues }>>();
  for (const p of parsed) {
    const ref = str(p.values.docRef)?.trim();
    const key = ref ? `ref:${ref}` : `row:${p.rowNumber}`;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  for (const [, rowsInDoc] of groups) {
    const first = rowsInDoc[0];
    if (!first) continue;
    const rowNumbers = rowsInDoc.map((r) => r.rowNumber);
    try {
      const currency = (str(first.values.currency) ?? settings.baseCurrency).toUpperCase();
      const fxRate = dec(first.values.fxRate) ?? suggestFxRate(settings, currency);
      const issuedAt = date(first.values.issuedAt) ?? new Date();
      const dueDate = date(first.values.dueDate);

      const locName = str(first.values.locationName);
      let locationId = defaultLocation;
      if (locName) {
        const loc = await db.stockLocation.findFirst({
          where: { name: { equals: locName, mode: "insensitive" } },
          select: { id: true },
        });
        if (!loc) throw new Error(`"${locName}" adlı konum bulunamadı.`);
        locationId = loc.id;
      }

      const lines = [];
      for (const r of rowsInDoc) {
        const sku = str(r.values.sku)!.trim();
        const item = await db.item.findUnique({ where: { sku }, select: { id: true } });
        if (!item) throw new Error(`"${sku}" stok kodlu ürün bulunamadı (satır ${r.rowNumber}).`);
        lines.push({
          itemId: item.id,
          quantity: dec(r.values.quantity)!,
          unitPrice: dec(r.values.unitPrice)!,
          discountRate: dec(r.values.discountRate) ?? ZERO(),
          vatRate: dec(r.values.vatRate) ?? ZERO(),
          note: str(r.values.note),
        });
      }

      if (kind === "purchase") {
        const supplierName = str(first.values.supplierName)!.trim();
        const supplier = await resolveParty(supplierName, "SUPPLIER");
        await createPurchase(
          { supplierId: supplier, locationId, issuedAt, dueDate, currency, fxRate, status: "CONFIRMED", lines, note: str(first.values.note) },
          userId,
        );
      } else {
        const customerName = str(first.values.customerName);
        const customerId = customerName ? await resolveParty(customerName, "CUSTOMER") : null;
        const channelName = str(first.values.channelName);
        let channelId: string | null = null;
        if (channelName) {
          const ch = await db.channel.findFirst({
            where: { name: { equals: channelName, mode: "insensitive" } },
            select: { id: true },
          });
          if (!ch) throw new Error(`"${channelName}" adlı satış kanalı bulunamadı. Önce Kanallar'dan ekle.`);
          channelId = ch.id;
        }
        await createSale(
          { customerId, channelId, locationId, issuedAt, dueDate, currency, fxRate, status: "CONFIRMED", lines, note: str(first.values.note) },
          userId,
        );
      }
      result.created += 1;
    } catch (e) {
      result.failed += rowsInDoc.length;
      result.errors.push({
        row: rowNumbers[0] ?? 0,
        message: `${rowNumbers.length > 1 ? `Satır ${rowNumbers.join(", ")}: ` : ""}${messageOf(e)}`,
      });
    }
  }
  void schema;
}

/** Find a firm by name, creating it if it is new — an import should not stop
 *  because a supplier has not been entered by hand first. */
async function resolveParty(name: string, role: "SUPPLIER" | "CUSTOMER"): Promise<string> {
  const existing = await db.party.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    await db.partyRelation.upsert({
      where: { partyId_role: { partyId: existing.id, role } },
      create: { partyId: existing.id, role, status: "ACTIVE" },
      update: {},
    });
    return existing.id;
  }
  const created = await db.party.create({
    data: { name, relations: { create: [{ role, status: "ACTIVE" }] } },
    select: { id: true },
  });
  return created.id;
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// ---------------------------------------------------------------------------
// Templates and error reports
// ---------------------------------------------------------------------------

/** A blank file with the right headers, a filled example row, and a notes sheet
 *  — so the owner never has to guess what a column wants. */
export async function buildTemplate(entity: string): Promise<Buffer> {
  const schema = schemaFor(entity);
  if (!schema) throw new Error(`Bilinmeyen tür: ${entity}`);
  const wb = createWorkbook();

  const example: Record<string, string> = {};
  for (const f of schema.fields) example[f.key] = f.example ?? "";

  addSheet(
    wb,
    schema.label,
    schema.fields.map((f) => ({
      header: f.required ? `${f.label} *` : f.label,
      key: f.key,
      width: Math.max(14, f.label.length + 6),
      value: (r: Record<string, string>) => r[f.key] ?? "",
    })),
    [example],
  );

  addSheet(
    wb,
    "Açıklamalar",
    [
      { header: "Sütun", key: "col", width: 24, value: (r: ImportField) => r.label },
      { header: "Zorunlu", key: "req", width: 10, value: (r: ImportField) => (r.required ? "Evet" : "Hayır") },
      { header: "Açıklama", key: "hint", width: 60, value: (r: ImportField) => r.hint ?? "" },
      {
        header: "Kabul edilen diğer başlıklar",
        key: "alias",
        width: 50,
        value: (r: ImportField) => r.aliases.slice(0, 6).join(", "),
      },
    ],
    schema.fields,
  );

  if (schema.note) {
    const ws = wb.getWorksheet("Açıklamalar");
    ws?.addRow([]);
    const noteRow = ws?.addRow(["NOT", "", schema.note]);
    if (noteRow) noteRow.font = { bold: true };
  }

  return toBuffer(wb);
}

/** The rejected rows, as a spreadsheet you can fix and re-upload. */
export async function buildErrorReport(batchId: string): Promise<{ buffer: Buffer; entity: string } | null> {
  const batch = await db.osImportBatch.findUnique({ where: { id: batchId } });
  if (!batch) return null;
  const errors = Array.isArray(batch.errors) ? (batch.errors as unknown as ImportError[]) : [];

  // Union of every column seen in the failed rows, so nothing is dropped.
  const columns = new Set<string>();
  for (const e of errors) for (const k of Object.keys(e.values ?? {})) columns.add(k);

  const wb = createWorkbook();
  addSheet(
    wb,
    "Hatalı Satırlar",
    [
      { header: "Satır", key: "row", width: 8, type: "number" as const, value: (r: ImportError) => r.row },
      { header: "Hata", key: "msg", width: 60, value: (r: ImportError) => r.message },
      { header: "Sütun", key: "field", width: 20, value: (r: ImportError) => r.field ?? "" },
      ...[...columns].map((c) => ({
        header: c,
        key: `c_${normalizeHeader(c)}`,
        width: 22,
        value: (r: ImportError) => r.values?.[c] ?? "",
      })),
    ],
    errors,
  );
  return { buffer: await toBuffer(wb), entity: batch.entity };
}

export { D };
