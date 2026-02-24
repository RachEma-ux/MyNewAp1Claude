/**
 * Agent Orchestration Engine — Database Schema
 * Workspace agents, runs, events, artifacts
 */

import {
  serial, varchar, text, integer, timestamp, json, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";

export const workspaceAgents = pgTable("ao_workspace_agents", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).default("assistant").notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  config: json("config").$type<Record<string, unknown>>(),
  tools: json("tools").$type<string[]>(),
  scopePolicy: json("scopePolicy").$type<Record<string, unknown>>(),
  principalUserId: integer("principalUserId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_ao_agents_ws").on(table.workspaceId),
}));

export type WorkspaceAgent = typeof workspaceAgents.$inferSelect;
export type InsertWorkspaceAgent = typeof workspaceAgents.$inferInsert;

export const agentRuns = pgTable("ao_agent_runs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  agentId: integer("agentId").notNull().references(() => workspaceAgents.id),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  requestedBy: integer("requestedBy").references(() => users.id),
  input: json("input").$type<Record<string, unknown>>(),
  output: json("output").$type<Record<string, unknown>>(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_ao_runs_ws").on(table.workspaceId),
  agentIdx: index("idx_ao_runs_agent").on(table.agentId),
  statusIdx: index("idx_ao_runs_status").on(table.status),
}));

export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = typeof agentRuns.$inferInsert;

export const agentRunEvents = pgTable("ao_agent_run_events", {
  id: serial("id").primaryKey(),
  runId: integer("runId").notNull().references(() => agentRuns.id),
  eventType: varchar("eventType", { length: 50 }).notNull(),
  data: json("data").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentRunEvent = typeof agentRunEvents.$inferSelect;

export const agentRunArtifacts = pgTable("ao_agent_run_artifacts", {
  id: serial("id").primaryKey(),
  runId: integer("runId").notNull().references(() => agentRuns.id),
  name: varchar("name", { length: 255 }).notNull(),
  contentType: varchar("contentType", { length: 100 }),
  content: text("content"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentRunArtifact = typeof agentRunArtifacts.$inferSelect;
