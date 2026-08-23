-- CreateEnum
CREATE TYPE "LogisticsSourceType" AS ENUM ('OFFICIAL_INDEX', 'COMMERCIAL_BENCHMARK');

-- CreateEnum
CREATE TYPE "EvidenceLevel" AS ENUM ('DIRECT_LANE', 'NEARBY_LANE', 'COUNTRY_CORRIDOR', 'REGIONAL_INDEX_ONLY', 'NONE');

-- CreateEnum
CREATE TYPE "EstimateabilityBand" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('ROAD');

-- CreateEnum
CREATE TYPE "ShipmentType" AS ENUM ('LTL', 'FTL');

-- CreateEnum
CREATE TYPE "CorridorType" AS ENUM ('DOMESTIC_EU', 'TR_EU_CROSS_BORDER');

-- CreateEnum
CREATE TYPE "NormalizationMethod" AS ENUM ('AS_REPORTED', 'VOLUMETRIC_COMPUTED', 'MISSING');

-- CreateEnum
CREATE TYPE "ValidationMethod" AS ENUM ('MAD_3X');

-- CreateEnum
CREATE TYPE "BenchmarkMethod" AS ENUM ('MEDIAN', 'WEIGHTED_MEDIAN');

-- CreateTable
CREATE TABLE "LogisticsSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" "LogisticsSourceType" NOT NULL,
    "authorityScore" INTEGER NOT NULL,
    "transparencyScore" INTEGER NOT NULL,
    "coverageScore" INTEGER NOT NULL,
    "historicalDepthMonths" INTEGER,
    "updateFrequency" TEXT NOT NULL,
    "lastFetchedAt" TIMESTAMP(3),
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsLane" (
    "id" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destCity" TEXT NOT NULL,
    "destCountry" TEXT NOT NULL,
    "mode" "TransportMode" NOT NULL DEFAULT 'ROAD',
    "corridorType" "CorridorType" NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "borderCrossings" JSONB NOT NULL DEFAULT '[]',
    "tollExposureEur" DECIMAL(10,2),
    "tollLastUpdatedAt" TIMESTAMP(3),
    "lastCalibratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsLane_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsRawObservation" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "laneId" TEXT,
    "rawShipmentDescription" TEXT,
    "rawPrice" DECIMAL(10,2) NOT NULL,
    "rawCurrency" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsRawObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsNormalizedObservation" (
    "id" TEXT NOT NULL,
    "rawObservationId" TEXT NOT NULL,
    "chargeableWeightKg" DOUBLE PRECISION NOT NULL,
    "volumeM3" DOUBLE PRECISION,
    "palletCount" INTEGER,
    "shipmentType" "ShipmentType",
    "incoterm" TEXT,
    "tollIncluded" BOOLEAN,
    "fuelIncluded" BOOLEAN,
    "priceEur" DECIMAL(10,2) NOT NULL,
    "normalizationConfidence" INTEGER NOT NULL,
    "normalizationMethod" "NormalizationMethod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsNormalizedObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsValidation" (
    "id" TEXT NOT NULL,
    "normalizedObservationId" TEXT NOT NULL,
    "rawValue" DECIMAL(10,2) NOT NULL,
    "validatedValue" DECIMAL(10,2) NOT NULL,
    "outlierFlag" BOOLEAN NOT NULL DEFAULT false,
    "outlierReason" TEXT,
    "validationMethod" "ValidationMethod" NOT NULL DEFAULT 'MAD_3X',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsBenchmark" (
    "id" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "mode" "TransportMode" NOT NULL DEFAULT 'ROAD',
    "shipmentType" "ShipmentType" NOT NULL,
    "weightBucketMinKg" DOUBLE PRECISION NOT NULL,
    "weightBucketMaxKg" DOUBLE PRECISION NOT NULL,
    "calculationMethod" "BenchmarkMethod" NOT NULL DEFAULT 'MEDIAN',
    "medianPriceEur" DECIMAL(10,2) NOT NULL,
    "p25PriceEur" DECIMAL(10,2),
    "p75PriceEur" DECIMAL(10,2),
    "minPriceEur" DECIMAL(10,2),
    "maxPriceEur" DECIMAL(10,2),
    "sampleSize" INTEGER NOT NULL,
    "freshnessScore" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsBenchmarkObservation" (
    "benchmarkId" TEXT NOT NULL,
    "normalizedObservationId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "LogisticsBenchmarkObservation_pkey" PRIMARY KEY ("benchmarkId","normalizedObservationId")
);

-- CreateTable
CREATE TABLE "LogisticsEstimate" (
    "id" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "benchmarkId" TEXT,
    "queryProfile" JSONB NOT NULL,
    "evidenceLevel" "EvidenceLevel" NOT NULL,
    "estimateability" "EstimateabilityBand" NOT NULL,
    "estimateabilityFactors" JSONB NOT NULL,
    "estimateMethod" TEXT NOT NULL,
    "sourceObservationIds" JSONB NOT NULL,
    "estimatedMinEur" DECIMAL(10,2),
    "estimatedMaxEur" DECIMAL(10,2),
    "insufficientReason" TEXT,
    "citations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsActualCost" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT,
    "purchaseId" TEXT,
    "actualCostEur" DECIMAL(10,2) NOT NULL,
    "actualDate" TIMESTAMP(3) NOT NULL,
    "actualShipmentProfile" JSONB NOT NULL,
    "absoluteError" DECIMAL(10,2),
    "withinPredictionBand" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsActualCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsCalibrationRun" (
    "id" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "mode" "TransportMode" NOT NULL DEFAULT 'ROAD',
    "sampleSize" INTEGER NOT NULL,
    "mae" DECIMAL(10,2),
    "mapePct" DOUBLE PRECISION,
    "withinBandPct" DOUBLE PRECISION,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsCalibrationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsLane_originCity_originCountry_destCity_destCountry_key" ON "LogisticsLane"("originCity", "originCountry", "destCity", "destCountry", "mode");

-- CreateIndex
CREATE INDEX "LogisticsRawObservation_laneId_idx" ON "LogisticsRawObservation"("laneId");

-- CreateIndex
CREATE INDEX "LogisticsRawObservation_sourceId_idx" ON "LogisticsRawObservation"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsNormalizedObservation_rawObservationId_key" ON "LogisticsNormalizedObservation"("rawObservationId");

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsValidation_normalizedObservationId_key" ON "LogisticsValidation"("normalizedObservationId");

-- CreateIndex
CREATE INDEX "LogisticsBenchmark_laneId_mode_shipmentType_idx" ON "LogisticsBenchmark"("laneId", "mode", "shipmentType");

-- CreateIndex
CREATE INDEX "LogisticsEstimate_laneId_idx" ON "LogisticsEstimate"("laneId");

-- CreateIndex
CREATE INDEX "LogisticsActualCost_estimateId_idx" ON "LogisticsActualCost"("estimateId");

-- CreateIndex
CREATE INDEX "LogisticsActualCost_purchaseId_idx" ON "LogisticsActualCost"("purchaseId");

-- CreateIndex
CREATE INDEX "LogisticsCalibrationRun_laneId_mode_idx" ON "LogisticsCalibrationRun"("laneId", "mode");

-- AddForeignKey
ALTER TABLE "LogisticsRawObservation" ADD CONSTRAINT "LogisticsRawObservation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LogisticsSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsRawObservation" ADD CONSTRAINT "LogisticsRawObservation_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "LogisticsLane"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsNormalizedObservation" ADD CONSTRAINT "LogisticsNormalizedObservation_rawObservationId_fkey" FOREIGN KEY ("rawObservationId") REFERENCES "LogisticsRawObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsValidation" ADD CONSTRAINT "LogisticsValidation_normalizedObservationId_fkey" FOREIGN KEY ("normalizedObservationId") REFERENCES "LogisticsNormalizedObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsBenchmark" ADD CONSTRAINT "LogisticsBenchmark_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "LogisticsLane"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsBenchmarkObservation" ADD CONSTRAINT "LogisticsBenchmarkObservation_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "LogisticsBenchmark"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsBenchmarkObservation" ADD CONSTRAINT "LogisticsBenchmarkObservation_normalizedObservationId_fkey" FOREIGN KEY ("normalizedObservationId") REFERENCES "LogisticsNormalizedObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsEstimate" ADD CONSTRAINT "LogisticsEstimate_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "LogisticsLane"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsEstimate" ADD CONSTRAINT "LogisticsEstimate_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "LogisticsBenchmark"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsActualCost" ADD CONSTRAINT "LogisticsActualCost_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "LogisticsEstimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
