import "server-only";

import { Prisma, type TradeDocType, type TradeDocLanguage, type TradeDocStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/server/activity";
import { toNum, toNumOrNull } from "./money";
import { nextCode } from "./sequence";
import { getOsSettings } from "./settings";
import { getSignatory, getDefaultSignatory } from "./signatories";
import { getBankAccount, getDefaultBankAccount } from "./bank-accounts";
import { DOC_PREFIX } from "@/config/trade-documents";

/**
 * AYZENITH TRADE DOCUMENT SYSTEM — server layer.
 *
 * A TradeDocument never forks the commercial truth: quantities, prices, party
 * and totals are read live from `Sale`/`SaleLine` every time a document is
 * rendered (see `getDocument` below). This module only owns what is specific
 * to one piece of paper — language, layout, buyer-facing notes, and the
 * version chain (`docs/…` brief §4, §25).
 */

export class TradeDocError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeDocError";
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateDocumentInput = {
  saleId: string;
  docType: TradeDocType;
  language?: TradeDocLanguage;
  currency?: string;
  signatoryId?: string | null;
  bankAccountId?: string | null;
  validUntil?: Date | null;
};

export async function createDocument(input: CreateDocumentInput, userId?: string | null): Promise<string> {
  const sale = await db.sale.findUnique({
    where: { id: input.saleId },
    include: { lines: { orderBy: { id: "asc" } } },
  });
  if (!sale) throw new TradeDocError("Satış bulunamadı.");
  if (sale.lines.length === 0) throw new TradeDocError("Ürün satırı olmayan satış için belge oluşturulamaz.");

  const settings = await getOsSettings();
  const language = input.language ?? settings.company.defaultDocLanguage;
  const currency = input.currency ?? sale.currency;

  const signatory = input.signatoryId ? await getSignatory(input.signatoryId) : await getDefaultSignatory();
  const bankAccount = input.bankAccountId ? await getBankAccount(input.bankAccountId) : await getDefaultBankAccount(currency);

  const id = await db.$transaction(async (tx) => {
    const code = await nextCode(tx, DOC_PREFIX[input.docType], new Date().getFullYear());
    const doc = await tx.tradeDocument.create({
      data: {
        code,
        docType: input.docType,
        saleId: sale.id,
        language,
        currency,
        status: "DRAFT",
        version: 1,
        isLatest: true,
        issuedAt: new Date(),
        validUntil: input.validUntil ?? null,
        signatoryId: signatory?.id ?? null,
        signatoryName: signatory ? [signatory.firstName, signatory.lastName].filter(Boolean).join(" ") : null,
        signatoryTitle: signatory?.jobTitle ?? null,
        bankAccountId: bankAccount?.id ?? null,
        createdById: userId ?? null,
        lines: {
          create: sale.lines.map((l, i) => ({ saleLineId: l.id, sortOrder: i })),
        },
      },
      select: { id: true },
    });
    return doc.id;
  });

  await logActivity({
    userId: userId ?? null,
    action: "os.document.create",
    entity: "TradeDocument",
    entityId: id,
    summary: `${input.docType} oluşturuldu (${sale.code})`,
  });

  return id;
}

// ---------------------------------------------------------------------------
// Update (draft only — a FINAL document is immutable; use createNewVersion)
// ---------------------------------------------------------------------------

export type UpdateDocumentInput = Partial<{
  language: TradeDocLanguage;
  currency: string;
  validUntil: Date | null;
  incoterm: string | null;
  shippingMethod: string | null;
  countryOfOrigin: string | null;
  paymentTermsOverride: string | null;
  deliveryTermsOverride: string | null;
  customerNote: string | null;
  paymentNote: string | null;
  deliveryNote: string | null;
  specialTerms: string | null;
  footerNote: string | null;
  shipToName: string | null;
  shipToAddress: string | null;
  shipToCity: string | null;
  shipToPostal: string | null;
  shipToCountry: string | null;
  showBankDetails: boolean;
  showVat: boolean;
  showHsCode: boolean;
  showCountryOrigin: boolean;
  showSignature: boolean;
  showShipping: boolean;
  signatoryId: string | null;
  bankAccountId: string | null;
}>;

async function assertEditable(id: string): Promise<{ status: TradeDocStatus }> {
  const doc = await db.tradeDocument.findUnique({ where: { id }, select: { status: true } });
  if (!doc) throw new TradeDocError("Belge bulunamadı.");
  if (doc.status !== "DRAFT") throw new TradeDocError("Sadece taslak belgeler düzenlenebilir. Yeni versiyon oluşturun.");
  return doc;
}

export async function updateDocument(id: string, input: UpdateDocumentInput, userId?: string | null): Promise<void> {
  await assertEditable(id);

  let signatoryName: string | undefined;
  let signatoryTitle: string | undefined;
  if (input.signatoryId !== undefined) {
    const sig = input.signatoryId ? await getSignatory(input.signatoryId) : null;
    signatoryName = sig ? [sig.firstName, sig.lastName].filter(Boolean).join(" ") : null as unknown as string;
    signatoryTitle = sig?.jobTitle ?? (null as unknown as string);
  }

  await db.tradeDocument.update({
    where: { id },
    data: {
      ...input,
      ...(signatoryName !== undefined ? { signatoryName, signatoryTitle } : {}),
    },
  });

  await logActivity({
    userId: userId ?? null,
    action: "os.document.update",
    entity: "TradeDocument",
    entityId: id,
    summary: "Belge güncellendi",
  });
}

export type LineMetaInput = {
  hsCode?: string | null;
  countryOfOrigin?: string | null;
  packages?: number | null;
  netWeight?: number | null;
  grossWeight?: number | null;
  dimensions?: string | null;
};

export async function updateDocumentLine(documentId: string, saleLineId: string, input: LineMetaInput): Promise<void> {
  await assertEditable(documentId);
  await db.tradeDocumentLine.update({
    where: { documentId_saleLineId: { documentId, saleLineId } },
    data: input,
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function finalizeDocument(id: string, userId?: string | null): Promise<void> {
  await assertEditable(id);
  await db.tradeDocument.update({ where: { id }, data: { status: "FINAL" } });
  await logActivity({ userId: userId ?? null, action: "os.document.finalize", entity: "TradeDocument", entityId: id, summary: "Belge kesinleştirildi" });
}

export async function cancelDocument(id: string, userId?: string | null): Promise<void> {
  await db.tradeDocument.update({ where: { id }, data: { status: "CANCELLED" } });
  await logActivity({ userId: userId ?? null, action: "os.document.cancel", entity: "TradeDocument", entityId: id, summary: "Belge iptal edildi" });
}

export async function deleteDraftDocument(id: string, userId?: string | null): Promise<void> {
  const doc = await db.tradeDocument.findUnique({ where: { id }, select: { status: true, code: true } });
  if (!doc) return;
  if (doc.status !== "DRAFT") throw new TradeDocError("Sadece taslak belgeler silinebilir.");
  await db.tradeDocument.delete({ where: { id } });
  await logActivity({ userId: userId ?? null, action: "os.document.delete", entity: "TradeDocument", entityId: id, summary: `Taslak belge silindi (${doc.code})` });
}

/** New version of the SAME document: same printed number, version+1, keeps the
 *  old row (never deleted) as history. */
export async function createNewVersion(id: string, userId?: string | null): Promise<string> {
  const src = await db.tradeDocument.findUnique({ where: { id }, include: { lines: true } });
  if (!src) throw new TradeDocError("Belge bulunamadı.");

  const newId = await db.$transaction(async (tx) => {
    const created = await tx.tradeDocument.create({
      data: {
        code: src.code,
        docType: src.docType,
        saleId: src.saleId,
        language: src.language,
        currency: src.currency,
        status: "DRAFT",
        version: src.version + 1,
        isLatest: true,
        parentDocumentId: src.id,
        issuedAt: new Date(),
        validUntil: src.validUntil,
        incoterm: src.incoterm,
        shippingMethod: src.shippingMethod,
        countryOfOrigin: src.countryOfOrigin,
        paymentTermsOverride: src.paymentTermsOverride,
        deliveryTermsOverride: src.deliveryTermsOverride,
        customerNote: src.customerNote,
        paymentNote: src.paymentNote,
        deliveryNote: src.deliveryNote,
        specialTerms: src.specialTerms,
        footerNote: src.footerNote,
        shipToName: src.shipToName,
        shipToAddress: src.shipToAddress,
        shipToCity: src.shipToCity,
        shipToPostal: src.shipToPostal,
        shipToCountry: src.shipToCountry,
        showBankDetails: src.showBankDetails,
        showVat: src.showVat,
        showHsCode: src.showHsCode,
        showCountryOrigin: src.showCountryOrigin,
        showSignature: src.showSignature,
        showShipping: src.showShipping,
        signatoryId: src.signatoryId,
        signatoryName: src.signatoryName,
        signatoryTitle: src.signatoryTitle,
        bankAccountId: src.bankAccountId,
        createdById: userId ?? null,
        lines: {
          create: src.lines.map((l) => ({
            saleLineId: l.saleLineId,
            sortOrder: l.sortOrder,
            hsCode: l.hsCode,
            countryOfOrigin: l.countryOfOrigin,
            packages: l.packages,
            netWeight: l.netWeight,
            grossWeight: l.grossWeight,
            dimensions: l.dimensions,
          })),
        },
      },
      select: { id: true },
    });
    await tx.tradeDocument.update({ where: { id: src.id }, data: { isLatest: false } });
    return created.id;
  });

  await logActivity({ userId: userId ?? null, action: "os.document.new_version", entity: "TradeDocument", entityId: newId, summary: `${src.code} — versiyon ${src.version + 1}` });
  return newId;
}

/** An independent copy under a brand-new document number — for "start a
 *  Commercial Invoice from this Proforma" style workflows, not a revision. */
export async function duplicateDocument(id: string, docType?: TradeDocType, userId?: string | null): Promise<string> {
  const src = await db.tradeDocument.findUnique({ where: { id }, include: { lines: true } });
  if (!src) throw new TradeDocError("Belge bulunamadı.");
  const targetType = docType ?? src.docType;

  const newId = await db.$transaction(async (tx) => {
    const code = await nextCode(tx, DOC_PREFIX[targetType], new Date().getFullYear());
    const created = await tx.tradeDocument.create({
      data: {
        code,
        docType: targetType,
        saleId: src.saleId,
        language: src.language,
        currency: src.currency,
        status: "DRAFT",
        version: 1,
        isLatest: true,
        issuedAt: new Date(),
        validUntil: src.validUntil,
        incoterm: src.incoterm,
        shippingMethod: src.shippingMethod,
        countryOfOrigin: src.countryOfOrigin,
        paymentTermsOverride: src.paymentTermsOverride,
        deliveryTermsOverride: src.deliveryTermsOverride,
        customerNote: src.customerNote,
        paymentNote: src.paymentNote,
        deliveryNote: src.deliveryNote,
        specialTerms: src.specialTerms,
        footerNote: src.footerNote,
        shipToName: src.shipToName,
        shipToAddress: src.shipToAddress,
        shipToCity: src.shipToCity,
        shipToPostal: src.shipToPostal,
        shipToCountry: src.shipToCountry,
        showBankDetails: src.showBankDetails,
        showVat: src.showVat,
        showHsCode: src.showHsCode,
        showCountryOrigin: src.showCountryOrigin,
        showSignature: src.showSignature,
        showShipping: src.showShipping,
        signatoryId: src.signatoryId,
        signatoryName: src.signatoryName,
        signatoryTitle: src.signatoryTitle,
        bankAccountId: src.bankAccountId,
        createdById: userId ?? null,
        lines: {
          create: src.lines.map((l) => ({
            saleLineId: l.saleLineId,
            sortOrder: l.sortOrder,
            hsCode: l.hsCode,
            countryOfOrigin: l.countryOfOrigin,
            packages: l.packages,
            netWeight: l.netWeight,
            grossWeight: l.grossWeight,
            dimensions: l.dimensions,
          })),
        },
      },
      select: { id: true },
    });
    return created.id;
  });

  await logActivity({ userId: userId ?? null, action: "os.document.duplicate", entity: "TradeDocument", entityId: newId, summary: `${src.code} kopyalandı` });
  return newId;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listDocumentsForSale(saleId: string) {
  const rows = await db.tradeDocument.findMany({
    where: { saleId },
    orderBy: [{ docType: "asc" }, { version: "desc" }],
    select: {
      id: true, code: true, docType: true, language: true, currency: true, status: true,
      version: true, isLatest: true, issuedAt: true, updatedAt: true,
    },
  });
  return rows;
}

export async function listVersions(code: string) {
  return db.tradeDocument.findMany({
    where: { code },
    orderBy: { version: "asc" },
    select: { id: true, version: true, status: true, isLatest: true, issuedAt: true, updatedAt: true, createdById: true },
  });
}

const FULL_INCLUDE = {
  sale: {
    include: {
      customer: true,
      channel: { select: { name: true } },
    },
  },
  signatory: true,
  bankAccount: true,
  lines: {
    include: { saleLine: { include: { item: true } } },
    orderBy: { sortOrder: "asc" as const },
  },
} as const;

export type TradeDocumentDTO = NonNullable<Awaited<ReturnType<typeof getDocument>>>;

export async function getDocument(id: string) {
  const doc = await db.tradeDocument.findUnique({ where: { id }, include: FULL_INCLUDE });
  if (!doc) return null;
  return toDTO(doc, await getOsSettings());
}

export async function getDocumentByCode(code: string) {
  const doc = await db.tradeDocument.findFirst({ where: { code, isLatest: true }, include: FULL_INCLUDE });
  if (!doc) return null;
  return toDTO(doc, await getOsSettings());
}

type DocWithIncludes = Prisma.TradeDocumentGetPayload<{ include: typeof FULL_INCLUDE }>;

function toDTO(doc: DocWithIncludes, settings: Awaited<ReturnType<typeof getOsSettings>>) {
  const lines = doc.lines.map((dl) => {
    const sl = dl.saleLine;
    return {
      id: dl.id,
      saleLineId: sl.id,
      sku: sl.item.sku,
      name: sl.item.name,
      unit: sl.item.unit,
      quantity: toNum(sl.quantity),
      unitPrice: toNum(sl.unitPrice),
      discountRate: toNum(sl.discountRate),
      vatRate: toNum(sl.vatRate),
      lineTotal: toNum(sl.lineTotal),
      hsCode: dl.hsCode,
      countryOfOrigin: dl.countryOfOrigin,
      packages: dl.packages,
      netWeight: toNumOrNull(dl.netWeight),
      grossWeight: toNumOrNull(dl.grossWeight),
      dimensions: dl.dimensions,
    };
  });

  const subtotal = lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const total = lines.reduce((a, l) => a + l.lineTotal, 0);
  const discountTotal = subtotal - total;
  const vatTotal = lines.reduce((a, l) => a + (l.lineTotal * l.vatRate) / 100, 0);
  const totalPackages = lines.reduce((a, l) => a + (l.packages ?? 0), 0);
  const totalNetWeight = lines.reduce((a, l) => a + (l.netWeight ?? 0), 0);
  const totalGrossWeight = lines.reduce((a, l) => a + (l.grossWeight ?? 0), 0);

  return {
    id: doc.id,
    code: doc.code,
    docType: doc.docType,
    language: doc.language,
    currency: doc.currency,
    status: doc.status,
    version: doc.version,
    isLatest: doc.isLatest,
    issuedAt: doc.issuedAt,
    validUntil: doc.validUntil,
    incoterm: doc.incoterm,
    shippingMethod: doc.shippingMethod,
    countryOfOrigin: doc.countryOfOrigin,
    paymentTermsOverride: doc.paymentTermsOverride,
    deliveryTermsOverride: doc.deliveryTermsOverride,
    customerNote: doc.customerNote,
    paymentNote: doc.paymentNote,
    deliveryNote: doc.deliveryNote,
    specialTerms: doc.specialTerms,
    footerNote: doc.footerNote ?? settings.company.defaultDocFooterNote,
    shipTo: doc.showShipping
      ? { name: doc.shipToName, address: doc.shipToAddress, city: doc.shipToCity, postal: doc.shipToPostal, country: doc.shipToCountry }
      : null,
    show: {
      bankDetails: doc.showBankDetails,
      vat: doc.showVat,
      hsCode: doc.showHsCode,
      countryOfOrigin: doc.showCountryOrigin,
      signature: doc.showSignature,
      shipping: doc.showShipping,
    },
    signatoryId: doc.signatoryId,
    bankAccountId: doc.bankAccountId,
    signatory: doc.signatory
      ? {
          name: doc.signatoryName ?? [doc.signatory.firstName, doc.signatory.lastName].filter(Boolean).join(" "),
          title: doc.signatoryTitle ?? doc.signatory.jobTitle,
          email: doc.signatory.email,
          phone: doc.signatory.phone,
          signatureUrl: doc.signatory.signatureUrl,
        }
      : doc.signatoryName
        ? { name: doc.signatoryName, title: doc.signatoryTitle, email: null, phone: null, signatureUrl: null }
        : null,
    bankAccount: doc.bankAccount,
    company: settings.company,
    sale: {
      id: doc.sale.id,
      code: doc.sale.code,
      issuedAt: doc.sale.issuedAt,
      paymentTermDays: doc.sale.paymentTermDays,
      channelName: doc.sale.channel?.name ?? null,
      customer: doc.sale.customer
        ? {
            name: doc.sale.customer.name,
            legalName: doc.sale.customer.legalName,
            address: doc.sale.customer.address,
            city: doc.sale.customer.city,
            postalCode: doc.sale.customer.postalCode,
            country: doc.sale.customer.country,
            taxNumber: doc.sale.customer.taxNumber,
            taxOffice: doc.sale.customer.taxOffice,
            email: doc.sale.customer.email,
            phone: doc.sale.customer.phone,
          }
        : null,
    },
    lines,
    totals: { subtotal, discountTotal, vatTotal, totalPackages, totalNetWeight, totalGrossWeight, total },
  };
}
