-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadProductFit" ADD VALUE 'LIKELY';
ALTER TYPE "LeadProductFit" ADD VALUE 'NOT_RELEVANT';

-- AlterEnum
ALTER TYPE "LeadSize" ADD VALUE 'MICRO';

-- AlterTable
ALTER TABLE "LeadCompany" ADD COLUMN     "detectedModel" TEXT,
ADD COLUMN     "employeeCount" INTEGER,
ADD COLUMN     "matchStatus" TEXT,
ADD COLUMN     "productCategories" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "storeCount" INTEGER,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "websiteStatus" TEXT;
