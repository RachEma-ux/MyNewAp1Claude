-- Add missing columns to ps_ideation_screening_scores, ps_ideation_scenarios,
-- and ps_ideation_feasibility_checks to match Drizzle schema definitions.
-- Also rename finding1/finding2 to finding_1/finding_2 in feasibility_checks.

ALTER TABLE "ps_ideation_screening_scores"
  ADD COLUMN IF NOT EXISTS "scored_by" integer;

ALTER TABLE "ps_ideation_scenarios"
  ADD COLUMN IF NOT EXISTS "created_by" integer,
  ADD COLUMN IF NOT EXISTS "updated_by" integer;

ALTER TABLE "ps_ideation_feasibility_checks"
  ADD COLUMN IF NOT EXISTS "created_by" integer,
  ADD COLUMN IF NOT EXISTS "updated_by" integer;

-- Rename finding columns to match Drizzle schema (finding_1 / finding_2)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='ps_ideation_feasibility_checks' AND column_name='finding1') THEN
    ALTER TABLE ps_ideation_feasibility_checks RENAME COLUMN finding1 TO finding_1;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='ps_ideation_feasibility_checks' AND column_name='finding2') THEN
    ALTER TABLE ps_ideation_feasibility_checks RENAME COLUMN finding2 TO finding_2;
  END IF;
END
$$;
