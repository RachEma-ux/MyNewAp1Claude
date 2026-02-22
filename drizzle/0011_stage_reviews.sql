-- Per-stage review tracking: each lifecycle stage has its own review state
-- Format: {"register": "approved", "validate": "needs_review", "publish": "needs_review"}
ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "stageReviews" json DEFAULT '{}';
