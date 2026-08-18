-- CreateEnum
CREATE TYPE "TradeDocType" AS ENUM ('QUOTATION', 'PROFORMA_INVOICE', 'COMMERCIAL_INVOICE', 'PACKING_LIST');

-- CreateEnum
CREATE TYPE "TradeDocLanguage" AS ENUM ('TR', 'EN', 'DE');

-- CreateEnum
CREATE TYPE "TradeDocStatus" AS ENUM ('DRAFT', 'FINAL', 'CANCELLED');

-- AlterTable
ALTER TABLE "OsSetting" ADD COLUMN     "companyAddress" TEXT,
ADD COLUMN     "companyChamberReg" TEXT,
ADD COLUMN     "companyCity" TEXT,
ADD COLUMN     "companyCountry" TEXT,
ADD COLUMN     "companyEmail" TEXT,
ADD COLUMN     "companyLegalName" TEXT,
ADD COLUMN     "companyLogoUrl" TEXT,
ADD COLUMN     "companyPhone" TEXT,
ADD COLUMN     "companyPostalCode" TEXT,
ADD COLUMN     "companyTaxNumber" TEXT,
ADD COLUMN     "companyTradingName" TEXT,
ADD COLUMN     "companyVatNumber" TEXT,
ADD COLUMN     "companyWebsite" TEXT,
ADD COLUMN     "defaultDocFooterNote" TEXT,
ADD COLUMN     "defaultDocLanguage" "TradeDocLanguage" NOT NULL DEFAULT 'EN';

-- CreateTable
CREATE TABLE "CompanySignatory" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "signatureUrl" TEXT,
    "signatureDisplayName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "supportedDocTypes" "TradeDocType"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySignatory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyBankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "iban" TEXT,
    "swift" TEXT,
    "currency" TEXT NOT NULL,
    "country" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeDocument" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "docType" "TradeDocType" NOT NULL,
    "saleId" TEXT NOT NULL,
    "language" "TradeDocLanguage" NOT NULL DEFAULT 'EN',
    "currency" TEXT NOT NULL,
    "status" "TradeDocStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "parentDocumentId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "incoterm" TEXT,
    "shippingMethod" TEXT,
    "countryOfOrigin" TEXT,
    "paymentTermsOverride" TEXT,
    "deliveryTermsOverride" TEXT,
    "customerNote" TEXT,
    "paymentNote" TEXT,
    "deliveryNote" TEXT,
    "specialTerms" TEXT,
    "footerNote" TEXT,
    "shipToName" TEXT,
    "shipToAddress" TEXT,
    "shipToCity" TEXT,
    "shipToPostal" TEXT,
    "shipToCountry" TEXT,
    "showBankDetails" BOOLEAN NOT NULL DEFAULT true,
    "showVat" BOOLEAN NOT NULL DEFAULT true,
    "showHsCode" BOOLEAN NOT NULL DEFAULT false,
    "showCountryOrigin" BOOLEAN NOT NULL DEFAULT false,
    "showSignature" BOOLEAN NOT NULL DEFAULT true,
    "showShipping" BOOLEAN NOT NULL DEFAULT false,
    "signatoryId" TEXT,
    "signatoryName" TEXT,
    "signatoryTitle" TEXT,
    "bankAccountId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeDocumentLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "saleLineId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "hsCode" TEXT,
    "countryOfOrigin" TEXT,
    "packages" INTEGER,
    "netWeight" DECIMAL(18,3),
    "grossWeight" DECIMAL(18,3),
    "dimensions" TEXT,

    CONSTRAINT "TradeDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanySignatory_active_idx" ON "CompanySignatory"("active");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_active_idx" ON "CompanyBankAccount"("active");

-- CreateIndex
CREATE INDEX "TradeDocument_saleId_idx" ON "TradeDocument"("saleId");

-- CreateIndex
CREATE INDEX "TradeDocument_docType_idx" ON "TradeDocument"("docType");

-- CreateIndex
CREATE INDEX "TradeDocument_status_idx" ON "TradeDocument"("status");

-- CreateIndex
CREATE INDEX "TradeDocument_isLatest_idx" ON "TradeDocument"("isLatest");

-- CreateIndex
CREATE INDEX "TradeDocument_code_idx" ON "TradeDocument"("code");

-- CreateIndex
CREATE INDEX "TradeDocumentLine_documentId_idx" ON "TradeDocumentLine"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeDocumentLine_documentId_saleLineId_key" ON "TradeDocumentLine"("documentId", "saleLineId");

-- AddForeignKey
ALTER TABLE "TradeDocument" ADD CONSTRAINT "TradeDocument_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeDocument" ADD CONSTRAINT "TradeDocument_parentDocumentId_fkey" FOREIGN KEY ("parentDocumentId") REFERENCES "TradeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeDocument" ADD CONSTRAINT "TradeDocument_signatoryId_fkey" FOREIGN KEY ("signatoryId") REFERENCES "CompanySignatory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeDocument" ADD CONSTRAINT "TradeDocument_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeDocumentLine" ADD CONSTRAINT "TradeDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "TradeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeDocumentLine" ADD CONSTRAINT "TradeDocumentLine_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "SaleLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
