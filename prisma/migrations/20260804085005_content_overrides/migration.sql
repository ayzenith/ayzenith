-- CreateTable
CREATE TABLE "ContentOverride" (
    "key" TEXT NOT NULL,
    "en" TEXT,
    "tr" TEXT,
    "de" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentOverride_pkey" PRIMARY KEY ("key")
);
