-- Additive: non-fatal provider warnings, frozen per snapshot (previously
-- computed in analyze.ts and discarded before ever reaching the database).
ALTER TABLE "RadarSnapshot" ADD COLUMN "errors" JSONB NOT NULL DEFAULT '[]';
