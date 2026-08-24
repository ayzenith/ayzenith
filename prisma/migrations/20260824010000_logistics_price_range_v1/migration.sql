-- CreateEnum
CREATE TYPE "RawPriceType" AS ENUM ('EXACT', 'RANGE');

-- CreateEnum
CREATE TYPE "PriceBasis" AS ENUM ('EXACT', 'RANGE_MIDPOINT');

-- AlterTable: LogisticsRawObservation.rawPrice -> priceType/priceExact/priceMin/priceMax.
-- Table is empty in production (no real lane observation has been ingested
-- yet — only the EU Oil Bulletin fuel-index table, a separate model, has real
-- data), so dropping the old column loses nothing.
ALTER TABLE "LogisticsRawObservation" DROP COLUMN "rawPrice";
ALTER TABLE "LogisticsRawObservation" ADD COLUMN "priceType" "RawPriceType" NOT NULL DEFAULT 'EXACT';
ALTER TABLE "LogisticsRawObservation" ADD COLUMN "priceExact" DECIMAL(10,2);
ALTER TABLE "LogisticsRawObservation" ADD COLUMN "priceMin" DECIMAL(10,2);
ALTER TABLE "LogisticsRawObservation" ADD COLUMN "priceMax" DECIMAL(10,2);

-- Defense in depth: a RawObservation must be internally consistent with its
-- own declared priceType, enforced at the database level, not just in
-- application code that could drift from the rule later.
ALTER TABLE "LogisticsRawObservation" ADD CONSTRAINT "raw_price_type_consistency" CHECK (
  ("priceType" = 'EXACT' AND "priceExact" IS NOT NULL AND "priceMin" IS NULL AND "priceMax" IS NULL)
  OR
  ("priceType" = 'RANGE' AND "priceMin" IS NOT NULL AND "priceMax" IS NOT NULL AND "priceExact" IS NULL)
);

-- AlterTable: LogisticsNormalizedObservation gains the same range-preserving
-- fields, so a RANGE raw observation never silently becomes an unlabelled
-- single number at the comparable-profile layer either.
ALTER TABLE "LogisticsNormalizedObservation" ADD COLUMN "priceBasis" "PriceBasis" NOT NULL DEFAULT 'EXACT';
ALTER TABLE "LogisticsNormalizedObservation" ADD COLUMN "priceMinEur" DECIMAL(10,2);
ALTER TABLE "LogisticsNormalizedObservation" ADD COLUMN "priceMaxEur" DECIMAL(10,2);

ALTER TABLE "LogisticsNormalizedObservation" ADD CONSTRAINT "normalized_price_basis_consistency" CHECK (
  ("priceBasis" = 'EXACT' AND "priceMinEur" IS NULL AND "priceMaxEur" IS NULL)
  OR
  ("priceBasis" = 'RANGE_MIDPOINT' AND "priceMinEur" IS NOT NULL AND "priceMaxEur" IS NOT NULL)
);
