-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('DISCOVERED', 'SCREENING', 'QUALIFIED', 'HIGH_PRIORITY', 'REJECTED', 'DUPLICATE', 'INACTIVE', 'INSUFFICIENT_DATA', 'CONTACTED', 'REPLIED', 'MEETING', 'QUOTATION', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadSize" AS ENUM ('LARGE', 'MEDIUM', 'SMALL', 'ONLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LeadProductFit" AS ENUM ('VERIFIED', 'UNCLEAR', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "LeadSignalStrength" AS ENUM ('STRONG', 'MEDIUM', 'WEAK', 'NONE');

-- CreateEnum
CREATE TYPE "LeadFreshness" AS ENUM ('FRESH', 'RECHECK', 'STALE');

-- CreateEnum
CREATE TYPE "LeadSourceType" AS ENUM ('OSM', 'OFFICIAL_WEBSITE', 'PUBLIC_WEB', 'PUBLIC_BUSINESS_DIRECTORY', 'RADAR', 'MANUAL', 'OTHER_FREE_SOURCE');

-- CreateTable
CREATE TABLE "LeadSearch" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "countryLabel" TEXT NOT NULL,
    "city" TEXT,
    "productQuery" TEXT NOT NULL,
    "businessModel" TEXT NOT NULL DEFAULT 'B2B',
    "leadTypes" JSONB NOT NULL DEFAULT '[]',
    "searchTerms" JSONB NOT NULL DEFAULT '[]',
    "radarSnapshotId" TEXT,
    "categoryKey" TEXT,
    "hs6" TEXT,
    "radarScore" INTEGER,
    "radarDecision" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'DISCOVERED',
    "totalDiscovered" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCompany" (
    "id" TEXT NOT NULL,
    "searchId" TEXT,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "domain" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "businessModel" TEXT NOT NULL DEFAULT 'B2B',
    "commercialRoles" JSONB NOT NULL DEFAULT '[]',
    "size" "LeadSize" NOT NULL DEFAULT 'UNKNOWN',
    "sizeSignals" JSONB NOT NULL DEFAULT '[]',
    "productFit" "LeadProductFit" NOT NULL DEFAULT 'UNVERIFIED',
    "productFitNote" TEXT,
    "leadScore" INTEGER,
    "leadConfidence" INTEGER,
    "scoreBreakdown" JSONB NOT NULL DEFAULT '{}',
    "status" "LeadStatus" NOT NULL DEFAULT 'DISCOVERED',
    "freshness" "LeadFreshness" NOT NULL DEFAULT 'FRESH',
    "radarSnapshotId" TEXT,
    "discoveredVia" "LeadSourceType" NOT NULL DEFAULT 'OSM',
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" TEXT,
    "roleVerified" BOOLEAN NOT NULL DEFAULT false,
    "corporateEmail" TEXT,
    "profileUrl" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "source" "LeadSourceType" NOT NULL DEFAULT 'OFFICIAL_WEBSITE',
    "sourceUrl" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dataField" TEXT NOT NULL,
    "sourceType" "LeadSourceType" NOT NULL,
    "label" TEXT,
    "sourceUrl" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSignal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "strength" "LeadSignalStrength" NOT NULL DEFAULT 'NONE',
    "note" TEXT,
    "sourceType" "LeadSourceType" NOT NULL DEFAULT 'PUBLIC_WEB',
    "sourceUrl" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadVerification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "check" TEXT NOT NULL,
    "passed" BOOLEAN,
    "evidence" TEXT,
    "sourceUrl" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadExport" (
    "id" TEXT NOT NULL,
    "searchId" TEXT,
    "format" TEXT NOT NULL,
    "filterJson" JSONB NOT NULL DEFAULT '{}',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSetting" (
    "id" TEXT NOT NULL DEFAULT 'lead',
    "weights" JSONB,
    "thresholds" JSONB,
    "recheckDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadSearch_country_idx" ON "LeadSearch"("country");

-- CreateIndex
CREATE INDEX "LeadSearch_createdAt_idx" ON "LeadSearch"("createdAt");

-- CreateIndex
CREATE INDEX "LeadSearch_radarSnapshotId_idx" ON "LeadSearch"("radarSnapshotId");

-- CreateIndex
CREATE INDEX "LeadCompany_searchId_idx" ON "LeadCompany"("searchId");

-- CreateIndex
CREATE INDEX "LeadCompany_country_city_idx" ON "LeadCompany"("country", "city");

-- CreateIndex
CREATE INDEX "LeadCompany_domain_idx" ON "LeadCompany"("domain");

-- CreateIndex
CREATE INDEX "LeadCompany_status_idx" ON "LeadCompany"("status");

-- CreateIndex
CREATE INDEX "LeadCompany_leadScore_idx" ON "LeadCompany"("leadScore");

-- CreateIndex
CREATE INDEX "LeadContact_companyId_idx" ON "LeadContact"("companyId");

-- CreateIndex
CREATE INDEX "LeadSource_companyId_idx" ON "LeadSource"("companyId");

-- CreateIndex
CREATE INDEX "LeadSignal_companyId_idx" ON "LeadSignal"("companyId");

-- CreateIndex
CREATE INDEX "LeadVerification_companyId_idx" ON "LeadVerification"("companyId");

-- CreateIndex
CREATE INDEX "LeadExport_searchId_idx" ON "LeadExport"("searchId");

-- CreateIndex
CREATE INDEX "LeadExport_createdAt_idx" ON "LeadExport"("createdAt");

-- AddForeignKey
ALTER TABLE "LeadCompany" ADD CONSTRAINT "LeadCompany_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "LeadSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadContact" ADD CONSTRAINT "LeadContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "LeadCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "LeadCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSignal" ADD CONSTRAINT "LeadSignal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "LeadCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadVerification" ADD CONSTRAINT "LeadVerification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "LeadCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadExport" ADD CONSTRAINT "LeadExport_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "LeadSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
