/**
 * AYZENITH BUSINESS OS — moving weighted-average cost, as pure decision logic.
 *
 * WHY THIS FILE EXISTS
 *
 * The first costing rule averaged EVERY inbound movement an item ever had, at
 * one location. Units already sold kept voting on the cost of the units still
 * on the shelf, stock reaching zero never reset anything, and a transfer or a
 * cancelled sale counted as a fresh purchase. The owner chose (2026-09-21):
 *
 *   • moving weighted average, per SKU, company-wide — location is ignored;
 *   • a TRANSFER changes nothing: company-wide it is net zero;
 *   • a RETURN does not move the average — it re-enters at the current one; only
 *     when stock is zero (no average exists) does it seed the average with the
 *     cost recorded when it was sold, and that is flagged for audit;
 *   • stock reaching zero resets the average;
 *   • a costless inbound is REFUSED when there is no average to fall back on —
 *     never booked at 0 or at 1;
 *   • past sales are never re-costed. This module only decides the cost of what
 *     happens NEXT.
 *
 * The same `applyMove` runs live (inside the stock transaction, via the
 * `ItemCostState` row) and in `replay` (rebuilding that row from the ledger), so
 * the cache and the ledger can never follow two different rules.
 *
 * Deliberately NO `server-only`: this is decision logic and must be testable.
 */

import { Prisma, type StockMoveReason } from "@prisma/client";

type Dec = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = () => D(0);
const round6 = (v: Dec) => v.toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);

export type CostState = {
  /** Company-wide on-hand. May be negative only if the owner allows it. */
  onHand: Dec;
  /** Base-currency weighted average of the COSTED units on hand; null = none. */
  avgUnitCost: Dec | null;
  /** Units on hand with no known cost. Only history can create these — live
   *  writes refuse a costless inbound when there is no average. */
  uncostedQty: Dec;
};

export type CostMove = {
  quantity: Dec;
  reason: StockMoveReason;
  unitCost: Dec | null;
  /** Set on purchase movements — a negative one is a purchase cancellation. */
  purchaseId?: string | null;
  /** Human reference for warnings, e.g. "SAT-2026-0004". */
  ref?: string | null;
};

export type CostWarningCode =
  | "RETURN_SEEDED_COST"
  | "RETURN_WITHOUT_COST"
  | "UNCOSTED_INBOUND"
  | "UNCOSTED_ADOPTED_COST"
  | "INBOUND_ON_NEGATIVE_STOCK"
  | "NEGATIVE_STOCK"
  | "NEGATIVE_VALUE_CLAMPED"
  | "OUTBOUND_WITHOUT_COST";

export type CostWarning = { code: CostWarningCode; message: string };

export class CostRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostRequiredError";
  }
}

export function emptyCostState(): CostState {
  return { onHand: ZERO(), avgUnitCost: null, uncostedQty: ZERO() };
}

/**
 * - `live`: a write happening now. A costless inbound with no average throws.
 * - `history`: rebuilding from rows already in the ledger, which can't be
 *   refused any more. A costless inbound waits and adopts the next known cost —
 *   what the old rule effectively did — and is flagged.
 */
export type CostMode = "live" | "history";

export type ApplyResult = {
  state: CostState;
  /** The unit cost this movement should carry in the ledger (base currency). */
  unitCost: Dec | null;
  warnings: CostWarning[];
};

function costedQty(s: CostState): Dec {
  return s.onHand.minus(s.uncostedQty);
}

function value(s: CostState): Dec {
  return s.avgUnitCost ? costedQty(s).mul(s.avgUnitCost) : ZERO();
}

function withValue(onHand: Dec, uncostedQty: Dec, val: Dec): CostState {
  const costed = onHand.minus(uncostedQty);
  if (costed.lte(0)) return { onHand, avgUnitCost: null, uncostedQty: onHand.gt(0) ? onHand : ZERO() };
  return { onHand, avgUnitCost: round6(val.div(costed)), uncostedQty };
}

const refOf = (m: CostMove) => (m.ref ? `${m.ref}: ` : "");

export function applyMove(prev: CostState, m: CostMove, mode: CostMode): ApplyResult {
  const warnings: CostWarning[] = [];
  const q = m.quantity;

  // Company-wide, a transfer is two legs that cancel out. The legs still carry
  // the current average so the ledger reads sensibly.
  if (m.reason === "TRANSFER") return { state: prev, unitCost: prev.avgUnitCost, warnings };
  if (q.isZero()) return { state: prev, unitCost: m.unitCost, warnings };

  // ---- inbound ------------------------------------------------------------
  if (q.gt(0)) {
    let s = prev;
    if (s.onHand.lt(0)) {
      warnings.push({
        code: "INBOUND_ON_NEGATIVE_STOCK",
        message: `${refOf(m)}stok ${s.onHand.toString()} iken ${q.toString()} adet girdi; ortalama bu girişle yeniden başladı.`,
      });
      s = emptyCostState();
    }

    if (m.reason === "RETURN") {
      if (s.avgUnitCost) {
        // Does not move the average. The ledger row keeps the cost recorded when
        // the goods were sold, so the reversal still mirrors the sale.
        const next = { onHand: s.onHand.plus(q), avgUnitCost: s.avgUnitCost, uncostedQty: s.uncostedQty };
        return { state: next, unitCost: m.unitCost ?? s.avgUnitCost, warnings };
      }
      if (m.unitCost) {
        warnings.push({
          code: "RETURN_SEEDED_COST",
          message: `${refOf(m)}Stok sıfırken iade ile maliyet oluşturuldu: ${q.toString()} adet, satıştaki kayıtlı maliyet ${round6(m.unitCost).toString()}.`,
        });
        const next = withValue(s.onHand.plus(q), s.uncostedQty, value(s).plus(q.mul(m.unitCost)));
        return { state: next, unitCost: m.unitCost, warnings };
      }
      warnings.push({
        code: "RETURN_WITHOUT_COST",
        message: `${refOf(m)}${q.toString()} adet iade maliyetsiz girdi; ortalama da yok.`,
      });
      return { state: { ...s, onHand: s.onHand.plus(q), uncostedQty: s.uncostedQty.plus(q) }, unitCost: null, warnings };
    }

    if (m.unitCost) {
      let val = value(s);
      let uncosted = s.uncostedQty;
      if (uncosted.gt(0)) {
        warnings.push({
          code: "UNCOSTED_ADOPTED_COST",
          message: `${refOf(m)}${uncosted.toString()} maliyetsiz adet bu girişin maliyetini (${round6(m.unitCost).toString()}) aldı.`,
        });
        val = val.plus(uncosted.mul(m.unitCost));
        uncosted = ZERO();
      }
      const next = withValue(s.onHand.plus(q), uncosted, val.plus(q.mul(m.unitCost)));
      return { state: next, unitCost: m.unitCost, warnings };
    }

    // Costless inbound.
    if (s.avgUnitCost) {
      if (mode === "history") {
        warnings.push({
          code: "UNCOSTED_INBOUND",
          message: `${refOf(m)}${m.reason} ${q.toString()} adet maliyetsiz; mevcut ortalama ${s.avgUnitCost.toString()} ile değerlendi.`,
        });
      }
      const next = { onHand: s.onHand.plus(q), avgUnitCost: s.avgUnitCost, uncostedQty: s.uncostedQty };
      return { state: next, unitCost: s.avgUnitCost, warnings };
    }
    if (mode === "live") {
      throw new CostRequiredError(
        "Bu ürünün henüz bir maliyeti yok; stok girişi için birim maliyet girilmesi zorunlu.",
      );
    }
    warnings.push({
      code: "UNCOSTED_INBOUND",
      message: `${refOf(m)}${m.reason} ${q.toString()} adet maliyetsiz ve ortalama yok; ilk maliyetli girişin maliyetini alacak.`,
    });
    return { state: { ...s, onHand: s.onHand.plus(q), uncostedQty: s.uncostedQty.plus(q) }, unitCost: null, warnings };
  }

  // ---- outbound -----------------------------------------------------------
  const out = q.neg();
  const isPurchaseCancel = m.reason === "ADJUSTMENT" && !!m.purchaseId && !!m.unitCost;
  const unit = isPurchaseCancel ? m.unitCost : prev.avgUnitCost;

  if (!unit) {
    warnings.push({
      code: "OUTBOUND_WITHOUT_COST",
      message: `${refOf(m)}${m.reason} ${out.toString()} adet çıktı ama ortada ortalama maliyet yok; maliyet ölçülemedi.`,
    });
  }

  // Costed units leave first; only what exceeds them eats into uncosted units.
  const costedBefore = costedQty(prev).gt(0) ? costedQty(prev) : ZERO();
  const fromCosted = Prisma.Decimal.min(out, costedBefore);
  const fromUncosted = Prisma.Decimal.max(ZERO(), out.minus(fromCosted));
  const onHand = prev.onHand.minus(out);
  let uncosted = Prisma.Decimal.max(ZERO(), prev.uncostedQty.minus(fromUncosted));
  let val = value(prev).minus(unit ? fromCosted.mul(unit) : ZERO());

  if (onHand.lt(0)) {
    warnings.push({
      code: "NEGATIVE_STOCK",
      message: `${refOf(m)}${m.reason} sonrası şirket geneli stok ${onHand.toString()}.`,
    });
  }
  if (onHand.lte(0)) {
    // Zero (or below) resets the average.
    return { state: { onHand, avgUnitCost: null, uncostedQty: ZERO() }, unitCost: unit, warnings };
  }
  if (val.lt(0)) {
    // Only a purchase cancelled at its own cost after cheaper units were sold can
    // do this. A negative average is meaningless; clamp and say so.
    warnings.push({
      code: "NEGATIVE_VALUE_CLAMPED",
      message: `${refOf(m)}çıkış sonrası stok değeri eksiye düştü (${val.toFixed(2)}); sıfırlandı.`,
    });
    val = ZERO();
  }
  if (uncosted.gt(onHand)) uncosted = onHand;
  return { state: withValue(onHand, uncosted, val), unitCost: unit, warnings };
}

export type ReplayResult = {
  state: CostState;
  moves: number;
  uncostedMoves: number;
  warnings: CostWarning[];
};

/** Rebuild a SKU's cost state from its ledger rows, in POSTING order. */
export function replay(moves: CostMove[]): ReplayResult {
  let state = emptyCostState();
  const warnings: CostWarning[] = [];
  let uncostedMoves = 0;
  for (const m of moves) {
    if (m.reason !== "TRANSFER" && m.quantity.gt(0) && !m.unitCost) uncostedMoves += 1;
    const r = applyMove(state, m, "history");
    state = r.state;
    warnings.push(...r.warnings);
  }
  return { state, moves: moves.length, uncostedMoves, warnings };
}
