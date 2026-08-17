import "server-only";

import { type CostAllocation } from "@prisma/client";
import { D, ZERO, money, unitCost, type Dec } from "./money";

/**
 * Shared document arithmetic for purchases and sales.
 *
 * The only interesting piece is `allocateCosts`, which is what makes "gerçek
 * maliyet" a derived number rather than a second figure the owner has to type
 * and keep in sync. Freight, customs, commission and packaging are entered once
 * as cost lines; this spreads them over the goods.
 *
 * The last line absorbs the rounding remainder on purpose. Allocating €200 of
 * freight across three lines by value gives three numbers that do not add back
 * to €200 at four decimal places; handing the difference to the final line means
 * the sum of the parts always equals the whole, which is the property an owner
 * will check first.
 */

export type AllocatableLine = {
  /** Line value in BASE currency. */
  baseValue: Dec;
  quantity: Dec;
};

export type AllocatableCost = {
  /** Cost amount in BASE currency. */
  baseAmount: Dec;
  allocation: CostAllocation;
};

/**
 * Returns, per line, the share of cost it must carry — in BASE currency.
 * Costs marked `NONE` are excluded: they belong to the document's total but not
 * to the value of the goods (a bank fee is not part of what a shirt cost).
 */
export function allocateCosts(lines: AllocatableLine[], costs: AllocatableCost[]): Dec[] {
  const shares = lines.map(() => ZERO());
  if (lines.length === 0) return shares;

  const totalValue = lines.reduce((a, l) => a.plus(l.baseValue), ZERO());
  const totalQty = lines.reduce((a, l) => a.plus(l.quantity), ZERO());

  for (const cost of costs) {
    if (cost.allocation === "NONE" || cost.baseAmount.isZero()) continue;

    const byQty = cost.allocation === "BY_QUANTITY";
    const denominator = byQty ? totalQty : totalValue;

    // A zero denominator (a document of free samples allocated by value) would
    // divide by zero; fall back to an even split so the cost is never lost.
    if (denominator.isZero()) {
      const even = cost.baseAmount.div(lines.length);
      let running = ZERO();
      for (let i = 0; i < lines.length; i += 1) {
        const part = i === lines.length - 1 ? cost.baseAmount.minus(running) : money(even);
        shares[i] = (shares[i] ?? ZERO()).plus(part);
        running = running.plus(part);
      }
      continue;
    }

    let running = ZERO();
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      const weight = byQty ? line.quantity : line.baseValue;
      const part =
        i === lines.length - 1
          ? cost.baseAmount.minus(running)
          : money(cost.baseAmount.mul(weight).div(denominator));
      shares[i] = (shares[i] ?? ZERO()).plus(part);
      running = running.plus(part);
    }
  }
  return shares;
}

/**
 * Landed unit cost = (goods value + allocated costs) / quantity, in BASE
 * currency. A zero-quantity line has no meaningful unit cost, so it returns
 * null rather than Infinity.
 */
export function landedUnitCostOf(baseValue: Dec, allocatedCost: Dec, quantity: Dec): Dec | null {
  if (quantity.isZero()) return null;
  return unitCost(baseValue.plus(allocatedCost).div(quantity));
}

/** Due date: an explicit date wins; otherwise issue date + term; otherwise the
 *  issue date itself, which means "cash". */
export function dueDateFor(
  issuedAt: Date,
  explicit: Date | null | undefined,
  termDays: number | null | undefined,
): Date {
  if (explicit) return explicit;
  if (termDays && termDays > 0) {
    const d = new Date(issuedAt);
    d.setDate(d.getDate() + termDays);
    return d;
  }
  return issuedAt;
}

/** Commission implied by a channel rate, in document currency. */
export function commissionAmount(subtotal: Dec, ratePct: Dec | null | undefined): Dec {
  if (!ratePct || ratePct.isZero()) return ZERO();
  return money(subtotal.mul(ratePct).div(100));
}

export { D };
