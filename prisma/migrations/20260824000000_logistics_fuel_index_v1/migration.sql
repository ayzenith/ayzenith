-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('DIESEL');

-- AlterTable: LogisticsSource.name becomes unique so an ingestion job can
-- upsert its own source row by name (e.g. "EU Weekly Oil Bulletin").
-- Table is additive-only from the previous migration and currently empty in
-- production, so this cannot fail on an existing duplicate.
CREATE UNIQUE INDEX "LogisticsSource_name_key" ON "LogisticsSource"("name");

-- CreateTable
CREATE TABLE "LogisticsFuelIndexObservation" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL DEFAULT 'DIESEL',
    "priceEurPerLiter" DECIMAL(6,4) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "plausible" BOOLEAN NOT NULL DEFAULT true,
    "plausibilityNote" TEXT,
    "rawPayload" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsFuelIndexObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogisticsFuelIndexObservation_country_fuelType_periodStart_idx" ON "LogisticsFuelIndexObservation"("country", "fuelType", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsFuelIndexObservation_sourceId_country_fuelType_p_key" ON "LogisticsFuelIndexObservation"("sourceId", "country", "fuelType", "periodStart");

-- AddForeignKey
ALTER TABLE "LogisticsFuelIndexObservation" ADD CONSTRAINT "LogisticsFuelIndexObservation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LogisticsSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
