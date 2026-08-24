-- CreateEnum
CREATE TYPE "MarketReferencePriceType" AS ENUM ('EXACT', 'RANGE');

-- CreateEnum
CREATE TYPE "WeightScopeType" AS ENUM ('EXACT', 'UP_TO', 'RANGE');

-- CreateTable: manually-entered, published sector/commercial price references
-- (e.g. a freight forum stating "İstanbul → Germany, 1 Euro-pallet, ≤500 kg:
-- €120–220"). No relation to LogisticsRawObservation/Benchmark/Estimate on
-- purpose — this table is never aggregated into a benchmark and never feeds
-- an estimate's price band; it is always shown on its own, labeled "piyasa
-- referansı". No LogisticsLane relation either: destCity is nullable because
-- a source naming only a country must not be forced onto an invented city.
CREATE TABLE "LogisticsMarketReference" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,

    "originCity" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destCity" TEXT,
    "destCountry" TEXT NOT NULL,

    "unitType" TEXT,
    "unitCount" INTEGER,

    "weightScopeType" "WeightScopeType" NOT NULL,
    "weightScopeMinKg" DOUBLE PRECISION,
    "weightScopeMaxKg" DOUBLE PRECISION,

    "shipmentType" "ShipmentType",
    "incoterm" TEXT,

    "priceType" "MarketReferencePriceType" NOT NULL DEFAULT 'EXACT',
    "priceExact" DECIMAL(10,2),
    "priceMin" DECIMAL(10,2),
    "priceMax" DECIMAL(10,2),
    "currency" TEXT NOT NULL,

    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3),

    "conditionsNote" TEXT,
    "sourceUrl" TEXT,
    "rawPayload" JSONB NOT NULL,

    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsMarketReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogisticsMarketReference_originCountry_destCountry_idx" ON "LogisticsMarketReference"("originCountry", "destCountry");

-- Defense in depth, same pattern as raw_price_type_consistency: a stated
-- price must match its own declared priceType.
ALTER TABLE "LogisticsMarketReference" ADD CONSTRAINT "market_reference_price_type_consistency" CHECK (
  ("priceType" = 'EXACT' AND "priceExact" IS NOT NULL AND "priceMin" IS NULL AND "priceMax" IS NULL)
  OR
  ("priceType" = 'RANGE' AND "priceMin" IS NOT NULL AND "priceMax" IS NOT NULL AND "priceExact" IS NULL)
);

-- This is the DB-level half of the misapplication guard: a weight scope must
-- always be internally consistent with its own declared type, and a
-- reference can never be entered with no weight scope at all (UNSPECIFIED is
-- deliberately not a valid enum value). EXACT stores the single weight in
-- weightScopeMinKg alone; UP_TO states only a ceiling (no floor is claimed,
-- not even 0); RANGE states both bounds. The other half — actually excluding
-- a reference whose scope doesn't cover a given query's weight — is
-- application-level query logic, not yet implemented (see schema.prisma
-- doc-comment on LogisticsMarketReference).
ALTER TABLE "LogisticsMarketReference" ADD CONSTRAINT "market_reference_weight_scope_consistency" CHECK (
  ("weightScopeType" = 'EXACT' AND "weightScopeMinKg" IS NOT NULL AND "weightScopeMaxKg" IS NULL)
  OR
  ("weightScopeType" = 'UP_TO' AND "weightScopeMinKg" IS NULL AND "weightScopeMaxKg" IS NOT NULL)
  OR
  ("weightScopeType" = 'RANGE' AND "weightScopeMinKg" IS NOT NULL AND "weightScopeMaxKg" IS NOT NULL)
);

-- AddForeignKey
ALTER TABLE "LogisticsMarketReference" ADD CONSTRAINT "LogisticsMarketReference_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LogisticsSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
