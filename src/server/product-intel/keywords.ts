/**
 * PRODUCT INTELLIGENCE — keyword extraction (pure: no DB, no network, no AI).
 *
 * The words a marketplace's own sellers put in their titles are data, not
 * inspiration. They are counted here, deterministically, BEFORE any model sees
 * anything — which is what stops Title Lab from being a language model guessing
 * at Turkish e-commerce vocabulary.
 *
 * Two counts per term, and the second one matters more:
 *   offerCount  — how many listings used it
 *   sellerCount — how many DIFFERENT sellers used it
 * One seller with forty listings can make a word look universal. Ranking by
 * distinct sellers is what separates a market convention from one shop's habit.
 *
 * Tokenising and stop-words are Import Intelligence's (`import/text.ts`), so
 * "kulaklıklar" and "kulaklık" meet here exactly as they do there.
 */

import { normalizeText, stem, tokenize } from "../import/text";

export type KeywordStat = {
  term: string;
  /** The most common surface form seen, for display. */
  display: string;
  offerCount: number;
  sellerCount: number;
  /** Share of the scanned offers, 0–100. */
  offerPct: number;
  /** 2 for a two-word phrase, 1 for a single word. */
  words: number;
  /** True when our own product's text already contains this term. */
  ours: boolean;
};

export type KeywordReport = {
  totalOffers: number;
  distinctSellers: number;
  terms: KeywordStat[];
  /** Terms the market uses often that our own text does NOT contain — the
   *  concrete "what am I not saying" list. */
  missingFromOurs: KeywordStat[];
  notes: string[];
};

/** Words that survive the shared stop-list but still carry no product meaning
 *  in a marketplace title. Kept here rather than in import/text.ts because they
 *  are a listing-copy problem, not a tariff-wording one. */
const LISTING_NOISE = new Set([
  "kargo", "ucretsiz", "hizli", "stokta", "kaliteli", "super", "mega", "ozel", "firsat", "kampanya",
  "indirim", "garanti", "faturali", "orjinal", "orijinal", "ithal", "yerli", "uygun", "fiyat",
  "tl", "adet", "yeni", "trendyol", "amazon", "hepsiburada",
]);

function termsOf(title: string): string[] {
  const tokens = tokenize(title).filter((t) => !LISTING_NOISE.has(t));
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const a = stem(tokens[i]!);
    if (a.length >= 3) out.push(a);
    // Bigrams keep phrases like "el vantilatoru" and "sarj edilebilir" whole,
    // which single words would lose.
    if (i + 1 < tokens.length) {
      const b = stem(tokens[i + 1]!);
      if (a.length >= 2 && b.length >= 2) out.push(`${a} ${b}`);
    }
  }
  return out;
}

export function extractKeywords(args: {
  offers: Array<{ title: string; sellerName: string | null }>;
  /** Our own product text, so a term can be marked as already used by us. */
  ourText: string;
  limit?: number;
  /** A term must appear in at least this many offers to be reported. */
  minOfferCount?: number;
}): KeywordReport {
  const limit = args.limit ?? 40;
  const minOfferCount = args.minOfferCount ?? 2;
  const notes: string[] = [];

  const ourNormalized = normalizeText(args.ourText);
  const ourStems = new Set(tokenize(args.ourText).map(stem));

  const offerCounts = new Map<string, number>();
  const sellerSets = new Map<string, Set<string>>();
  const displays = new Map<string, Map<string, number>>();
  const sellers = new Set<string>();

  for (const offer of args.offers) {
    const seller = offer.sellerName?.trim() || `__anon_${offerCounts.size}_${offer.title.slice(0, 12)}`;
    sellers.add(seller);
    const seen = new Set(termsOf(offer.title));
    for (const term of seen) {
      offerCounts.set(term, (offerCounts.get(term) ?? 0) + 1);
      if (!sellerSets.has(term)) sellerSets.set(term, new Set());
      sellerSets.get(term)!.add(seller);
      if (!displays.has(term)) displays.set(term, new Map());
      const raw = surfaceForm(offer.title, term);
      if (raw) displays.get(term)!.set(raw, (displays.get(term)!.get(raw) ?? 0) + 1);
    }
  }

  const total = args.offers.length;
  const terms: KeywordStat[] = [];
  for (const [term, offerCount] of offerCounts) {
    if (offerCount < minOfferCount) continue;
    const forms = displays.get(term);
    const display =
      forms && forms.size > 0 ? [...forms.entries()].sort((a, b) => b[1] - a[1])[0]![0] : term;
    const words = term.includes(" ") ? 2 : 1;
    const ours = words === 1 ? ourStems.has(term) : ourNormalized.includes(term.split(" ")[0]!) && ourNormalized.includes(term.split(" ")[1]!);
    terms.push({
      term,
      display,
      offerCount,
      sellerCount: sellerSets.get(term)?.size ?? 0,
      offerPct: total === 0 ? 0 : Math.round((offerCount / total) * 1000) / 10,
      words,
      ours,
    });
  }

  // Distinct sellers first — a market convention, not one shop's habit. Then
  // longer phrases ahead of single words at equal weight, because "el
  // vantilatoru" tells a buyer more than "vantilator".
  terms.sort((a, b) => b.sellerCount - a.sellerCount || b.offerCount - a.offerCount || b.words - a.words);

  const top = terms.slice(0, limit);
  if (total === 0) notes.push("Rakip ilan girilmediği için kelime analizi yapılamadı.");
  else if (sellers.size < 3) notes.push("Az sayıda farklı satıcı var; kelime sıklıkları bir satıcının alışkanlığını yansıtıyor olabilir.");

  return {
    totalOffers: total,
    distinctSellers: sellers.size,
    terms: top,
    missingFromOurs: top.filter((t) => !t.ours && t.offerPct >= 20).slice(0, 12),
    notes,
  };
}

/** Find the words in the original title that produced a stemmed term, so the
 *  screen shows "vantilatörü" rather than the stem "vantilator". */
function surfaceForm(title: string, term: string): string | null {
  const parts = term.split(" ");
  const raw = title.split(/\s+/);
  for (let i = 0; i < raw.length; i += 1) {
    const window = raw.slice(i, i + parts.length);
    if (window.length < parts.length) break;
    const stems = window.map((w) => stem(normalizeText(w)));
    if (stems.join(" ") === term) return window.join(" ");
  }
  return null;
}
