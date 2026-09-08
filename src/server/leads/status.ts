/**
 * AYZENITH LEAD FINDER — the lead status rule, in one place.
 *
 * WHY THIS FILE EXISTS
 *
 * The transition from a score to a status ("is this a QUALIFIED lead?") was
 * written out twice, identically, in `run.ts` and `reverify.ts`. Duplicated
 * decision logic is how the two paths drift, and it is also why the evidence
 * floor below had nowhere to live: any fix had to be made — and remembered —
 * in both copies.
 *
 * THE FLOOR. Scoring deliberately keeps two numbers apart (see `scoring.ts`):
 * `leadScore` is commercial SUITABILITY, `overallConfidence` is how much of it
 * we actually verified. Nothing made the first defer to the second, so a firm
 * could be published as QUALIFIED on 4% evidence. The live 50-row backfill
 * found exactly that: a Nike outlet promoted to QUALIFIED at 4% and an Apple
 * Store sitting at QUALIFIED with 18%, because a large chain's homepage
 * satisfies every structural signal `leadScore` is built from while saying
 * nothing at all about the product line being sold into.
 *
 * The rule is a floor on measured evidence rather than a list of brands to
 * exclude, for two reasons: it fires on the next such firm without anyone
 * having heard of it first, and it lifts by itself as soon as a firm's evidence
 * improves. It changes ONLY the status; how `overallConfidence` and the
 * identity/product confidences are computed is untouched.
 *
 * Deliberately NO `server-only`: this is decision logic and must be testable.
 */

import { MIN_CONFIDENCE_FOR_QUALIFIED, type LeadThresholds } from "@/config/leads";

export type LeadStatus = "INSUFFICIENT_DATA" | "DISCOVERED" | "SCREENING" | "QUALIFIED";

export type StatusInput = {
  /** Commercial suitability, or null when too little was measurable. */
  leadScore: number | null;
  /** Did the website actually answer and get read? */
  verified: boolean;
  /**
   * Evidence confidence (§ Phase 4), or null for a row this pipeline version
   * has never measured.
   */
  overallConfidence: number | null;
  thresholds: LeadThresholds;
};

export function decideLeadStatus(input: StatusInput): LeadStatus {
  const { leadScore, verified, overallConfidence, thresholds } = input;

  if (leadScore == null) return "INSUFFICIENT_DATA";
  if (!verified) return "DISCOVERED";
  if (leadScore < thresholds.potential) return "SCREENING";

  // Suitability says qualified; the evidence has to agree.
  //
  // A null confidence means "not measured on this row yet", NOT "measured and
  // found wanting" — those rows predate the evidence layer, and silently
  // demoting them would rewrite verdicts on the strength of a number nobody
  // ever computed. They keep the old behaviour until a re-check measures them.
  if (overallConfidence != null && overallConfidence < MIN_CONFIDENCE_FOR_QUALIFIED) {
    return "SCREENING";
  }

  return "QUALIFIED";
}

/** True when the floor — and nothing else — is what kept a lead out of
 *  QUALIFIED. Lets the UI explain a demotion instead of just showing it. */
export function heldBackByEvidence(input: StatusInput): boolean {
  return (
    decideLeadStatus(input) === "SCREENING" &&
    input.leadScore != null &&
    input.leadScore >= input.thresholds.potential
  );
}
