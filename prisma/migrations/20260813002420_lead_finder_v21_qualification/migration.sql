-- AlterTable
ALTER TABLE "LeadCompany" ADD COLUMN     "canonicalName" TEXT,
ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "locationCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "modelFit" TEXT,
ADD COLUMN     "modelFitEvidence" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "productFitTier" TEXT,
ADD COLUMN     "socialBusinessSignal" TEXT,
ADD COLUMN     "socialMatchStatus" TEXT,
ADD COLUMN     "socialProductSignal" TEXT,
ADD COLUMN     "socialVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "tiktokUrl" TEXT,
ADD COLUMN     "xUrl" TEXT,
ADD COLUMN     "youtubeUrl" TEXT;

-- CreateTable
CREATE TABLE "LeadLocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT,
    "address" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "sourceType" "LeadSourceType" NOT NULL DEFAULT 'OSM',
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadLocation_companyId_idx" ON "LeadLocation"("companyId");

-- AddForeignKey
ALTER TABLE "LeadLocation" ADD CONSTRAINT "LeadLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "LeadCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
