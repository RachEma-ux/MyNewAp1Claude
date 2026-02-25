/**
 * Operator Runtime Database Tables
 *
 * Tables:
 *   - operator_jobs: Job lifecycle tracking
 *   - operator_audit_log: Append-only syscall audit trail
 *   - syscall_batches: Stored operator-generated plans
 *   - execution_results: Stored kernel execution results
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
// Operator Jobs — Job lifecycle tracking
// ============================================================================

export const operatorJobs = pgTable("operator_jobs", {
  id: serial("id").primaryKey(),
  jobId: varchar("job_id", { length: 64 }).notNull().unique(),
  operator: varchar("operator", { length: 32 }).notNull(),
  intentDescription: text("intent_description").notNull(),
  intentJson: json("intent_json").$type<any>().notNull(),
  constraintsJson: json("constraints_json").$type<any>().notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  traceId: varchar("trace_id", { length: 64 }).notNull(),
  requestedBy: varchar("requested_by", { length: 255 }).notNull(),
  workspaceId: integer("workspace_id"),
  resultJson: json("result_json").$type<any>(),
  executionResultJson: json("execution_result_json").$type<any>(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  jobIdIdx: index("idx_operator_jobs_job_id").on(table.jobId),
  operatorIdx: index("idx_operator_jobs_operator").on(table.operator),
  statusIdx: index("idx_operator_jobs_status").on(table.status),
  createdIdx: index("idx_operator_jobs_created").on(table.createdAt),
}));

export type OperatorJobRow = typeof operatorJobs.$inferSelect;
export type InsertOperatorJobRow = typeof operatorJobs.$inferInsert;

// ============================================================================
// Operator Audit Log — Append-only syscall evidence trail
// ============================================================================

export const operatorAuditLog = pgTable("operator_audit_log", {
  id: serial("id").primaryKey(),
  traceId: varchar("trace_id", { length: 64 }).notNull(),
  jobId: varchar("job_id", { length: 64 }).notNull(),
  operator: varchar("operator", { length: 32 }).notNull(),
  requestedBy: varchar("requested_by", { length: 255 }).notNull(),
  syscallIndex: integer("syscall_index").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  argsHash: varchar("args_hash", { length: 64 }).notNull(),
  verdict: varchar("verdict", { length: 16 }).notNull(),
  reason: text("reason").notNull(),
  durationMs: integer("duration_ms").notNull(),
  resultSummary: varchar("result_summary", { length: 128 }).notNull(),
  executedAt: timestamp("executed_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  traceIdx: index("idx_audit_trace_id").on(table.traceId),
  jobIdx: index("idx_audit_job_id").on(table.jobId),
  operatorIdx: index("idx_audit_operator").on(table.operator),
  actionIdx: index("idx_audit_action").on(table.action),
  verdictIdx: index("idx_audit_verdict").on(table.verdict),
  executedIdx: index("idx_audit_executed").on(table.executedAt),
}));

export type OperatorAuditLogRow = typeof operatorAuditLog.$inferSelect;
export type InsertOperatorAuditLogRow = typeof operatorAuditLog.$inferInsert;

// ============================================================================
// Syscall Batches — Stored operator-generated plans
// ============================================================================

export const syscallBatches = pgTable("syscall_batches", {
  id: serial("id").primaryKey(),
  jobId: varchar("job_id", { length: 64 }).notNull(),
  operator: varchar("operator", { length: 32 }).notNull(),
  planJson: json("plan_json").$type<any[]>().notNull(),
  explain: text("explain").notNull(),
  riskLevel: varchar("risk_level", { length: 16 }).notNull(),
  riskReasoning: text("risk_reasoning"),
  modelUsed: varchar("model_used", { length: 128 }),
  providerUsed: varchar("provider_used", { length: 64 }),
  syscallCount: integer("syscall_count").notNull(),
  generatedAt: timestamp("generated_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  jobIdx: index("idx_batches_job_id").on(table.jobId),
  operatorIdx: index("idx_batches_operator").on(table.operator),
}));

export type SyscallBatchRow = typeof syscallBatches.$inferSelect;
export type InsertSyscallBatchRow = typeof syscallBatches.$inferInsert;

// ============================================================================
// Execution Results — Stored kernel execution results
// ============================================================================

export const executionResults = pgTable("execution_results", {
  id: serial("id").primaryKey(),
  jobId: varchar("job_id", { length: 64 }).notNull(),
  operator: varchar("operator", { length: 32 }).notNull(),
  resultsJson: json("results_json").$type<any[]>().notNull(),
  totalDurationMs: integer("total_duration_ms").notNull(),
  totalSyscalls: integer("total_syscalls").notNull(),
  succeeded: integer("succeeded").notNull(),
  failed: integer("failed").notNull(),
  denied: integer("denied").notNull(),
  skipped: integer("skipped").notNull(),
  completedAt: timestamp("completed_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  jobIdx: index("idx_exec_results_job_id").on(table.jobId),
  operatorIdx: index("idx_exec_results_operator").on(table.operator),
}));

export type ExecutionResultRow = typeof executionResults.$inferSelect;
export type InsertExecutionResultRow = typeof executionResults.$inferInsert;
