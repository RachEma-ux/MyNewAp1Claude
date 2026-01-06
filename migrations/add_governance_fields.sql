-- Add governance fields to agents table
-- Migration: add_governance_fields
-- Date: 2026-01-03

ALTER TABLE agents 
ADD COLUMN lifecycleState ENUM('draft', 'sandbox', 'governed', 'disabled') DEFAULT 'draft' AFTER autoSummarize,
ADD COLUMN lifecycleVersion INT DEFAULT 1 AFTER lifecycleState,
ADD COLUMN origin VARCHAR(50) DEFAULT 'scratch' AFTER lifecycleVersion,
ADD COLUMN trigger JSON AFTER origin,
ADD COLUMN limits JSON AFTER trigger,
ADD COLUMN anatomy JSON AFTER limits,
ADD COLUMN policyContext JSON AFTER anatomy;

-- Add index for lifecycle queries
CREATE INDEX idx_lifecycle_state ON agents(lifecycleState);
CREATE INDEX idx_lifecycle_version ON agents(lifecycleVersion);
