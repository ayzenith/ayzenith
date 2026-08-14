import "server-only";

import { db } from "@/lib/db";
import {
  DEFAULT_LEAD_THRESHOLDS,
  DEFAULT_LEAD_WEIGHTS,
  DEFAULT_RECHECK_DAYS,
  type LeadThresholds,
  type LeadWeights,
} from "@/config/leads";

/**
 * AYZENITH LEAD FINDER — resolved settings.
 *
 * Reads the single LeadSetting row and merges it over the compiled defaults, so
 * an empty table means "use the defaults" (mirrors RadarSetting). Weight changes
 * affect only FUTURE scoring — a company keeps the breakdown it was scored with.
 */

export type ResolvedLeadSettings = {
  weights: LeadWeights;
  thresholds: LeadThresholds;
  recheckDays: number;
};

export async function getLeadSettings(): Promise<ResolvedLeadSettings> {
  let row: { weights: unknown; thresholds: unknown; recheckDays: number | null } | null = null;
  try {
    row = await db.leadSetting.findUnique({ where: { id: "lead" } });
  } catch {
    row = null; // table not migrated yet → defaults
  }

  const weights = { ...DEFAULT_LEAD_WEIGHTS, ...((row?.weights as Partial<LeadWeights>) ?? {}) };
  const thresholds = { ...DEFAULT_LEAD_THRESHOLDS, ...((row?.thresholds as Partial<LeadThresholds>) ?? {}) };
  const recheckDays = row?.recheckDays ?? DEFAULT_RECHECK_DAYS;

  return { weights, thresholds, recheckDays };
}
