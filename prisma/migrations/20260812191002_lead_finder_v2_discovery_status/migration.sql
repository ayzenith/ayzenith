-- AlterTable
ALTER TABLE "LeadSearch" ADD COLUMN     "discoveryStatus" TEXT NOT NULL DEFAULT 'OK',
ADD COLUMN     "sourceStats" JSONB NOT NULL DEFAULT '{}';
