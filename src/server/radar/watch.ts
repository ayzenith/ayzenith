import "server-only";

import { db } from "@/lib/db";
import { COUNTRY_LABELS } from "@/config/radar";
import { getRadarSettings } from "./settings";
import { runAnalysis } from "./run";
import { compareSnapshots, listSnapshotsForMarket, type SnapshotComparison } from "./snapshot";

/**
 * AYZENITH RADAR — watch (tracked markets) repository.
 *
 * A watch re-runs the pipeline on demand ("Şimdi Yenile") and on a weekly
 * schedule, producing a fresh immutable snapshot each time and comparing it to
 * the previous one. When the score moves by at least the configured threshold
 * (±5 by default) an alert is raised — with the REAL, data-grounded driver of
 * the change (import volume, TR share), extracted from the frozen snapshots, not
 * invented by the AI.
 */

export type WatchRow = {
  id: string;
  categoryKey: string;
  countryCode: string;
  label: string;
  active: boolean;
  lastScore: number | null;
  lastSnapshotId: string | null;
  lastRefreshedAt: Date | null;
  createdAt: Date;
};

export async function listWatches(): Promise<WatchRow[]> {
  return db.radarWatch.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createWatch(
  categoryKey: string,
  countryCode: string,
  categoryLabel: string,
): Promise<WatchRow> {
  const cc = countryCode.toUpperCase();
  const countryLabel = COUNTRY_LABELS[cc] ?? cc;
  return db.radarWatch.upsert({
    where: { categoryKey_countryCode: { categoryKey, countryCode: cc } },
    create: {
      categoryKey,
      countryCode: cc,
      label: `${countryLabel} · ${categoryLabel}`,
      active: true,
    },
    update: { active: true },
  });
}

export async function removeWatch(id: string): Promise<void> {
  await db.radarWatch.delete({ where: { id } });
}

export type WatchRefreshResult = {
  watchId: string;
  snapshotId: string;
  comparison: SnapshotComparison;
  alert: null | { direction: "up" | "down"; delta: number; reasons: string[] };
};

/**
 * Re-analyse one watched market, snapshot it, and compare to the previous
 * snapshot. Raises an alert when |Δscore| ≥ the configured threshold.
 */
export async function refreshWatch(id: string): Promise<WatchRefreshResult> {
  const watch = await db.radarWatch.findUnique({ where: { id } });
  if (!watch) throw new Error("Takip kaydı bulunamadı.");

  const settings = await getRadarSettings();

  // Previous snapshot (before this run) for comparison.
  const history = await listSnapshotsForMarket(watch.categoryKey, watch.countryCode, 1);
  const previous = history[0] ?? null;

  const { result, snapshotId } = await runAnalysis(
    { categoryKey: watch.categoryKey, countryCode: watch.countryCode },
    { watchId: id },
  );

  const comparison = compareSnapshots(
    { finalScore: result.finalScore, criteria: result.criteria },
    previous ? { finalScore: previous.finalScore, criteria: previous.criteria } : null,
  );

  let alert: WatchRefreshResult["alert"] = null;
  if (
    comparison.scoreDelta != null &&
    Math.abs(comparison.scoreDelta) >= settings.alertThreshold
  ) {
    alert = {
      direction: comparison.scoreDelta > 0 ? "up" : "down",
      delta: comparison.scoreDelta,
      reasons: comparison.reasons,
    };
  }

  await db.radarWatch.update({
    where: { id },
    data: {
      lastScore: result.finalScore,
      lastSnapshotId: snapshotId,
      lastRefreshedAt: new Date(),
    },
  });

  return { watchId: id, snapshotId, comparison, alert };
}

/** Refresh every active watch — the weekly cron entry point. */
export async function refreshAllWatches(): Promise<WatchRefreshResult[]> {
  const active = await db.radarWatch.findMany({ where: { active: true } });
  const results: WatchRefreshResult[] = [];
  for (const w of active) {
    try {
      results.push(await refreshWatch(w.id));
    } catch {
      // One market failing must not abort the whole sweep.
    }
  }
  return results;
}
