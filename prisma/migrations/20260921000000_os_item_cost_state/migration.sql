-- Moving weighted-average cost state per SKU (company-wide).
-- Purely additive: no existing table, row or column is touched. The initial
-- rows are computed from the StockMovement ledger by the backfill script
-- (same rule as src/server/os/moving-average.ts), never re-costing past sales.

-- CreateTable
CREATE TABLE "ItemCostState" (
    "itemId" TEXT NOT NULL,
    "onHand" DECIMAL(18,3) NOT NULL,
    "avgUnitCost" DECIMAL(18,6),
    "uncostedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "movementCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemCostState_pkey" PRIMARY KEY ("itemId")
);

-- AddForeignKey
ALTER TABLE "ItemCostState" ADD CONSTRAINT "ItemCostState_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
