/**
 * WfDB Tables — Sandbox Workflow Database
 *
 * 5-table model for workflow definitions, steps, executions, logs, and triggers.
 * All tables prefixed with `wf_` to avoid collision if co-located.
 */

import {
  serial,
  varchar,
  pgTable,
  text,
  integer,
  timestamp,
  json,
  index,
} from "drizzle-orm/pg-core";

// ── Table 1: Workflows ──────────────────────────────────────────────────────

export const wfWorkflows = pgTable(
  "wf_workflows",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").default("").notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    tags: json("tags").$type<string[]>().default([]),
    nodes: text("nodes").default(""),
    edges: text("edges").default(""),
    updatedAgo: varchar("updated_ago", { length: 50 }).default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    categoryIdx: index("idx_wf_workflows_category").on(table.category),
    statusIdx: index("idx_wf_workflows_status").on(table.status),
  })
);

export type WfWorkflow = typeof wfWorkflows.$inferSelect;
export type InsertWfWorkflow = typeof wfWorkflows.$inferInsert;

// ── Table 2: Workflow Steps ─────────────────────────────────────────────────

export const wfSteps = pgTable(
  "wf_steps",
  {
    id: serial("id").primaryKey(),
    workflowId: integer("workflow_id").notNull(),
    key: varchar("key", { length: 50 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    description: text("description").default("").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    workflowIdx: index("idx_wf_steps_workflow").on(table.workflowId),
  })
);

export type WfStep = typeof wfSteps.$inferSelect;
export type InsertWfStep = typeof wfSteps.$inferInsert;

// ── Table 3: Executions ─────────────────────────────────────────────────────

export const wfExecutions = pgTable(
  "wf_executions",
  {
    id: serial("id").primaryKey(),
    workflowId: integer("workflow_id").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    duration: integer("duration"),
    triggerType: varchar("trigger_type", { length: 50 }).default("manual"),
    triggerData: json("trigger_data").$type<Record<string, any>>().default({}),
    error: text("error"),
  },
  (table) => ({
    workflowIdx: index("idx_wf_executions_workflow").on(table.workflowId),
    statusIdx: index("idx_wf_executions_status").on(table.status),
  })
);

export type WfExecution = typeof wfExecutions.$inferSelect;
export type InsertWfExecution = typeof wfExecutions.$inferInsert;

// ── Table 4: Execution Logs ─────────────────────────────────────────────────

export const wfExecutionLogs = pgTable(
  "wf_execution_logs",
  {
    id: serial("id").primaryKey(),
    executionId: integer("execution_id").notNull(),
    stepKey: varchar("step_key", { length: 50 }).default(""),
    status: varchar("status", { length: 20 }).notNull().default("info"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    duration: integer("duration"),
    input: json("input").$type<Record<string, any>>().default({}),
    output: json("output").$type<Record<string, any>>().default({}),
    error: text("error"),
    logLevel: varchar("log_level", { length: 10 }).default("INFO"),
    message: text("message").default(""),
  },
  (table) => ({
    executionIdx: index("idx_wf_exec_logs_execution").on(table.executionId),
  })
);

export type WfExecutionLog = typeof wfExecutionLogs.$inferSelect;
export type InsertWfExecutionLog = typeof wfExecutionLogs.$inferInsert;

// ── Table 5: Triggers ───────────────────────────────────────────────────────

export const wfTriggers = pgTable(
  "wf_triggers",
  {
    id: serial("id").primaryKey(),
    workflowId: integer("workflow_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    config: json("config").$type<Record<string, any>>().default({}),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    fireCount: integer("fire_count").notNull().default(0),
    targetWorkflowName: varchar("target_workflow_name", { length: 255 }).default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    workflowIdx: index("idx_wf_triggers_workflow").on(table.workflowId),
  })
);

export type WfTrigger = typeof wfTriggers.$inferSelect;
export type InsertWfTrigger = typeof wfTriggers.$inferInsert;
