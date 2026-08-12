import "server-only";

import { analyzeMarket, type AnalyzeParams, type AnalysisResult } from "./analyze";
import { interpret } from "./ai";
import { saveSnapshot } from "./snapshot";

/**
 * AYZENITH RADAR — top-level run orchestration.
 *
 * Ties the strict layers together in order: DATA (analyze) → AI (interpret) →
 * SNAPSHOT (persist). This is the single entry point the UI actions, the watch
 * refresher and the end-to-end test all call, so the pipeline is exercised
 * identically everywhere. It returns the full result plus the new snapshot id.
 */

export type RunResult = {
  result: AnalysisResult;
  snapshotId: string;
  aiSummary: string | null;
  aiDisabledReason?: string;
};

export async function runAnalysis(
  params: AnalyzeParams,
  opts: { watchId?: string } = {},
): Promise<RunResult> {
  // 1. DATA + deterministic SCORING.
  const result = await analyzeMarket(params);

  // 2. AI interpretation (only when there is a real score; guarded internally).
  const ai = await interpret(result);

  // 3. Immutable SNAPSHOT.
  const { id } = await saveSnapshot(result, {
    watchId: opts.watchId,
    aiSummary: ai.summary,
  });

  return {
    result,
    snapshotId: id,
    aiSummary: ai.summary,
    aiDisabledReason: ai.disabledReason,
  };
}
