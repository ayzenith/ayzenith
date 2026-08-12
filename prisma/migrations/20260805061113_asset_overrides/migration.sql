-- CreateTable
CREATE TABLE "AssetOverride" (
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetOverride_pkey" PRIMARY KEY ("key")
);
