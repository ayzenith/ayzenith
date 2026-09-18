"use client";

import { useCallback, useRef, useState } from "react";
import type { FxSuggestion } from "@/server/os/fx-tcmb";

/**
 * Exchange-rate pre-fill for the document forms.
 *
 * The rate a document should carry depends on its DATE, so the suggestions are
 * re-fetched whenever the date changes. A rate the user typed is never
 * overwritten by a later suggestion — the forms track that with their own
 * "touched" flag and only re-apply to untouched fields.
 */

export type RatesByCurrency = Record<string, FxSuggestion>;

export function useFxSuggestions(
  initialDay: string,
  initialRates: RatesByCurrency,
  getRates: (day: string) => Promise<RatesByCurrency>,
) {
  const [day, setDay] = useState(initialDay);
  const [rates, setRates] = useState<RatesByCurrency>(initialRates);
  const [loading, setLoading] = useState(false);
  // Answers can arrive out of order when the date is changed quickly; only the
  // newest request is allowed to land.
  const seq = useRef(0);

  const changeDay = useCallback(
    async (next: string): Promise<RatesByCurrency | null> => {
      setDay(next);
      if (!next) return null;
      const mine = ++seq.current;
      setLoading(true);
      try {
        const r = await getRates(next);
        if (mine !== seq.current) return null;
        setRates(r);
        return r;
      } catch {
        return null;
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [getRates],
  );

  return { day, rates, loading, changeDay };
}

/** The pre-fill value for a currency: the suggested rate, or empty so the
 *  (required) field makes the user type one — never a silent "1". */
export function suggestedValue(rates: RatesByCurrency, currency: string, baseCurrency: string): string {
  if (currency === baseCurrency) return "1";
  return rates[currency]?.rate ?? "";
}

/** One line under the rate field saying where the number came from. */
export function FxNote({
  suggestion,
  touched,
  loading,
}: {
  suggestion: FxSuggestion | undefined;
  touched: boolean;
  loading: boolean;
}) {
  if (loading) return <span className="text-caption text-subtle">TCMB kuru alınıyor…</span>;
  if (!suggestion || suggestion.source === "BASE") return null;
  if (touched) {
    return (
      <span className="text-caption text-subtle">
        Elle girildi{suggestion.rate ? ` · önerilen ${suggestion.rate} (${suggestion.note})` : ""}
      </span>
    );
  }
  const warn = suggestion.source === "NONE" || suggestion.source === "MANUAL" || suggestion.stale;
  return <span className={`text-caption ${warn ? "text-warning" : "text-subtle"}`}>{suggestion.note}</span>;
}
