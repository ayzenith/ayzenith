/**
 * AYZENITH LOGISTICS INTELLIGENCE — outlier flagging (pure, no DB, no ML).
 *
 * Median Absolute Deviation, flagged at >3x — simple, explainable, robust to
 * the skew small logistics samples always have. Flags, never deletes: a
 * "MAD_3X" outlier stays in the table, just excluded from a benchmark by
 * default, and an operator can un-flag a legitimate one later.
 */

export type ValidationMethod = "MAD_3X";

export type ValidationResult = {
  rawValue: number;
  validatedValue: number;
  outlierFlag: boolean;
  outlierReason: string | null;
  validationMethod: ValidationMethod;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2 : (sorted[mid] as number);
}

const MAD_CONSTANT = 3;

/** Flags each value in `values` that sits more than 3x the group's MAD away
 *  from the group's median. A group smaller than 4 is too small to judge —
 *  nothing is flagged, since a MAD of 2-3 points is not a statistical claim. */
export function flagOutliers(values: number[]): ValidationResult[] {
  if (values.length < 4) {
    return values.map((v) => ({
      rawValue: v,
      validatedValue: v,
      outlierFlag: false,
      outlierReason: null,
      validationMethod: "MAD_3X",
    }));
  }

  const m = median(values);
  const deviations = values.map((v) => Math.abs(v - m));
  const mad = median(deviations);

  return values.map((v) => {
    // A MAD of exactly 0 (many identical prices) would make every deviation
    // "infinite multiples" — guard against a false-positive storm.
    const multiples = mad === 0 ? (v === m ? 0 : Infinity) : Math.abs(v - m) / mad;
    const outlierFlag = multiples > MAD_CONSTANT;
    return {
      rawValue: v,
      validatedValue: v,
      outlierFlag,
      outlierReason: outlierFlag
        ? `medyandan ${multiples === Infinity ? ">" : multiples.toFixed(1) + "x"} MAD uzaklıkta`
        : null,
      validationMethod: "MAD_3X",
    };
  });
}
