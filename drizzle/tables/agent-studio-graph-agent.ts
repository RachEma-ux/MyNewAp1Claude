/**
 * Agent Studio Native Graph Workspace — Graph Agent Lite + Advanced runtime tables.
 *
 * Phase 13 / 13.5 tables. ASDB-resident.
 * Module shape mirrors `server/kgra-agent/` (existing KGRA Agent).
 *
 * ADR: agent-studio-graph-agent-runtime.md
 */

import {
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const agsGraphAgentRuns = pgTable(
  "ags_graph_agent_runs",
  {
    id: serial("id").primaryKey(),
    agentKey: varchar("agent_key", { length: 100 }).notNull().default("graph_agent_lite"),
    userId: integer("user_id"),
    workspaceId: integer("workspace_id"),
    userQuery: text("user_query").notNull(),
    queryIntent: varchar("query_intent", { length: 100 }),
    retrievalStrategy: varchar("retrieval_strategy", { length: 100 }),
    selectedSkillPackId: integer("selected_skill_pack_id"),
    runtimeRunId: integer("runtime_run_id"),
    status: varchar("status", { length: 50 }).notNull().default("planning"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("idx_ags_graph_agent_runs_status").on(t.status),
    userIdx: index("idx_ags_graph_agent_runs_user").on(t.userId),
    runtimeIdx: index("idx_ags_graph_agent_runs_runtime").on(t.runtimeRunId),
  }),
);

export const agsGraphAgentSteps = pgTable(
  "ags_graph_agent_steps",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => agsGraphAgentRuns.id),
    stepIndex: integer("step_index").notNull(),
    stepKind: varchar("step_kind", { length: 100 }).notNull(),
    stepInput: json("step_input").$type<Record<string, unknown>>(),
    stepOutput: json("step_output").$type<Record<string, unknown>>(),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    runIdx: index("idx_ags_graph_agent_steps_run").on(t.runId),
  }),
);

export const agsGraphAgentToolChoices = pgTable(
  "ags_graph_agent_tool_choices",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => agsGraphAgentRuns.id),
    toolKind: varchar("tool_kind", { length: 50 }).notNull(),
    toolId: text("tool_id").notNull(),
    toolArgs: json("tool_args").$type<Record<string, unknown>>(),
    rationale: text("rationale"),
    routedVia: varchar("routed_via", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphAgentContextBlocks = pgTable(
  "ags_graph_agent_context_blocks",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => agsGraphAgentRuns.id),
    blockKind: varchar("block_kind", { length: 50 }).notNull(),
    blockPayload: json("block_payload").$type<Record<string, unknown>>().notNull(),
    citationCount: integer("citation_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphAgentExplanations = pgTable(
  "ags_graph_agent_explanations",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => agsGraphAgentRuns.id),
    explanationKind: varchar("explanation_kind", { length: 100 }).notNull(),
    explanationPayload: json("explanation_payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphAgentAuthEvents = pgTable(
  "ags_graph_agent_auth_events",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => agsGraphAgentRuns.id),
    eventKind: varchar("event_kind", { length: 100 }).notNull(),
    reason: text("reason"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphAgentUserFeedback = pgTable(
  "ags_graph_agent_user_feedback",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => agsGraphAgentRuns.id),
    feedbackKind: varchar("feedback_kind", { length: 50 }).notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);
