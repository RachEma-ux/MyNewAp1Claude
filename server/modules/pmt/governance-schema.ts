/**
 * PMT Governance Schema — Gate requests, change requests, artifacts, state transitions
 *
 * 4 new tables for the project lifecycle governance model.
 */

import {
  serial, varchar, text, integer, timestamp, json, pgTable, index,
} from "drizzle-orm/pg-core";
import { projects } from "./schema";
import { users } from "../../../drizzle/tables/users";

// ── Gate Requests ───────────────────────────────────────────────────────────

export const pmtGateRequests = pgTable("pmt_gate_requests", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  gateId: varchar("gateId", { length: 10 }).notNull(), // G0, G1, G2, G3, G4
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, evaluating, passed, failed, waived
  requestedBy: integer("requestedBy").references(() => users.id),
  evaluatedBy: integer("evaluatedBy").references(() => users.id),
  evidenceBundleId: integer("evidenceBundleId"), // links to existing evidence_bundles table
  verdict: json("verdict").$type<Record<string, unknown>>(), // scorecard result snapshot
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  evaluatedAt: timestamp("evaluatedAt"),
}, (table) => ({
  projectIdx: index("idx_pmt_gate_requests_project").on(table.projectId),
  gateIdx: index("idx_pmt_gate_requests_gate").on(table.gateId),
  statusIdx: index("idx_pmt_gate_requests_status").on(table.status),
}));

export type GateRequest = typeof pmtGateRequests.$inferSelect;
export type InsertGateRequest = typeof pmtGateRequests.$inferInsert;

// ── Change Requests ─────────────────────────────────────────────────────────

export const pmtChangeRequests = pgTable("pmt_change_requests", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  changeType: varchar("changeType", { length: 30 }).notNull(), // scope, schedule, budget, resource, technical
  impact: varchar("impact", { length: 20 }).default("medium").notNull(), // low, medium, high, critical
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft, submitted, under_review, approved, rejected, implemented
  requestedBy: integer("requestedBy").references(() => users.id),
  reviewedBy: integer("reviewedBy").references(() => users.id),
  gateRequestId: integer("gateRequestId").references(() => pmtGateRequests.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_change_requests_project").on(table.projectId),
  statusIdx: index("idx_pmt_change_requests_status").on(table.status),
}));

export type ChangeRequest = typeof pmtChangeRequests.$inferSelect;
export type InsertChangeRequest = typeof pmtChangeRequests.$inferInsert;

// ── Project Artifacts ───────────────────────────────────────────────────────

export const pmtProjectArtifacts = pgTable("pmt_project_artifacts", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  name: varchar("name", { length: 255 }).notNull(),
  artifactType: varchar("artifactType", { length: 30 }).notNull(), // charter, plan, schedule, risk_register, status_report, change_log, closure_report
  content: json("content").$type<Record<string, unknown>>(),
  sha256: varchar("sha256", { length: 64 }),
  version: integer("version").default(1).notNull(),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_project_artifacts_project").on(table.projectId),
  typeIdx: index("idx_pmt_project_artifacts_type").on(table.artifactType),
}));

export type ProjectArtifact = typeof pmtProjectArtifacts.$inferSelect;
export type InsertProjectArtifact = typeof pmtProjectArtifacts.$inferInsert;

// ── State Transitions (Audit Log) ───────────────────────────────────────────

export const pmtStateTransitions = pgTable("pmt_state_transitions", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  fromState: varchar("fromState", { length: 30 }).notNull(),
  toState: varchar("toState", { length: 30 }).notNull(),
  actorId: integer("actorId").references(() => users.id),
  gateRequestId: integer("gateRequestId").references(() => pmtGateRequests.id),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_state_transitions_project").on(table.projectId),
  createdIdx: index("idx_pmt_state_transitions_created").on(table.createdAt),
}));

export type StateTransition = typeof pmtStateTransitions.$inferSelect;
export type InsertStateTransition = typeof pmtStateTransitions.$inferInsert;
