-- CreateTable
CREATE TABLE "SiteSetting" (
    "id" TEXT NOT NULL DEFAULT 'site',
    "companyEmail" TEXT,
    "companyPhone" TEXT,
    "companyLocation" TEXT,
    "hoursShort" TEXT,
    "hoursLong" TEXT,
    "linkedin" TEXT,
    "instagram" TEXT,
    "x" TEXT,
    "youtube" TEXT,
    "facebook" TEXT,
    "ga4Id" TEXT,
    "clarityId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);
