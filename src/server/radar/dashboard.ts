import "server-only";

import { getRadarSettings } from "./settings";
import { listWatches, type WatchRow } from "./watch";
import {
  compareSnapshots,
  listSnapshots,
  listSnapshotsForMarket,
  type SnapshotSummary,
} from "./snapshot";

/**
 * AYZENITH RADAR — dashboard read model.
 *
 * Pure composition over the existing repositories: it derives the "değişim
 * uyarıları" (change alerts) for the dashboard from each watched market's two
 * most recent immutable snapshots, using the SAME deterministic comparison the
 * watch refresher uses. No new scoring, no AI, no fabrication — an alert only
 * exists when two real snapshots differ by at least the configured threshold,
 * and its reason text comes straight from the frozen raw inputs.
 */

export type DashboardAlert = {
  watchId: string;
  label: string;
  categoryKey: string;
  countryCode: string;
  direction: "up" | "down";
  delta: number;
  currentScore: number | null;
  previousScore: number | null;
  reasons: string[];
  snapshotId: string;
};

export type DashboardData = {
  alerts: DashboardAlert[];
  watches: WatchRow[];
  recent: SnapshotSummary[];
};

export async function getRadarDashboard(): Promise<DashboardData> {
  const [settings, watches, recent] = await Promise.all([
    getRadarSettings(),
    listWatches(),
    listSnapshots(8),
  ]);

  const alerts: DashboardAlert[] = [];
  for (const w of watches) {
    // Two most recent snapshots for this market (newest first).
    const history = await listSnapshotsForMarket(w.categoryKey, w.countryCode, 2);
    const current = history[0];
    const previous = history[1] ?? null;
    if (!current || !previous) continue;

    const cmp = compareSnapshots(
      { finalScore: current.finalScore, criteria: current.criteria },
      { finalScore: previous.finalScore, criteria: previous.criteria },
    );
    if (cmp.scoreDelta == null || Math.abs(cmp.scoreDelta) < settings.alertThreshold) {
      continue;
    }
    alerts.push({
      watchId: w.id,
      label: w.label,
      categoryKey: w.categoryKey,
      countryCode: w.countryCode,
      direction: cmp.scoreDelta > 0 ? "up" : "down",
      delta: cmp.scoreDelta,
      currentScore: cmp.currentScore,
      previousScore: cmp.previousScore,
      reasons: cmp.reasons,
      snapshotId: current.id,
    });
  }

  // Strongest moves first.
  alerts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { alerts, watches, recent };
}
