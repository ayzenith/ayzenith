-- CreateTable
CREATE TABLE "LogisticsCostIndexDefinition" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "indexName" TEXT NOT NULL,
    "geography" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "methodology" TEXT,
    "baseValue" DOUBLE PRECISION NOT NULL,
    "baseDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsCostIndexDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsCostIndexComponent" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "effectiveYear" INTEGER NOT NULL,
    "weightPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsCostIndexComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsCostIndexObservation" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "indexValue" DOUBLE PRECISION NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsCostIndexObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsCostIndexDefinition_sourceId_indexName_key" ON "LogisticsCostIndexDefinition"("sourceId", "indexName");

-- CreateIndex: idempotency guard for the annual weight series — the SAME
-- component's weight for the SAME year can never appear twice.
CREATE UNIQUE INDEX "LogisticsCostIndexComponent_definitionId_component_effect_key" ON "LogisticsCostIndexComponent"("definitionId", "component", "effectiveYear");

-- CreateIndex: idempotency guard for the monthly index-value series — a
-- re-fetched month for the same component upserts, never duplicates. This is
-- the DB-level guarantee an ingestion job relies on, mirroring the fuel-index
-- table's natural key.
CREATE UNIQUE INDEX "LogisticsCostIndexObservation_definitionId_component_peri_key" ON "LogisticsCostIndexObservation"("definitionId", "component", "periodStart");
CREATE INDEX "LogisticsCostIndexObservation_definitionId_component_period_idx" ON "LogisticsCostIndexObservation"("definitionId", "component", "periodStart");

-- CHECK: a weight, when present, must be a real percentage. NULL stays valid
-- for a synthetic total (COMPOSITE / COMPOSITE_EX_DIESEL) which has no
-- weight of its own — the weights belong to the components, not the total.
ALTER TABLE "LogisticsCostIndexComponent" ADD CONSTRAINT "cost_index_component_weight_range" CHECK (
  "weightPct" IS NULL OR ("weightPct" >= 0 AND "weightPct" <= 100)
);

-- AddForeignKey
ALTER TABLE "LogisticsCostIndexDefinition" ADD CONSTRAINT "LogisticsCostIndexDefinition_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LogisticsSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsCostIndexComponent" ADD CONSTRAINT "LogisticsCostIndexComponent_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "LogisticsCostIndexDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsCostIndexObservation" ADD CONSTRAINT "LogisticsCostIndexObservation_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "LogisticsCostIndexDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
