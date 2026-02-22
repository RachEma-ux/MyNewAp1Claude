/**
 * Governance Database Tables — Governance Bible CGT v2
 *
 * Phase 1 — Database Foundation
 * Role: CE-A (Backend Engine & Middleware)
 *
 * Tables:
 *   - governance_scorecards: Persisted scorecard results (immutable once written)
 *   - governance_audit_logs: Append-only audit trail for all governance decisions
 *
 * Constraints:
 *   - No publish when frozen (enforced via application layer + DB check)
 *   - Scorecards are immutable (no UPDATE, only INSERT)
 *   - Audit logs are append-only (no UPDATE, no DELETE)
 */

import {
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  json,
  pgTable,
  index,
} from "drizzle-orm/pg-core";

// ============================================================================
// Governance Scorecards — Immutable scorecard persistence
// ============================================================================

export const governanceScorecards = pgTable("governance_scorecards", {
  id: serial("id").primaryKey(),

  // Subject reference
  subjectId: integer("subject_id"),
  subjectName: varchar("subject_name", { length: 255 }),
  subjectType: varchar("subject_type", { length: 50 }),

  // Lifecycle context
  stage: varchar("stage", { length: 50 }).notNull(),
  commitRef: varchar("commit_ref", { length: 64 }),

  // Scores
  score: integer("score").notNull(),
  maxWeight: integer("max_weight").notNull(),
  achievedWeight: integer("achieved_weight").notNull(),

  // Gate verdict — ALLOW or DENY (non-negotiable)
  gateVerdict: varchar("gate_verdict", { length: 10 }).notNull(),
  gateReason: text("gate_reason"),

  // Risk breakdown
  riskCritical: integer("risk_critical").default(0).notNull(),
  riskHigh: integer("risk_high").default(0).notNull(),
  riskMedium: integer("risk_medium").default(0).notNull(),
  riskLow: integer("risk_low").default(0).notNull(),

  // Counts
  controlsTotal: integer("controls_total").notNull(),
  controlsPassed: integer("controls_passed").notNull(),
  controlsFailed: integer("controls_failed").notNull(),
  controlsSkipped: integer("controls_skipped").notNull(),

  // Full control results (JSON blob)
  controlResults: json("control_results").$type<any[]>(),

  // Pack resolution
  loadedPacks: json("loaded_packs").$type<string[]>(),
  missingPacks: json("missing_packs").$type<string[]>(),

  // Evidence
  evidenceBundleId: varchar("evidence_bundle_id", { length: 100 }),
  evidenceHash: varchar("evidence_hash", { length: 64 }),
  evidenceArtifactPath: varchar("evidence_artifact_path", { length: 500 }),

  // Actor
  triggeredBy: varchar("triggered_by", { length: 255 }),
  actorRole: varchar("actor_role", { length: 50 }),

  // Metadata
  blocked: boolean("blocked").default(false).notNull(),
  httpStatus: integer("http_status").default(200),

  // Timestamps (immutable — no updatedAt)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  subjectIdx: index("idx_gov_scorecard_subject").on(table.subjectId),
  stageIdx: index("idx_gov_scorecard_stage").on(table.stage),
  verdictIdx: index("idx_gov_scorecard_verdict").on(table.gateVerdict),
  createdIdx: index("idx_gov_scorecard_created").on(table.createdAt),
  subjectStageIdx: index("idx_gov_scorecard_subject_stage").on(table.subjectId, table.stage),
  evidenceIdx: index("idx_gov_scorecard_evidence").on(table.evidenceBundleId),
}));

export type GovernanceScorecard = typeof governanceScorecards.$inferSelect;
export type InsertGovernanceScorecard = typeof governanceScorecards.$inferInsert;

// NOTE: governanceAuditLogs table is defined in drizzle/tables/agents.ts
// to avoid duplicate exports through schema.ts barrel.
