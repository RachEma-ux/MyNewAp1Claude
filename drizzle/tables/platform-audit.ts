/**
 * Platform Audit Database Tables
 *
 * Tables:
 *   - governance_audit_runs: Persisted platform audit run results
 *   - governance_audit_preferences: Per-admin default audit settings
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
// Governance Audit Runs — Platform audit execution history
// ============================================================================

export const governanceAuditRuns = pgTable("governance_audit_runs", {
  id: serial("id").primaryKey(),

  // Run configuration
  status: varchar("status", { length: 20 }).notNull(), // queued|running|pass|fail|error
  format: varchar("format", { length: 10 }).notNull(), // json|txt|both
  strict: boolean("strict").default(false).notNull(),
  design: varchar("design", { length: 20 }).notNull(), // executive|standard|forensics

  // Timing
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  durationMs: integer("duration_ms"),

  // Actor
  triggeredBy: varchar("triggered_by", { length: 255 }),

  // Error info (only when status = 'error')
  errorMessage: text("error_message"),

  // Parsed results
  summaryJson: json("summary_json").$type<any>(),
  violationsJson: json("violations_json").$type<any[]>(),
  coverageJson: json("coverage_json").$type<any>(),

  // Artifact references (SHA-256 in ArtifactStore)
  jsonRef: varchar("json_ref", { length: 128 }),
  txtRef: varchar("txt_ref", { length: 128 }),

  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  startedIdx: index("idx_audit_run_started").on(table.startedAt),
  statusIdx: index("idx_audit_run_status").on(table.status),
  triggeredIdx: index("idx_audit_run_triggered").on(table.triggeredBy),
}));

export type GovernanceAuditRun = typeof governanceAuditRuns.$inferSelect;
export type InsertGovernanceAuditRun = typeof governanceAuditRuns.$inferInsert;

// ============================================================================
// Governance Audit Preferences — Per-admin default settings
// ============================================================================

export const governanceAuditPreferences = pgTable("governance_audit_preferences", {
  id: serial("id").primaryKey(),
  principalId: varchar("principal_id", { length: 255 }).notNull().unique(),
  defaultFormat: varchar("default_format", { length: 10 }).notNull(),
  defaultDesign: varchar("default_design", { length: 20 }).notNull(),
  defaultStrict: boolean("default_strict").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GovernanceAuditPreference = typeof governanceAuditPreferences.$inferSelect;
export type InsertGovernanceAuditPreference = typeof governanceAuditPreferences.$inferInsert;
