-- Lead Finder accuracy Phase 4: persist the evidence behind each verdict.
-- Additive and backwards compatible: every column is nullable or defaulted, so
-- existing rows keep their exact current meaning and read as "not measured"
-- (never as zero) until they are next verified.
ALTER TABLE "LeadCompany" ADD COLUMN "identityStatus" TEXT;
ALTER TABLE "LeadCompany" ADD COLUMN "identityConfidence" INTEGER;
ALTER TABLE "LeadCompany" ADD COLUMN "identityReasons" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "LeadCompany" ADD COLUMN "productEvidenceLevel" INTEGER;
ALTER TABLE "LeadCompany" ADD COLUMN "productConfidence" INTEGER;
ALTER TABLE "LeadCompany" ADD COLUMN "productNegatives" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "LeadCompany" ADD COLUMN "companyType" TEXT;
ALTER TABLE "LeadCompany" ADD COLUMN "companyTypeConfidence" INTEGER;
ALTER TABLE "LeadCompany" ADD COLUMN "evidenceCoverage" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "LeadCompany" ADD COLUMN "overallConfidence" INTEGER;
