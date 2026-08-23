import "server-only";

import { db } from "@/lib/db";

/**
 * AYZENITH LOGISTICS INTELLIGENCE — Business OS feedback (§9 of the design).
 *
 * Records a real freight cost against whatever estimate existed (if any) at
 * the time, and computes how the estimate did. `estimateId` is intentionally
 * optional — a real shipment can be recorded even when no estimate was ever
 * produced for it, so nothing here forces a relationship the domain doesn't
 * actually guarantee.
 */

export type RecordActualCostInput = {
  estimateId?: string | null;
  purchaseId?: string | null;
  actualCostEur: number;
  actualDate: Date;
  actualShipmentProfile: unknown;
};

export async function recordActualCost(input: RecordActualCostInput) {
  let absoluteError: number | null = null;
  let withinPredictionBand: boolean | null = null;

  if (input.estimateId) {
    const estimate = await db.logisticsEstimate.findUnique({
      where: { id: input.estimateId },
      select: { estimatedMinEur: true, estimatedMaxEur: true },
    });
    if (estimate?.estimatedMinEur != null && estimate.estimatedMaxEur != null) {
      const min = Number(estimate.estimatedMinEur);
      const max = Number(estimate.estimatedMaxEur);
      const midpoint = (min + max) / 2;
      absoluteError = Math.abs(input.actualCostEur - midpoint);
      withinPredictionBand = input.actualCostEur >= min && input.actualCostEur <= max;
    }
  }

  return db.logisticsActualCost.create({
    data: {
      estimateId: input.estimateId ?? null,
      purchaseId: input.purchaseId ?? null,
      actualCostEur: input.actualCostEur,
      actualDate: input.actualDate,
      actualShipmentProfile: input.actualShipmentProfile as object,
      absoluteError,
      withinPredictionBand,
    },
  });
}
