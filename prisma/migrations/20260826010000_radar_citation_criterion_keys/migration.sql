-- Additive: which scoring criteria a citation backs, so a figure can be
-- traced from a criterion straight to the sources behind it.
ALTER TABLE "RadarCitation" ADD COLUMN "criterionKeys" JSONB NOT NULL DEFAULT '[]';
