-- AYZENITH Product Intelligence V1 — "Ürün Fiyat & Fırsat Analizi".
--
-- PURELY ADDITIVE. Four new tables; not one existing table, column, index or
-- row is touched. Item, Channel and ImportCase gain only Prisma-side back
-- relations, which are virtual and produce no DDL.

-- CreateTable
CREATE TABLE "ProductAnalysis" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "itemId" TEXT,
    "importCaseId" TEXT,
    "channelId" TEXT,
    "marketplace" TEXT NOT NULL,
    "marketCountry" TEXT NOT NULL DEFAULT 'TR',
    "inputAttributes" JSONB NOT NULL,
    "scanScope" JSONB NOT NULL,
    "marketProfile" JSONB NOT NULL,
    "gapFindings" JSONB NOT NULL,
    "titleCandidates" JSONB NOT NULL,
    "priceStrategy" JSONB NOT NULL,
    "swot" JSONB NOT NULL,
    "launchPlan" JSONB NOT NULL,
    "dataConfidence" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "aiSummary" TEXT,
    "aiDisabledNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorOffer" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "sourceUrl" TEXT,
    "sourceKey" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "sellerName" TEXT,
    "price" DECIMAL(18,4),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "ratingAvg" DECIMAL(4,2),
    "ratingCount" INTEGER,
    "attributes" JSONB NOT NULL,
    "rawExcerpt" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "excludedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEvidence" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "offerId" TEXT,
    "area" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "polarity" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "detail" JSONB,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductScanSource" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "queryText" TEXT,
    "url" TEXT,
    "status" TEXT NOT NULL,
    "blockKind" TEXT,
    "httpStatus" INTEGER,
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromCache" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductScanSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductAnalysis_code_key" ON "ProductAnalysis"("code");
CREATE INDEX "ProductAnalysis_createdAt_idx" ON "ProductAnalysis"("createdAt");
CREATE INDEX "ProductAnalysis_itemId_idx" ON "ProductAnalysis"("itemId");
CREATE INDEX "ProductAnalysis_marketplace_idx" ON "ProductAnalysis"("marketplace");
CREATE INDEX "ProductAnalysis_status_idx" ON "ProductAnalysis"("status");
CREATE INDEX "CompetitorOffer_analysisId_idx" ON "CompetitorOffer"("analysisId");
CREATE INDEX "CompetitorOffer_analysisId_rank_idx" ON "CompetitorOffer"("analysisId", "rank");
CREATE INDEX "ProductEvidence_analysisId_idx" ON "ProductEvidence"("analysisId");
CREATE INDEX "ProductEvidence_analysisId_area_idx" ON "ProductEvidence"("analysisId", "area");
CREATE INDEX "ProductEvidence_offerId_idx" ON "ProductEvidence"("offerId");
CREATE INDEX "ProductScanSource_analysisId_idx" ON "ProductScanSource"("analysisId");

-- AddForeignKey
ALTER TABLE "ProductAnalysis" ADD CONSTRAINT "ProductAnalysis_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductAnalysis" ADD CONSTRAINT "ProductAnalysis_importCaseId_fkey" FOREIGN KEY ("importCaseId") REFERENCES "ImportCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductAnalysis" ADD CONSTRAINT "ProductAnalysis_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompetitorOffer" ADD CONSTRAINT "CompetitorOffer_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ProductAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductEvidence" ADD CONSTRAINT "ProductEvidence_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ProductAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductEvidence" ADD CONSTRAINT "ProductEvidence_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CompetitorOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductScanSource" ADD CONSTRAINT "ProductScanSource_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ProductAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
