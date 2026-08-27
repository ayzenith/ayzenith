-- RADAR accuracy Phase 4: split the single `completeness` scalar into its four
-- real dimensions (peer coverage, provider availability, source freshness, data
-- completeness) so confidence can be explained rather than merely stated.
-- Additive: defaults to an empty object, and the FINAL SCORE IS UNAFFECTED.
ALTER TABLE "RadarSnapshot" ADD COLUMN "completenessBreakdown" JSONB NOT NULL DEFAULT '{}';
