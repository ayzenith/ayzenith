-- AYZENITH RADAR V1.1 — specific-product analysis scope.
--
-- PURELY ADDITIVE. Adds three columns to RadarSnapshot so an analysis can be a
-- single-product (HS-6) analysis instead of a whole-category one. Backward
-- compatible: existing rows backfill analysisType = 'category' (the original
-- behaviour) and keep productName/hsCode NULL. No data is dropped, renamed or
-- recomputed — frozen scores are untouched.
--
-- AlterTable
ALTER TABLE "RadarSnapshot" ADD COLUMN     "analysisType" TEXT NOT NULL DEFAULT 'category',
ADD COLUMN     "hsCode" TEXT,
ADD COLUMN     "productName" TEXT;
