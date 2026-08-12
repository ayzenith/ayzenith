import "server-only";

import { db } from "@/lib/db";
import {
  DEFAULT_ALERT_THRESHOLD,
  DEFAULT_CACHE_TTL_DAYS,
  DEFAULT_CERTIFICATION_BURDEN,
  DEFAULT_REGIONS,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  type CertificationBurden,
  type RadarThresholds,
  type RadarWeights,
} from "@/config/radar";

/**
 * AYZENITH RADAR — settings repository.
 *
 * Resolves the single RadarSetting row over the compiled defaults in
 * config/radar.ts. An empty table = pure defaults, so the engine works before
 * the owner ever opens the settings screen. Every consumer reads the resolved
 * object; nothing reads the raw row directly. Weights/thresholds returned here
 * are the CURRENT ones — a snapshot freezes its own copy so changing settings
 * never rewrites past analyses.
 */

export type ResolvedRadarSettings = {
  weights: RadarWeights;
  thresholds: RadarThresholds;
  certificationBurden: Record<string, CertificationBurden>;
  regions: Record<string, { label: string; countries: string[] }>;
  cacheTtlDays: number;
  alertThreshold: number;
};

export async function getRadarSettings(): Promise<ResolvedRadarSettings> {
  let row: {
    weights: unknown;
    thresholds: unknown;
    certificationBurden: unknown;
    regions: unknown;
    cacheTtlDays: number | null;
    alertThreshold: number | null;
  } | null = null;
  try {
    row = await db.radarSetting.findUnique({ where: { id: "radar" } });
  } catch {
    row = null;
  }

  return {
    weights: (row?.weights as RadarWeights) ?? DEFAULT_WEIGHTS,
    thresholds: (row?.thresholds as RadarThresholds) ?? DEFAULT_THRESHOLDS,
    certificationBurden:
      (row?.certificationBurden as Record<string, CertificationBurden>) ??
      DEFAULT_CERTIFICATION_BURDEN,
    regions:
      (row?.regions as Record<string, { label: string; countries: string[] }>) ??
      DEFAULT_REGIONS,
    cacheTtlDays: row?.cacheTtlDays ?? DEFAULT_CACHE_TTL_DAYS,
    alertThreshold: row?.alertThreshold ?? DEFAULT_ALERT_THRESHOLD,
  };
}

/** Persist a partial settings update (upsert the single row). Empty → defaults. */
export async function updateRadarSettings(
  patch: Partial<{
    weights: RadarWeights;
    thresholds: RadarThresholds;
    certificationBurden: Record<string, CertificationBurden>;
    regions: Record<string, { label: string; countries: string[] }>;
    cacheTtlDays: number;
    alertThreshold: number;
  }>,
): Promise<void> {
  await db.radarSetting.upsert({
    where: { id: "radar" },
    create: { id: "radar", ...patch },
    update: patch,
  });
}
