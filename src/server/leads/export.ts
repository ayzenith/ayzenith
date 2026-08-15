import "server-only";

import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import {
  LEAD_ROLE_LABELS, SIZE_LABELS, PRODUCT_FIT_LABELS, STATUS_LABELS,
  SOURCE_TYPE_LABELS, SIGNAL_STRENGTH_LABELS, DETECTED_MODEL_LABELS,
  WEBSITE_STATUS_LABELS, PRIORITY_LABELS, qualifiedPriority,
} from "@/config/leads";
import { buildWhyLead, positiveWhy } from "@/components/admin/leads/why";
import type { LeadSearchView } from "./leads";

/**
 * AYZENITH LEAD FINDER — export builder (§27/§28).
 *
 * Produces a real, multi-sheet .xlsx (via exceljs, server-side only) and a
 * single-table CSV. It exports EXACTLY the companies it is given (the caller has
 * already applied the on-screen filters), preserves source URLs and last-checked
 * dates, and never fabricates an empty field — a missing value is left blank, not
 * invented. Deduplication already happened upstream, so no row appears twice.
 */

export type ExportCompany = {
  id: string;
  name: string;
  legalName: string | null;
  domain: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  country: string;
  city: string | null;
  address: string | null;
  postalCode: string | null;
  commercialRoles: string[];
  size: string;
  productFit: string;
  detectedModel: string | null;
  modelFit: string | null;
  websiteStatus: string | null;
  storeCount: number | null;
  sizeSignals: unknown;
  employeeCount: number | null;
  locationCount: number;
  verifiedAt: Date | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  xUrl: string | null;
  socialMatchStatus: string | null;
  socialProductSignal: string | null;
  socialBusinessSignal: string | null;
  socialVerifiedAt: Date | null;
  leadScore: number | null;
  leadConfidence: number | null;
  status: string;
  discoveredVia: string;
  lastCheckedAt: Date;
  discoveredAt: Date;
  locations: Array<{
    name: string | null; address: string | null; city: string | null;
    postalCode: string | null; phone: string | null; sourceUrl: string | null;
  }>;
  contacts: Array<{
    firstName: string | null; lastName: string | null; role: string | null;
    roleVerified: boolean; corporateEmail: string | null; profileUrl: string | null;
    confidence: number; sourceType: string; sourceUrl: string | null; lastCheckedAt: Date;
  }>;
  sources: Array<{
    dataField: string; sourceType: string; label: string | null;
    sourceUrl: string | null; collectedAt: Date; lastCheckedAt: Date;
  }>;
  signals: Array<{ kind: string; strength: string; note: string | null }>;
};

/** Fetch the full export shape for a set of company ids, preserving the caller's
 *  order (which already reflects the on-screen ranking + filters). */
export async function getCompaniesForExport(ids: string[]): Promise<ExportCompany[]> {
  if (ids.length === 0) return [];
  const rows = await db.leadCompany.findMany({
    where: { id: { in: ids } },
    include: {
      contacts: { orderBy: { confidence: "desc" } },
      sources: { orderBy: { collectedAt: "asc" } },
      signals: true,
      locations: true,
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: ExportCompany[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) continue;
    out.push({
      id: c.id,
      name: c.name,
      legalName: c.legalName,
      domain: c.domain,
      website: c.website,
      phone: c.phone,
      email: c.email,
      country: c.country,
      city: c.city,
      address: c.address,
      postalCode: c.postalCode,
      commercialRoles: Array.isArray(c.commercialRoles) ? (c.commercialRoles as string[]) : [],
      size: c.size,
      productFit: c.productFit,
      detectedModel: c.detectedModel,
      modelFit: c.modelFit,
      websiteStatus: c.websiteStatus,
      storeCount: c.storeCount,
      sizeSignals: c.sizeSignals,
      employeeCount: c.employeeCount,
      locationCount: c.locationCount,
      verifiedAt: c.verifiedAt,
      instagramUrl: c.instagramUrl,
      facebookUrl: c.facebookUrl,
      linkedinUrl: c.linkedinUrl,
      tiktokUrl: c.tiktokUrl,
      youtubeUrl: c.youtubeUrl,
      xUrl: c.xUrl,
      socialMatchStatus: c.socialMatchStatus,
      socialProductSignal: c.socialProductSignal,
      socialBusinessSignal: c.socialBusinessSignal,
      socialVerifiedAt: c.socialVerifiedAt,
      leadScore: c.leadScore,
      leadConfidence: c.leadConfidence,
      status: c.status,
      discoveredVia: c.discoveredVia,
      lastCheckedAt: c.lastCheckedAt,
      discoveredAt: c.discoveredAt,
      locations: c.locations.map((l) => ({
        name: l.name, address: l.address, city: l.city,
        postalCode: l.postalCode, phone: l.phone, sourceUrl: l.sourceUrl,
      })),
      contacts: c.contacts.map((p) => ({
        firstName: p.firstName, lastName: p.lastName, role: p.role,
        roleVerified: p.roleVerified, corporateEmail: p.corporateEmail, profileUrl: p.profileUrl,
        confidence: p.confidence, sourceType: p.source, sourceUrl: p.sourceUrl, lastCheckedAt: p.lastCheckedAt,
      })),
      sources: c.sources.map((s) => ({
        dataField: s.dataField, sourceType: s.sourceType, label: s.label,
        sourceUrl: s.sourceUrl, collectedAt: s.collectedAt, lastCheckedAt: s.lastCheckedAt,
      })),
      signals: c.signals.map((g) => ({ kind: g.kind, strength: g.strength, note: g.note })),
    });
  }
  return out;
}

function rolesLabel(roles: string[]): string {
  return roles.filter((r) => r !== "other").map((r) => LEAD_ROLE_LABELS[r] ?? r).join(" · ");
}
function signalsLabel(signals: ExportCompany["signals"]): string {
  return signals.map((s) => `${s.kind}: ${SIGNAL_STRENGTH_LABELS[s.strength] ?? s.strength}`).join("; ");
}
function isoDate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}
function isoDateOpt(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}
function primarySourceUrl(c: ExportCompany): string {
  return c.sources[0]?.sourceUrl ?? c.website ?? "";
}

/** GATED priority label for export (§7) — identical gate to the on-screen card. */
function priorityLabelOf(c: ExportCompany): string {
  const hasContact = c.contacts.length > 0 || Boolean(c.email) || Boolean(c.phone);
  return PRIORITY_LABELS[
    qualifiedPriority({
      leadScore: c.leadScore, modelFit: c.modelFit, productFit: c.productFit,
      websiteStatus: c.websiteStatus, hasContact,
    })
  ];
}

/** Deterministic "Why This Lead" one-liner (positive reasons only) for export. */
function whyLine(c: ExportCompany, businessModel: string): string {
  return positiveWhy(
    buildWhyLead({
      businessModel, productFit: c.productFit, modelFit: c.modelFit,
      websiteStatus: c.websiteStatus, hasEmail: Boolean(c.email), hasPhone: Boolean(c.phone),
      contactCount: c.contacts.length, socialMatchStatus: c.socialMatchStatus,
      hasInstagram: Boolean(c.instagramUrl), hasLinkedin: Boolean(c.linkedinUrl),
    }),
  )
    .map((r) => `${r.label}: ${r.detail}`)
    .join(" · ");
}

// ---------------------------------------------------------------------------
// XLSX — three sheets: Leads, Contacts, Sources (§27).
// ---------------------------------------------------------------------------

export async function buildXlsx(search: LeadSearchView, companies: ExportCompany[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AYZENITH Lead Finder";
  wb.created = new Date();

  const leads = wb.addWorksheet("Leads");
  leads.columns = [
    { header: "Company", key: "company", width: 32 },
    { header: "Country", key: "country", width: 14 },
    { header: "City", key: "city", width: 16 },
    { header: "Address", key: "address", width: 30 },
    { header: "Website", key: "website", width: 28 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "Email", key: "email", width: 24 },
    { header: "Commercial Roles", key: "roles", width: 28 },
    { header: "Business Size", key: "size", width: 14 },
    { header: "Business Model", key: "model", width: 14 },
    { header: "Model Fit", key: "modelfit", width: 14 },
    { header: "Product", key: "product", width: 22 },
    { header: "HS Code", key: "hs", width: 12 },
    { header: "Product Fit", key: "fit", width: 16 },
    { header: "Website Status", key: "webstatus", width: 15 },
    { header: "Store Count", key: "stores", width: 11 },
    { header: "Employee Count", key: "employees", width: 14 },
    { header: "Zincir Şube (ülke, OSM)", key: "chainOutlets", width: 22 },
    { header: "Locations", key: "locations", width: 10 },
    { header: "Lead Score", key: "score", width: 11 },
    { header: "Priority", key: "priority", width: 18 },
    { header: "Lead Confidence", key: "confidence", width: 15 },
    { header: "Why This Lead", key: "why", width: 60 },
    { header: "Commercial Signals", key: "signals", width: 24 },
    { header: "Instagram", key: "instagram", width: 32 },
    { header: "Facebook", key: "facebook", width: 32 },
    { header: "LinkedIn", key: "linkedin", width: 32 },
    { header: "TikTok", key: "tiktok", width: 28 },
    { header: "YouTube", key: "youtube", width: 28 },
    { header: "X", key: "x", width: 28 },
    { header: "Social Match", key: "socialmatch", width: 14 },
    { header: "Social Verified At", key: "socialverified", width: 16 },
    { header: "Source", key: "source", width: 18 },
    { header: "Source URL", key: "sourceUrl", width: 40 },
    { header: "Collected At", key: "collected", width: 14 },
    { header: "Verified At", key: "verified", width: 14 },
    { header: "Last Checked At", key: "checked", width: 14 },
    { header: "Status", key: "status", width: 16 },
  ];
  for (const c of companies) {
    leads.addRow({
      company: c.name,
      country: c.country,
      city: c.city ?? "",
      address: [c.address, c.postalCode].filter(Boolean).join(", "),
      website: c.website ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      roles: rolesLabel(c.commercialRoles),
      size: SIZE_LABELS[c.size] ?? c.size,
      model: c.detectedModel ? (DETECTED_MODEL_LABELS[c.detectedModel] ?? c.detectedModel) : "",
      modelfit: c.modelFit ?? "",
      product: search.productQuery,
      hs: search.hs6 ?? "",
      fit: PRODUCT_FIT_LABELS[c.productFit] ?? c.productFit,
      webstatus: c.websiteStatus ? (WEBSITE_STATUS_LABELS[c.websiteStatus] ?? c.websiteStatus) : "",
      stores: c.storeCount ?? "",
      chainOutlets: chainOutlets(c.sizeSignals),
      employees: c.employeeCount ?? "",
      locations: c.locationCount ?? 1,
      score: c.leadScore ?? "",
      priority: priorityLabelOf(c),
      confidence: c.leadConfidence != null ? `${c.leadConfidence}%` : "",
      why: whyLine(c, search.businessModel),
      signals: signalsLabel(c.signals),
      instagram: c.instagramUrl ?? "",
      facebook: c.facebookUrl ?? "",
      linkedin: c.linkedinUrl ?? "",
      tiktok: c.tiktokUrl ?? "",
      youtube: c.youtubeUrl ?? "",
      x: c.xUrl ?? "",
      socialmatch: c.socialMatchStatus ?? "",
      socialverified: isoDateOpt(c.socialVerifiedAt),
      source: SOURCE_TYPE_LABELS[c.discoveredVia] ?? c.discoveredVia,
      sourceUrl: primarySourceUrl(c),
      collected: isoDate(c.discoveredAt),
      verified: isoDateOpt(c.verifiedAt),
      checked: isoDate(c.lastCheckedAt),
      status: STATUS_LABELS[c.status] ?? c.status,
    });
  }

  const contacts = wb.addWorksheet("Contacts");
  contacts.columns = [
    { header: "Company", key: "company", width: 32 },
    { header: "First Name", key: "first", width: 16 },
    { header: "Last Name", key: "last", width: 16 },
    { header: "Role", key: "role", width: 22 },
    { header: "Corporate Email", key: "email", width: 26 },
    { header: "Professional Profile", key: "profile", width: 34 },
    { header: "Confidence", key: "confidence", width: 12 },
    { header: "Source", key: "source", width: 18 },
    { header: "Source URL", key: "sourceUrl", width: 40 },
    { header: "Last Checked At", key: "checked", width: 14 },
  ];
  for (const c of companies) {
    for (const p of c.contacts) {
      contacts.addRow({
        company: c.name,
        first: p.firstName ?? "",
        last: p.lastName ?? "",
        role: p.roleVerified && p.role ? p.role : "",
        email: p.corporateEmail ?? "",
        profile: p.profileUrl ?? "",
        confidence: `${p.confidence}%`,
        source: SOURCE_TYPE_LABELS[p.sourceType] ?? p.sourceType,
        sourceUrl: p.sourceUrl ?? "",
        checked: isoDate(p.lastCheckedAt),
      });
    }
  }

  const sources = wb.addWorksheet("Sources");
  sources.columns = [
    { header: "Company", key: "company", width: 32 },
    { header: "Data Field", key: "field", width: 18 },
    { header: "Source", key: "source", width: 20 },
    { header: "Source URL", key: "sourceUrl", width: 44 },
    { header: "Collected At", key: "collected", width: 14 },
    { header: "Last Checked At", key: "checked", width: 14 },
  ];
  for (const c of companies) {
    for (const s of c.sources) {
      sources.addRow({
        company: c.name,
        field: s.dataField,
        source: s.label ?? (SOURCE_TYPE_LABELS[s.sourceType] ?? s.sourceType),
        sourceUrl: s.sourceUrl ?? "",
        collected: isoDate(s.collectedAt),
        checked: isoDate(s.lastCheckedAt),
      });
    }
  }

  // Locations sheet (§9) — branches of multi-location companies.
  const locations = wb.addWorksheet("Locations");
  locations.columns = [
    { header: "Company", key: "company", width: 32 },
    { header: "Branch Name", key: "name", width: 24 },
    { header: "Address", key: "address", width: 30 },
    { header: "City", key: "city", width: 16 },
    { header: "Postal Code", key: "postal", width: 12 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "Source URL", key: "sourceUrl", width: 44 },
  ];
  for (const c of companies) {
    for (const l of c.locations) {
      locations.addRow({
        company: c.name,
        name: l.name ?? "",
        address: l.address ?? "",
        city: l.city ?? "",
        postal: l.postalCode ?? "",
        phone: l.phone ?? "",
        sourceUrl: l.sourceUrl ?? "",
      });
    }
  }

  // Bold header rows on every sheet.
  for (const ws of [leads, contacts, sources, locations]) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// CSV — the Leads table (§28). Quoted fields, CRLF, UTF-8 (BOM added by route).
// ---------------------------------------------------------------------------

const CSV_HEADER = [
  "Company", "Country", "City", "Address", "Website", "Phone", "Email",
  "Commercial Roles", "Business Size", "Business Model", "Model Fit", "Product", "HS Code",
  "Product Fit", "Website Status", "Store Count", "Employee Count", "Zincir Şube (ülke, OSM)", "Locations",
  "Lead Score", "Priority", "Lead Confidence", "Why This Lead", "Commercial Signals",
  "Instagram", "Facebook", "LinkedIn", "Social Match",
  "Source", "Source URL", "Collected At", "Verified At", "Last Checked At", "Status",
];

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildCsv(search: LeadSearchView, companies: ExportCompany[]): string {
  const lines = [CSV_HEADER.map(csvCell).join(",")];
  for (const c of companies) {
    lines.push(
      [
        c.name,
        c.country,
        c.city ?? "",
        [c.address, c.postalCode].filter(Boolean).join(", "),
        c.website ?? "",
        c.phone ?? "",
        c.email ?? "",
        rolesLabel(c.commercialRoles),
        SIZE_LABELS[c.size] ?? c.size,
        c.detectedModel ? (DETECTED_MODEL_LABELS[c.detectedModel] ?? c.detectedModel) : "",
        c.modelFit ?? "",
        search.productQuery,
        search.hs6 ?? "",
        PRODUCT_FIT_LABELS[c.productFit] ?? c.productFit,
        c.websiteStatus ? (WEBSITE_STATUS_LABELS[c.websiteStatus] ?? c.websiteStatus) : "",
        c.storeCount ?? "",
        c.employeeCount ?? "",
        chainOutlets(c.sizeSignals),
        c.locationCount ?? 1,
        c.leadScore ?? "",
        priorityLabelOf(c),
        c.leadConfidence != null ? `${c.leadConfidence}%` : "",
        whyLine(c, search.businessModel),
        signalsLabel(c.signals),
        c.instagramUrl ?? "",
        c.facebookUrl ?? "",
        c.linkedinUrl ?? "",
        c.socialMatchStatus ?? "",
        SOURCE_TYPE_LABELS[c.discoveredVia] ?? c.discoveredVia,
        primarySourceUrl(c),
        isoDate(c.discoveredAt),
        isoDateOpt(c.verifiedAt),
        isoDate(c.lastCheckedAt),
        STATUS_LABELS[c.status] ?? c.status,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

/** Country-wide chain outlet count from the size-evidence signals (§V3.5).
 *  Empty when the firm was never measured OR OSM has no chain record for it —
 *  both are "not measured", and neither may be exported as a 0. */
function chainOutlets(sizeSignals: unknown): string {
  if (!Array.isArray(sizeSignals)) return "";
  const row = (sizeSignals as Array<{ label?: string; value?: string }>).find((s) =>
    s?.label?.startsWith("Ülke genelinde şube"),
  );
  if (!row?.value || !/^\d+$/.test(row.value)) return "";
  return row.value;
}
