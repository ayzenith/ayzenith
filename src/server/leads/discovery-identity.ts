/**
 * AYZENITH LEAD FINDER — what makes two discoveries "the same".
 *
 * WHY THIS FILE EXISTS
 *
 * `saveDiscovery` used to open a brand-new LeadSearch on every run and write
 * every firm it found as a brand-new LeadCompany, without ever looking at what
 * was already stored. Running the same search again therefore copied its whole
 * result set: "kadın iç giyim / Berlin" was run about nine times, and a
 * read-only audit found 3,784 company rows standing for roughly 868 real firms.
 *
 * Two keys fix that, and both live here because they are JUDGEMENTS — what
 * counts as the same search question, what counts as the same firm — and
 * judgements belong somewhere they can be tested.
 *
 *   searchContextKey   A verdict (productFit, leadScore, modelFit) is relative to
 *                      the question it answers, so "the same search" means the
 *                      same product, country, city, business model, lead types
 *                      and RADAR origin. Spelling noise (case, spacing, "İ" vs
 *                      "i") is not a different question.
 *
 *   companyIdentityKey Inside one search, a firm is its website host when it has
 *                      one; otherwise its name at its place. With neither, there
 *                      is nothing safe to match on and the key is null — a
 *                      possible duplicate is a smaller harm than silently
 *                      merging two different firms.
 *
 * Deliberately NO `server-only`: this is decision logic and must be testable.
 */

/** Case-, accent- and whitespace-insensitive form of free text. Turkish "ı"
 *  has no decomposition, so it is mapped explicitly; otherwise "KADIN" and
 *  "kadın" would be different questions. */
function squash(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .trim()
    .replace(/\s+/g, " ");
}

const LEGAL_FORMS =
  /\b(gmbh|mbh|ag|kg|ohg|gbr|ug|ek|e k|co|spa|s p a|srl|s r l|bv|nv|ltd|inc|llc|sa|sas|sarl|limited)\b/g;

function normName(name: string | null | undefined): string {
  return squash(name)
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(LEGAL_FORMS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Search context
// ---------------------------------------------------------------------------

export type SearchContextInput = {
  country: string;
  city: string | null | undefined;
  productQuery: string;
  businessModel: string;
  leadTypes: unknown;
  radarSnapshotId: string | null | undefined;
};

export function searchContextKey(s: SearchContextInput): string {
  const types = Array.isArray(s.leadTypes)
    ? [...new Set((s.leadTypes as unknown[]).map((t) => String(t)))].sort()
    : [];
  return JSON.stringify([
    squash(s.productQuery),
    (s.country ?? "").trim().toUpperCase(),
    squash(s.city),
    (s.businessModel ?? "").trim().toUpperCase(),
    types,
    s.radarSnapshotId ?? "",
  ]);
}

export type ExistingSearch = SearchContextInput & { id: string; createdAt: Date };

/**
 * The search a new run of `draft` should write into, or null to open a new one.
 *
 * When several stored searches share the context — which is the state the
 * database is already in, from the runs before this fix — the most recent one
 * is reused. The older ones are left exactly as they are: what to do with them
 * is a separate decision, not a side effect of running a search.
 */
export function pickReusableSearch(existing: ExistingSearch[], draft: SearchContextInput): string | null {
  const key = searchContextKey(draft);
  const matches = existing
    .filter((s) => searchContextKey(s) === key)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : 1));
  return matches[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Company identity inside one search
// ---------------------------------------------------------------------------

export type IdentityInput = {
  domain?: string | null;
  website?: string | null;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
};

/** Host of a domain or website, without scheme, path or a leading "www.". */
export function hostOf(domain: string | null | undefined, website: string | null | undefined): string | null {
  const raw = (domain ?? website ?? "").trim();
  if (!raw) return null;
  try {
    const host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./i, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function companyIdentityKey(c: IdentityInput): string | null {
  const host = hostOf(c.domain, c.website);
  if (host) return `web:${host}`;

  const name = normName(c.name);
  if (!name) return null;

  // Three decimals is about 110 m: the same OSM object re-discovered lands on
  // the same key, while two same-named shops in different streets do not. A
  // pair that straddles a rounding boundary gets two keys — a duplicate, never
  // a wrong merge.
  if (c.latitude != null && c.longitude != null && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
    return `geo:${name}@${c.latitude.toFixed(3)},${c.longitude.toFixed(3)}`;
  }
  const address = squash(c.address);
  if (address) return `addr:${name}@${address}`;
  return null;
}

// ---------------------------------------------------------------------------
// The write plan
// ---------------------------------------------------------------------------

export type CompanyWritePlan<T> = {
  /** Drafts to write as new rows. */
  toCreate: T[];
  /** Drafts the search already holds — left untouched. */
  alreadyKnown: number;
  /** Drafts repeated inside this very batch — written once. */
  duplicateInBatch: number;
};

/**
 * Split a batch of drafts into new firms and firms the search already holds.
 *
 * An existing row is never rewritten from a discovery draft. Discovery is the
 * cheapest, least verified look the pipeline takes — a draft may be unverified
 * because the run hit its crawl budget — and letting it overwrite a row that a
 * re-check has since verified would destroy better evidence with worse. Keeping
 * a stored row fresh is the job of the re-verification path, which reads the
 * site deliberately.
 */
export function planCompanyWrites<T>(
  existingKeys: Iterable<string | null>,
  drafts: T[],
  keyOf: (draft: T) => string | null,
): CompanyWritePlan<T> {
  const known = new Set<string>();
  for (const k of existingKeys) if (k) known.add(k);

  const inBatch = new Set<string>();
  const toCreate: T[] = [];
  let alreadyKnown = 0;
  let duplicateInBatch = 0;

  for (const draft of drafts) {
    const key = keyOf(draft);
    if (key == null) {
      toCreate.push(draft);
      continue;
    }
    if (known.has(key)) {
      alreadyKnown++;
      continue;
    }
    if (inBatch.has(key)) {
      duplicateInBatch++;
      continue;
    }
    inBatch.add(key);
    toCreate.push(draft);
  }

  return { toCreate, alreadyKnown, duplicateInBatch };
}
