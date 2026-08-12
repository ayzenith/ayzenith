import "server-only";

import { db } from "@/lib/db";
import { RADAR_HS_SEED } from "@/config/radar-hs-seed";

/**
 * AYZENITH RADAR — HS mapping repository.
 *
 * The bridge between a commercial category and the HS-6 codes the trade APIs
 * speak. The critical guarantee lives here: `getVerifiedHsCodes` returns ONLY
 * codes a human has marked VERIFIED, so a NEEDS_REVIEW (or AI-suggested) code
 * can never silently enter an analysis. The admin panel reads the full list
 * (including NEEDS_REVIEW) for editing.
 */

export type HsMappingRow = {
  id: string;
  categoryKey: string;
  hs6: string;
  productGroup: string;
  verification: "VERIFIED" | "NEEDS_REVIEW";
  source: string | null;
  verifiedAt: Date | null;
  note: string | null;
};

/** Verified HS-6 codes for a category — the ONLY codes allowed into scoring. */
export async function getVerifiedHsCodes(
  categoryKey: string,
): Promise<Array<{ hs6: string; productGroup: string }>> {
  const rows = await db.radarHsMapping.findMany({
    where: { categoryKey, verification: "VERIFIED" },
    orderBy: { sortOrder: "asc" },
    select: { hs6: true, productGroup: true },
  });
  return rows;
}

/** One verified product candidate for a natural-language product search. */
export type HsMatch = {
  hs6: string;
  productGroup: string;
  categoryKey: string;
  /** Rough match strength for ranking / display. */
  matchScore: number;
};

/** Strip Turkish diacritics + lowercase, so "kulaklık" matches "kulaklik". */
function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match a natural-language product ("kablosuz kulaklık") to VERIFIED HS-6 codes.
 *
 * This is the human-owned, honest path: it ONLY ever returns codes the owner has
 * already verified (so a matched code can be analysed immediately). If the query
 * is a 6-digit code it is looked up directly. When nothing matches, the caller
 * may ask the AI for a SUGGESTION — but a suggestion is advisory only and must be
 * added + verified in the HS editor before it can enter an analysis.
 */
export async function matchVerifiedProducts(query: string, limit = 8): Promise<HsMatch[]> {
  const q = (query ?? "").trim();
  if (!q) return [];

  const rows = await db.radarHsMapping.findMany({
    where: { verification: "VERIFIED" },
    select: { hs6: true, productGroup: true, categoryKey: true },
  });

  // Direct HS-6 code entry.
  const digits = q.replace(/\D/g, "");
  if (digits.length === 6) {
    return rows
      .filter((r) => r.hs6 === digits)
      .map((r) => ({ ...r, matchScore: 100 }));
  }

  const tokens = normalizeTr(q).split(" ").filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];

  const scored = rows
    .map((r) => {
      const hay = normalizeTr(r.productGroup);
      let score = 0;
      for (const t of tokens) if (hay.includes(t)) score += t.length >= 4 ? 2 : 1;
      return { hs6: r.hs6, productGroup: r.productGroup, categoryKey: r.categoryKey, matchScore: score };
    })
    .filter((r) => r.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);

  // De-duplicate identical (hs6 + category) rows, keep best score.
  const seen = new Set<string>();
  const out: HsMatch[] = [];
  for (const r of scored) {
    const key = `${r.categoryKey}:${r.hs6}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** Every mapping for a category (incl. NEEDS_REVIEW) — for the admin editor. */
export async function listHsForCategory(categoryKey: string): Promise<HsMappingRow[]> {
  return db.radarHsMapping.findMany({
    where: { categoryKey },
    orderBy: [{ verification: "asc" }, { sortOrder: "asc" }],
  });
}

/** All mappings across all categories — admin overview. */
export async function listAllHs(): Promise<HsMappingRow[]> {
  return db.radarHsMapping.findMany({
    orderBy: [{ categoryKey: "asc" }, { sortOrder: "asc" }],
  });
}

// ----------------------------------------------------------------------------
// Mutations — used ONLY by the admin HS editor (Admin → Radar → HS Eşlemeleri).
// The owner is the source of truth for what is VERIFIED; the UI reaches these
// through a server action, never the database directly.
// ----------------------------------------------------------------------------

export type HsMappingInput = {
  categoryKey: string;
  hs6: string;
  productGroup: string;
  verification: "VERIFIED" | "NEEDS_REVIEW";
  source?: string | null;
  note?: string | null;
};

/** Add a new mapping. A code the owner adds here is theirs — if they mark it
 *  VERIFIED it gets a verifiedAt stamp and immediately becomes usable by scoring. */
export async function createHsMapping(input: HsMappingInput): Promise<HsMappingRow> {
  const count = await db.radarHsMapping.count({ where: { categoryKey: input.categoryKey } });
  return db.radarHsMapping.create({
    data: {
      categoryKey: input.categoryKey,
      hs6: input.hs6,
      productGroup: input.productGroup,
      verification: input.verification,
      source: input.source ?? null,
      note: input.note ?? null,
      verifiedAt: input.verification === "VERIFIED" ? new Date() : null,
      sortOrder: count,
    },
  });
}

/** Edit an existing mapping. Flipping to VERIFIED stamps verifiedAt; flipping
 *  back to NEEDS_REVIEW clears it (and removes the code from scoring). */
export async function updateHsMapping(
  id: string,
  input: Omit<HsMappingInput, "categoryKey">,
): Promise<HsMappingRow> {
  return db.radarHsMapping.update({
    where: { id },
    data: {
      hs6: input.hs6,
      productGroup: input.productGroup,
      verification: input.verification,
      source: input.source ?? null,
      note: input.note ?? null,
      verifiedAt: input.verification === "VERIFIED" ? new Date() : null,
    },
  });
}

export async function deleteHsMapping(id: string): Promise<void> {
  await db.radarHsMapping.delete({ where: { id } });
}

/** Count of VERIFIED codes per category — for the new-analysis screen so a
 *  category with no usable codes can be flagged before the owner runs it. */
export async function verifiedCountByCategory(): Promise<Record<string, number>> {
  const rows = await db.radarHsMapping.groupBy({
    by: ["categoryKey"],
    where: { verification: "VERIFIED" },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.categoryKey] = r._count._all;
  return out;
}

/**
 * Seed the curated mappings idempotently. Upsert by (categoryKey, hs6) so
 * re-running never duplicates and never overwrites a human's later edits to
 * verification/verifiedAt beyond re-applying the seed's baseline. VERIFIED seed
 * entries get a verifiedAt stamp; NEEDS_REVIEW entries are left unverified.
 */
export async function seedHsMappings(seedDate = new Date()): Promise<{ created: number; total: number }> {
  let created = 0;
  let total = 0;
  for (const [categoryKey, entries] of Object.entries(RADAR_HS_SEED)) {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e) continue;
      total++;
      const existing = await db.radarHsMapping.findUnique({
        where: { categoryKey_hs6: { categoryKey, hs6: e.hs6 } },
      });
      if (existing) continue; // never clobber owner edits
      await db.radarHsMapping.create({
        data: {
          categoryKey,
          hs6: e.hs6,
          productGroup: e.productGroup,
          verification: e.verification,
          source: e.source,
          verifiedAt: e.verification === "VERIFIED" ? seedDate : null,
          note: e.note ?? null,
          sortOrder: i,
        },
      });
      created++;
    }
  }
  return { created, total };
}
