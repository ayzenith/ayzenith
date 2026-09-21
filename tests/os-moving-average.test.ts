import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma, type StockMoveReason } from "@prisma/client";
import {
  applyMove, emptyCostState, replay, CostRequiredError, type CostMove, type CostState,
} from "../src/server/os/moving-average";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const mv = (quantity: number, reason: StockMoveReason, unitCost: number | null, extra: Partial<CostMove> = {}): CostMove => ({
  quantity: D(quantity), reason, unitCost: unitCost == null ? null : D(unitCost), ...extra,
});
const avg = (s: CostState) => (s.avgUnitCost ? s.avgUnitCost.toFixed(2) : null);
function live(moves: CostMove[]) {
  let s = emptyCostState();
  const out: Array<ReturnType<typeof applyMove>> = [];
  for (const m of moves) { const r = applyMove(s, m, "live"); s = r.state; out.push(r); }
  return { state: s, results: out };
}

test("moving average: new purchases blend with what is on hand, not with what was sold", () => {
  const { state, results } = live([
    mv(30, "PURCHASE", 1000),
    mv(-30, "SALE", null),
    mv(30, "PURCHASE", 2000),
    mv(-10, "SALE", null),
  ]);
  // The old all-time rule would say 1500 here.
  assert.equal(results[3]!.unitCost!.toFixed(2), "2000.00");
  assert.equal(state.onHand.toString(), "20");
  assert.equal(avg(state), "2000.00");
});

test("weighted: (10×100 + 30×200) / 40 = 175", () => {
  const { state } = live([mv(10, "PURCHASE", 100), mv(30, "PURCHASE", 200)]);
  assert.equal(avg(state), "175.00");
});

test("stock reaching zero resets the average", () => {
  const { state } = live([mv(5, "PURCHASE", 100), mv(-5, "SALE", null)]);
  assert.equal(state.onHand.toString(), "0");
  assert.equal(state.avgUnitCost, null);
});

test("transfer legs change nothing company-wide", () => {
  const { state } = live([mv(10, "PURCHASE", 100), mv(-4, "TRANSFER", 999), mv(4, "TRANSFER", 999)]);
  assert.equal(state.onHand.toString(), "10");
  assert.equal(avg(state), "100.00");
});

test("return with stock on hand does not move the average, row keeps the sale cost", () => {
  const { state, results } = live([mv(10, "PURCHASE", 100), mv(10, "PURCHASE", 300), mv(2, "RETURN", 50)]);
  assert.equal(avg(state), "200.00");
  assert.equal(state.onHand.toString(), "22");
  assert.equal(results[2]!.unitCost!.toFixed(2), "50.00");
  assert.equal(results[2]!.warnings.length, 0);
});

test("return while stock is zero seeds the average with the sale cost and warns", () => {
  const { state, results } = live([mv(5, "PURCHASE", 100), mv(-5, "SALE", null), mv(2, "RETURN", 100)]);
  assert.equal(avg(state), "100.00");
  assert.equal(results[2]!.warnings[0]!.code, "RETURN_SEEDED_COST");
  assert.match(results[2]!.warnings[0]!.message, /Stok sıfırken iade ile maliyet oluşturuldu/);
});

test("live: costless inbound with no average is refused", () => {
  assert.throws(() => applyMove(emptyCostState(), mv(60, "OPENING", null), "live"), CostRequiredError);
});

test("live: costless inbound with an average takes the average", () => {
  const { state, results } = live([mv(10, "PURCHASE", 100), mv(10, "ADJUSTMENT", null)]);
  assert.equal(results[1]!.unitCost!.toFixed(2), "100.00");
  assert.equal(avg(state), "100.00");
  assert.equal(state.onHand.toString(), "20");
});

test("history: costless opening waits and adopts the next known cost", () => {
  const r = replay([mv(60, "OPENING", null), mv(30, "PURCHASE", 1000)]);
  assert.equal(avg(r.state), "1000.00");
  assert.equal(r.state.uncostedQty.toString(), "0");
  assert.equal(r.uncostedMoves, 1);
  assert.deepEqual(r.warnings.map((w) => w.code), ["UNCOSTED_INBOUND", "UNCOSTED_ADOPTED_COST"]);
});

test("purchase cancellation reverses at its own cost", () => {
  const { state } = live([
    mv(10, "PURCHASE", 100),
    mv(10, "PURCHASE", 300, { purchaseId: "p2" }),
    mv(-10, "ADJUSTMENT", 300, { purchaseId: "p2" }),
  ]);
  assert.equal(avg(state), "100.00");
  assert.equal(state.onHand.toString(), "10");
});

test("outbound adjustment / damage leaves at the average whatever cost was typed", () => {
  const { state, results } = live([mv(10, "PURCHASE", 100), mv(-2, "DAMAGE", 999)]);
  assert.equal(results[1]!.unitCost!.toFixed(2), "100.00");
  assert.equal(avg(state), "100.00");
});

test("inbound onto negative stock restarts the average from that inbound", () => {
  const { state, results } = live([mv(2, "PURCHASE", 100), mv(-5, "SALE", null), mv(10, "PURCHASE", 300)]);
  assert.equal(results[1]!.warnings[0]!.code, "NEGATIVE_STOCK");
  assert.equal(results[2]!.warnings[0]!.code, "INBOUND_ON_NEGATIVE_STOCK");
  assert.equal(avg(state), "300.00");
});

test("replay equals step-by-step live application", () => {
  const moves = [mv(10, "PURCHASE", 100), mv(-3, "SALE", null), mv(20, "PURCHASE", 130), mv(-4, "TRANSFER", null), mv(4, "TRANSFER", null), mv(-7, "SALE", null), mv(1, "RETURN", 110)];
  const a = replay(moves).state;
  const b = live(moves).state;
  assert.equal(a.onHand.toString(), b.onHand.toString());
  assert.equal(a.avgUnitCost!.toString(), b.avgUnitCost!.toString());
});

// The real ledger of ayz-001 as of 2026-09-21, in posting order — the dry-run
// numbers the owner signed off on must come out of the shipped rule.
test("ayz-001 real history reproduces the approved dry-run", () => {
  const r = replay([
    mv(60, "OPENING", null),
    mv(30, "PURCHASE", 1353.333333),
    mv(-30, "SALE", 1353.333333),
    mv(-12, "SALE", 1353.333333),
    mv(-1, "SALE", 1353.333333),
    mv(30, "PURCHASE", 2071.97),
    mv(30, "PURCHASE", 2137.85),
    mv(-2, "SALE", 1854.38),
    mv(-1, "SALE", 1854.38),
    mv(-5, "SALE", 1854.38),
    mv(-1, "SALE", 1854.38),
    mv(-3, "SALE", 1854.38),
    mv(50, "PURCHASE", 315),
    mv(-10, "SALE", 1304.6),
  ]);
  assert.equal(r.state.onHand.toString(), "135");
  assert.equal(avg(r.state), "1271.41");
  assert.equal(r.moves, 14);
  assert.equal(r.uncostedMoves, 1);
});
