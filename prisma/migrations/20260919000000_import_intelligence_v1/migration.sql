-- Import Intelligence V1 — purely additive: new enums, new tables, FKs only on the new tables.

-- CreateEnum
CREATE TYPE "ImportSourceStatus" AS ENUM ('OK', 'UNREACHABLE', 'MANUAL_ONLY', 'PARSE_FAILED', 'CHANGED');

-- CreateEnum
CREATE TYPE "ImportRuleKind" AS ENUM ('CUSTOMS_DUTY', 'ADDITIONAL_DUTY', 'ANTI_DUMPING', 'COUNTERVAILING', 'SAFEGUARD', 'VAT', 'EXCISE', 'SURVEILLANCE', 'QUOTA', 'IMPORT_INSPECTION', 'SPECIAL_REGIME');

-- CreateTable
CREATE TABLE "ImportSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publisher" TEXT,
    "sourceType" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "status" "ImportSourceStatus" NOT NULL DEFAULT 'OK',
    "statusCode" INTEGER,
    "contentType" TEXT,
    "contentHash" TEXT,
    "etag" TEXT,
    "lastModified" TEXT,
    "byteSize" INTEGER,
    "fetchedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "publicationDate" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "consolidatedAsOf" TIMESTAMP(3),
    "version" TEXT,
    "extractionMethod" TEXT,
    "error" TEXT,
    "rawContent" TEXT,
    "parsed" JSONB,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportTariffLine" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "fullDescription" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "unit" TEXT,
    "legalRate474" DECIMAL(9,3),
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "ImportTariffLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRule" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" "ImportRuleKind" NOT NULL,
    "gtipPrefix" TEXT NOT NULL,
    "originCountry" TEXT,
    "columnRates" JSONB,
    "ratePct" DECIMAL(9,4),
    "rateText" TEXT,
    "rateType" TEXT NOT NULL,
    "footnote" TEXT,
    "legalRef" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "publicationDate" TIMESTAMP(3),
    "sourceVersion" TEXT,
    "amendment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_FORCE',
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportCase" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "itemId" TEXT,
    "supplierId" TEXT,
    "purchaseId" TEXT,
    "importDate" TIMESTAMP(3) NOT NULL,
    "originCountry" TEXT,
    "dispatchCountry" TEXT,
    "atrAvailable" BOOLEAN,
    "originProof" TEXT,
    "customsStatus" TEXT,
    "gtipMode" TEXT NOT NULL,
    "userGtip" TEXT,
    "predictedGtip" TEXT,
    "classificationStatus" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "productProfile" JSONB NOT NULL,
    "origin" JSONB NOT NULL,
    "compliance" JSONB NOT NULL,
    "tax" JSONB NOT NULL,
    "logistics" JSONB NOT NULL,
    "landedCost" JSONB NOT NULL,
    "statusSummary" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportClassificationCandidate" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "gtip" TEXT NOT NULL,
    "gtipDescription" TEXT NOT NULL,
    "confidencePct" DECIMAL(6,2) NOT NULL,
    "status" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "rationale" JSONB NOT NULL,

    CONSTRAINT "ImportClassificationCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportEvidence" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "candidateId" TEXT,
    "sourceId" TEXT,
    "ruleId" TEXT,
    "area" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "polarity" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportSource_key_isCurrent_idx" ON "ImportSource"("key", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "ImportSource_key_contentHash_key" ON "ImportSource"("key", "contentHash");

-- CreateIndex
CREATE INDEX "ImportTariffLine_system_code_idx" ON "ImportTariffLine"("system", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ImportTariffLine_sourceId_system_code_key" ON "ImportTariffLine"("sourceId", "system", "code");

-- CreateIndex
CREATE INDEX "ImportRule_kind_gtipPrefix_idx" ON "ImportRule"("kind", "gtipPrefix");

-- CreateIndex
CREATE INDEX "ImportRule_sourceId_idx" ON "ImportRule"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportCase_code_key" ON "ImportCase"("code");

-- CreateIndex
CREATE INDEX "ImportCase_createdAt_idx" ON "ImportCase"("createdAt");

-- CreateIndex
CREATE INDEX "ImportCase_itemId_idx" ON "ImportCase"("itemId");

-- CreateIndex
CREATE INDEX "ImportCase_supplierId_idx" ON "ImportCase"("supplierId");

-- CreateIndex
CREATE INDEX "ImportCase_purchaseId_idx" ON "ImportCase"("purchaseId");

-- CreateIndex
CREATE INDEX "ImportClassificationCandidate_caseId_idx" ON "ImportClassificationCandidate"("caseId");

-- CreateIndex
CREATE INDEX "ImportEvidence_caseId_idx" ON "ImportEvidence"("caseId");

-- CreateIndex
CREATE INDEX "ImportEvidence_candidateId_idx" ON "ImportEvidence"("candidateId");

-- CreateIndex
CREATE INDEX "ImportEvidence_sourceId_idx" ON "ImportEvidence"("sourceId");

-- AddForeignKey
ALTER TABLE "ImportTariffLine" ADD CONSTRAINT "ImportTariffLine_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImportSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRule" ADD CONSTRAINT "ImportRule_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImportSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportCase" ADD CONSTRAINT "ImportCase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportCase" ADD CONSTRAINT "ImportCase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportCase" ADD CONSTRAINT "ImportCase_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportClassificationCandidate" ADD CONSTRAINT "ImportClassificationCandidate_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ImportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportEvidence" ADD CONSTRAINT "ImportEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ImportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportEvidence" ADD CONSTRAINT "ImportEvidence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ImportClassificationCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportEvidence" ADD CONSTRAINT "ImportEvidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImportSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportEvidence" ADD CONSTRAINT "ImportEvidence_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ImportRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

