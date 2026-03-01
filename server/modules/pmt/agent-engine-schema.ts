/**
 * Agent Engine Schema — Database tables for PM Central agent runs, drafts, audit
 *
 * 3 tables:
 *   pmt_agent_runs   — orchestrated agent run instances
 *   pmt_agent_drafts — draft outputs from agents (require human commit)
 *   pmt_agent_audit  — immutable audit trail for every agent action
 */

import {
  serial, varchar, text, integer, boolean, timestamp, json, pgTable, index,
} from "drizzle-orm/pg-core";
import { projects } from "./schema";
import { users } from "../../../drizzle/tables/users";

// ── Agent Runs ──────────────────────────────────────────────────────────────

export const pmtAgentRuns = pgTable("pmt_agent_runs", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  runType: varchar("runType", { length: 50 }).notNull(), // initiating_run, planning_run, etc.
  packId: varchar("packId", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, running, completed, failed, cancelled
  phase: varchar("phase", { length: 20 }), // initiating, planning
  planDag: json("planDag").$type<Array<{
    id: string;
    agent_alias: string;
    depends_on: string[];
    status: string;
  }>>(),
  outputs: json("outputs").$type<Record<string, unknown>>(),
  initiatedBy: integer("initiatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_agent_runs_project").on(table.projectId),
  statusIdx: index("idx_pmt_agent_runs_status").on(table.status),
  runTypeIdx: index("idx_pmt_agent_runs_type").on(table.runType),
}));

export type AgentRun = typeof pmtAgentRuns.$inferSelect;
export type InsertAgentRun = typeof pmtAgentRuns.$inferInsert;

// ── Agent Drafts ────────────────────────────────────────────────────────────

export const pmtAgentDrafts = pgTable("pmt_agent_drafts", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  runId: integer("runId").notNull().references(() => pmtAgentRuns.id),
  artifactType: varchar("artifactType", { length: 50 }).notNull(),
  content: json("content").$type<Record<string, unknown>>(),
  sourceAgentAlias: varchar("sourceAgentAlias", { length: 100 }).notNull(),
  catalogEntryId: integer("catalogEntryId"), // resolved catalog entry (nullable in Phase 1)
  requiresHumanReview: boolean("requiresHumanReview").default(true).notNull(),
  commitStatus: varchar("commitStatus", { length: 20 }).default("pending").notNull(), // pending, committed, rejected
  committedBy: integer("committedBy").references(() => users.id),
  committedAt: timestamp("committedAt"),
  rejectReason: text("rejectReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_agent_drafts_project").on(table.projectId),
  runIdx: index("idx_pmt_agent_drafts_run").on(table.runId),
  statusIdx: index("idx_pmt_agent_drafts_commit_status").on(table.commitStatus),
}));

export type AgentDraft = typeof pmtAgentDrafts.$inferSelect;
export type InsertAgentDraft = typeof pmtAgentDrafts.$inferInsert;

// ── Agent Audit ─────────────────────────────────────────────────────────────

export const pmtAgentAudit = pgTable("pmt_agent_audit", {
  id: serial("id").primaryKey(),
  runId: integer("runId").notNull().references(() => pmtAgentRuns.id),
  agentAlias: varchar("agentAlias", { length: 100 }).notNull(),
  eventType: varchar("eventType", { length: 50 }).notNull(), // binding_resolved, step_started, step_completed, draft_created, etc.
  payload: json("payload").$type<Record<string, unknown>>(),
  payloadHash: varchar("payloadHash", { length: 64 }),
  actorId: integer("actorId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  runIdx: index("idx_pmt_agent_audit_run").on(table.runId),
  eventIdx: index("idx_pmt_agent_audit_event").on(table.eventType),
  createdIdx: index("idx_pmt_agent_audit_created").on(table.createdAt),
}));

export type AgentAuditEvent = typeof pmtAgentAudit.$inferSelect;
export type InsertAgentAuditEvent = typeof pmtAgentAudit.$inferInsert;
