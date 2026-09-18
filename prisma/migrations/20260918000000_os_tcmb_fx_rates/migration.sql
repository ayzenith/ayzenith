-- Business OS — official TCMB exchange-rate bulletins. Purely additive.

-- AlterTable
ALTER TABLE "OsSetting" ADD COLUMN     "fxDateRule" TEXT NOT NULL DEFAULT 'PREVIOUS_BULLETIN',
ADD COLUMN     "fxRateType" TEXT NOT NULL DEFAULT 'FOREX_BUYING';

-- CreateTable
CREATE TABLE "FxBulletin" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'TCMB',
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "bulletinNo" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxBulletin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "bulletinId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "unit" INTEGER NOT NULL DEFAULT 1,
    "forexBuying" DECIMAL(18,8),
    "forexSelling" DECIMAL(18,8),
    "banknoteBuying" DECIMAL(18,8),
    "banknoteSelling" DECIMAL(18,8),

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FxBulletin_date_idx" ON "FxBulletin"("date");

-- CreateIndex
CREATE UNIQUE INDEX "FxBulletin_source_date_key" ON "FxBulletin"("source", "date");

-- CreateIndex
CREATE INDEX "FxRate_currency_idx" ON "FxRate"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_bulletinId_currency_key" ON "FxRate"("bulletinId", "currency");

-- AddForeignKey
ALTER TABLE "FxRate" ADD CONSTRAINT "FxRate_bulletinId_fkey" FOREIGN KEY ("bulletinId") REFERENCES "FxBulletin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
