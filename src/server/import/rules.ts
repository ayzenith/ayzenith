/**
 * IMPORT INTELLIGENCE — date-aware rule lookup (pure).
 *
 * A duty is a function of GTİP + origin + DATE. A rule is only applied to an
 * import date inside its own validity window, and a rule read from a
 * CONSOLIDATED text is only certain from its consolidation date on: for an
 * earlier date the text in force at the time may have differed, and the
 * lookup says so instead of quietly applying today's rate to the past.
 */

export type RuleLike = {
  id: string;
  gtipPrefix: string;
  originCountry: string | null;
  validFrom: Date;
  validUntil: Date | null;
  status: string;
  sourceKey: string;
  sourceVersion: string | null;
  consolidatedAsOf: Date | null;
};

export type TemporalStatus =
  | "IN_FORCE" // the date is inside the window and on/after the consolidation point
  | "CONSOLIDATED_LATER" // inside the window but before the consolidation point
  | "FUTURE_DATE" // after the date the source version was fetched
  | "OUT_OF_RANGE"; // no loaded version covers the date

export type RuleLookup<R extends RuleLike> =
  | { status: "EXACT" | "PREFIX"; rule: R; temporal: TemporalStatus; note: string | null }
  | { status: "SPLIT"; rules: R[]; temporal: TemporalStatus; note: string }
  | { status: "NOT_LISTED"; note: string }
  | { status: "OUT_OF_RANGE"; nearest: R | null; note: string };

const fmt = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join(".");

export function temporalStatus(rule: RuleLike, date: Date, fetchedAt: Date | null): TemporalStatus {
  if (date < rule.validFrom) return "OUT_OF_RANGE";
  if (rule.validUntil && date > rule.validUntil) return "OUT_OF_RANGE";
  if (rule.consolidatedAsOf && date < rule.consolidatedAsOf) return "CONSOLIDATED_LATER";
  if (fetchedAt && date > fetchedAt) return "FUTURE_DATE";
  return "IN_FORCE";
}

export function temporalNote(status: TemporalStatus, rule: RuleLike, fetchedAt: Date | null): string | null {
  switch (status) {
    case "CONSOLIDATED_LATER":
      return `Kural, ${fmt(rule.consolidatedAsOf!)} tarihine kadarki değişiklikleri içeren konsolide metinden okundu. Seçilen tarihte yürürlükteki oran farklı olabilir — o tarihin Resmî Gazete metniyle doğrulayın.`;
    case "FUTURE_DATE":
      return `İthalat tarihi, kaynağın alındığı tarihten (${fetchedAt ? fmt(fetchedAt) : "?"}) sonra. O tarihe kadar mevzuat değişebilir.`;
    case "OUT_OF_RANGE":
      return `Bu tarih için yüklü kural sürümü yok (yüklü sürüm: ${fmt(rule.validFrom)}${rule.validUntil ? ` – ${fmt(rule.validUntil)}` : " sonrası"}).`;
    default:
      return null;
  }
}

/**
 * Resolve the rule for one GTİP on one date. Exact 12-digit rules win; a
 * shorter prefix (anti-dumping lists state 4–10 digits) applies to every line
 * under it. When the list is split more finely than the code asked for
 * (8518.30.00.90.00 asked, 8518.30.00.90.11 and .19 listed) the result is
 * SPLIT — two official texts disagree about the 12th digit, and both are shown.
 */
export function resolveRule<R extends RuleLike>(rules: R[], gtip: string, date: Date, fetchedAt: Date | null, opts: { splitFrom?: number } = {}): RuleLookup<R> {
  const matching = rules.filter((r) => gtip.startsWith(r.gtipPrefix));
  const inWindow = (r: R) => date >= r.validFrom && (!r.validUntil || date <= r.validUntil);

  if (matching.length > 0) {
    const valid = matching.filter(inWindow);
    if (valid.length === 0) {
      const nearest = [...matching].sort((a, b) => Math.abs(a.validFrom.getTime() - date.getTime()) - Math.abs(b.validFrom.getTime() - date.getTime()))[0] ?? null;
      return { status: "OUT_OF_RANGE", nearest, note: nearest ? temporalNote("OUT_OF_RANGE", nearest, fetchedAt)! : "Bu tarih için kural yok." };
    }
    // Longest prefix wins; among equals, the latest version.
    const best = [...valid].sort((a, b) => b.gtipPrefix.length - a.gtipPrefix.length || b.validFrom.getTime() - a.validFrom.getTime())[0]!;
    const temporal = temporalStatus(best, date, fetchedAt);
    return { status: best.gtipPrefix.length === gtip.length ? "EXACT" : "PREFIX", rule: best, temporal, note: temporalNote(temporal, best, fetchedAt) };
  }

  const splitFrom = opts.splitFrom ?? 10;
  const finer = rules.filter((r) => r.gtipPrefix.length > splitFrom && r.gtipPrefix.startsWith(gtip.slice(0, splitFrom)) && inWindow(r));
  if (finer.length > 0) {
    const temporal = temporalStatus(finer[0]!, date, fetchedAt);
    return {
      status: "SPLIT",
      rules: finer,
      temporal,
      note: `Tarife cetvelindeki ${gtip} kodu bu listede yok; liste aynı yeri ${finer.map((r) => r.gtipPrefix).join(", ")} olarak bölmüş. Kaynaklar 12. hanede farklı — güncel TGTC değişikliğiyle doğrulayın.`,
    };
  }
  return { status: "NOT_LISTED", note: "Bu GTİP listede yer almıyor." };
}
