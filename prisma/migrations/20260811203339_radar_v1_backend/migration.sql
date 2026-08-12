-- CreateEnum
CREATE TYPE "RadarHsVerification" AS ENUM ('VERIFIED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "RadarDecision" AS ENUM ('WORTH_RESEARCHING', 'MONITOR', 'NOT_PRIORITY', 'INSUFFICIENT_DATA');

-- CreateTable
CREATE TABLE "RadarHsMapping" (
    "id" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "hs6" TEXT NOT NULL,
    "productGroup" TEXT NOT NULL,
    "verification" "RadarHsVerification" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "source" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarHsMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarRawCache" (
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarRawCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RadarSnapshot" (
    "id" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "geoScope" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "countryLabel" TEXT NOT NULL,
    "supplyMarket" TEXT NOT NULL DEFAULT 'TR',
    "tradeModel" TEXT NOT NULL DEFAULT 'B2B',
    "resolvedHs" JSONB NOT NULL,
    "criteria" JSONB NOT NULL,
    "finalScore" INTEGER,
    "decision" "RadarDecision" NOT NULL,
    "weightsUsed" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL,
    "measuredCriteria" INTEGER NOT NULL,
    "subCategories" JSONB NOT NULL DEFAULT '[]',
    "aiSummary" TEXT,
    "watchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarCitation" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "rawValue" TEXT NOT NULL,
    "unit" TEXT,
    "sourceUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarWatch" (
    "id" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastScore" INTEGER,
    "lastSnapshotId" TEXT,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarSetting" (
    "id" TEXT NOT NULL DEFAULT 'radar',
    "weights" JSONB,
    "thresholds" JSONB,
    "certificationBurden" JSONB,
    "regions" JSONB,
    "cacheTtlDays" INTEGER,
    "alertThreshold" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RadarHsMapping_categoryKey_idx" ON "RadarHsMapping"("categoryKey");

-- CreateIndex
CREATE INDEX "RadarHsMapping_hs6_idx" ON "RadarHsMapping"("hs6");

-- CreateIndex
CREATE UNIQUE INDEX "RadarHsMapping_categoryKey_hs6_key" ON "RadarHsMapping"("categoryKey", "hs6");

-- CreateIndex
CREATE INDEX "RadarRawCache_provider_idx" ON "RadarRawCache"("provider");

-- CreateIndex
CREATE INDEX "RadarRawCache_expiresAt_idx" ON "RadarRawCache"("expiresAt");

-- CreateIndex
CREATE INDEX "RadarSnapshot_categoryKey_countryCode_idx" ON "RadarSnapshot"("categoryKey", "countryCode");

-- CreateIndex
CREATE INDEX "RadarSnapshot_watchId_idx" ON "RadarSnapshot"("watchId");

-- CreateIndex
CREATE INDEX "RadarSnapshot_createdAt_idx" ON "RadarSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "RadarCitation_snapshotId_idx" ON "RadarCitation"("snapshotId");

-- CreateIndex
CREATE INDEX "RadarWatch_active_idx" ON "RadarWatch"("active");

-- CreateIndex
CREATE UNIQUE INDEX "RadarWatch_categoryKey_countryCode_key" ON "RadarWatch"("categoryKey", "countryCode");

-- AddForeignKey
ALTER TABLE "RadarSnapshot" ADD CONSTRAINT "RadarSnapshot_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "RadarWatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarCitation" ADD CONSTRAINT "RadarCitation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RadarSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
