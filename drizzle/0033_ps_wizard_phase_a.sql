-- PS Wizard Phase A: override reason, winner margin, confidence gate, KPI targets
ALTER TABLE "ps_projects"
  ADD COLUMN IF NOT EXISTS "override_reason" text,
  ADD COLUMN IF NOT EXISTS "winner_margin" numeric(10, 2),
  ADD COLUMN IF NOT EXISTS "confidence_gate_result" varchar(20),
  ADD COLUMN IF NOT EXISTS "kpi_targets_json" json;
