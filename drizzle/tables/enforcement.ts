/**
 * Enforcement Database Tables — Governance Bible CGT v2
 *
 * Phase 3 — Structural Enforcement Persistence
 *
 * Tables:
 *   - subject_freezes: Active freeze records (DELETE on unfreeze)
 *   - drift_events: Append-only drift detection history
 *   - evidence_bundles: Content-addressed evidence storage
 *
 * Constraints:
 *   - drift_events are append-only (no UPDATE, no DELETE)
 *   - evidence_bundles are immutable (no UPDATE, no DELETE)
 *   - subject_freezes are mutable (INSERT on freeze, DELETE on unfreeze)
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
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================================
// Subject Freezes — Active freeze records
// ============================================================================

export const subjectFreezes = pgTable("subject_freezes", {
  id: serial("id").primaryKey(),

  /** Subject ID (0 = system-wide freeze) */
  subjectId: integer("subject_id").notNull(),

  /** Human-readable subject name */
  subjectName: varchar("subject_name", { length: 255 }).notNull(),

  /** Why the subject was frozen */
  reason: text("reason").notNull(),

  /** Score at time of freeze */
  scoreAtFreeze: integer("score_at_freeze").notNull(),

  /** Who/what triggered the freeze */
  frozenBy: varchar("frozen_by", { length: 255 }).notNull(),

  /** When the freeze was applied */
  frozenAt: timestamp("frozen_at").defaultNow().notNull(),
}, (table) => ({
  subjectIdx: uniqueIndex("idx_subject_freezes_subject").on(table.subjectId),
}));

export type SubjectFreeze = typeof subjectFreezes.$inferSelect;
export type InsertSubjectFreeze = typeof subjectFreezes.$inferInsert;

// ============================================================================
// Drift Events — Append-only drift detection history
// ============================================================================

export const driftEvents = pgTable("drift_events", {
  id: serial("id").primaryKey(),

  /** Whether drift was detected */
  driftDetected: boolean("drift_detected").notNull(),

  /** Score delta from last known-good */
  scoreDelta: integer("score_delta").notNull(),

  /** Previous score */
  previousScore: integer("previous_score").notNull(),

  /** Current score */
  currentScore: integer("current_score").notNull(),

  /** New violations since last check */
  newViolations: json("new_violations").$type<string[]>().notNull(),

  /** Resolved violations since last check */
  resolvedViolations: json("resolved_violations").$type<string[]>().notNull(),

  /** Whether re-score passed the gate */
  gatePassed: boolean("gate_passed").notNull(),

  /** Escalation needed */
  escalationNeeded: boolean("escalation_needed").notNull(),

  /** Escalation reason */
  escalationReason: text("escalation_reason"),

  /** Subjects frozen in this detection cycle */
  frozenSubjectIds: json("frozen_subject_ids").$type<number[]>().notNull(),

  /** When this drift event was recorded */
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdIdx: index("idx_drift_events_created").on(table.createdAt),
  driftIdx: index("idx_drift_events_drift").on(table.driftDetected),
}));

export type DriftEvent = typeof driftEvents.$inferSelect;
export type InsertDriftEvent = typeof driftEvents.$inferInsert;

// ============================================================================
// Evidence Bundles — Content-addressed evidence storage
// ============================================================================

export const evidenceBundles = pgTable("evidence_bundles", {
  id: serial("id").primaryKey(),

  /** Unique bundle identifier (e.g., EVB-1234567890-abc123) */
  bundleId: varchar("bundle_id", { length: 100 }).notNull(),

  /** Bundle schema version */
  version: varchar("version", { length: 10 }).notNull(),

  /** Target lifecycle stage */
  stage: varchar("stage", { length: 50 }).notNull(),

  /** Overall score */
  score: integer("score").notNull(),

  /** Gate pass/fail */
  gatePassed: boolean("gate_passed").notNull(),

  /** Gate reason */
  gateReason: text("gate_reason"),

  /** Who triggered the scorecard */
  triggeredBy: varchar("triggered_by", { length: 255 }),

  /** Git commit reference */
  commitRef: varchar("commit_ref", { length: 64 }),

  /** SHA-256 integrity hash */
  integrityHash: varchar("integrity_hash", { length: 64 }).notNull(),

  /** Full bundle data as JSON */
  bundleData: json("bundle_data").$type<Record<string, unknown>>().notNull(),

  /** When this bundle was stored */
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bundleIdIdx: uniqueIndex("idx_evidence_bundles_bundle_id").on(table.bundleId),
  stageIdx: index("idx_evidence_bundles_stage").on(table.stage),
  createdIdx: index("idx_evidence_bundles_created").on(table.createdAt),
  hashIdx: index("idx_evidence_bundles_hash").on(table.integrityHash),
}));

export type EvidenceBundle = typeof evidenceBundles.$inferSelect;
export type InsertEvidenceBundle = typeof evidenceBundles.$inferInsert;
