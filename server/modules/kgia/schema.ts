/**
 * KGIA — Knowledge Graph Interpretation Agent — Database Schema
 *
 * 15 tables covering sources, sessions, runs, query plans, executions,
 * answers, evidence graph, memory graph, ingestion pipeline, benchmarks,
 * and policy decisions.
 *
 * All tables carry workspaceId (indexed) for workspace-scoped isolation.
 */

import {
  serial, varchar, text, integer, boolean, timestamp, json, real,
  pgTable, index, unique,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";

// ============================================================================
// 1. KGIA Sources — registered graph backends
// ============================================================================

export const kgiaSources = pgTable("kgia_sources", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // "neo4j" | "sparql" | "neptune_cypher" | "neptune_sparql"
  endpoint: text("endpoint").notNull(),
  credentials: json("credentials").$type<Record<string, unknown>>(), // encrypted ref
  schemaSnapshot: json("schemaSnapshot").$type<Record<string, unknown>>(),
  allowlisted: boolean("allowlisted").default(false).notNull(),
  maxHops: integer("maxHops").default(4).notNull(),
  maxRows: integer("maxRows").default(1000).notNull(),
  readOnly: boolean("readOnly").default(true).notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_kgia_sources_ws").on(table.workspaceId),
}));

export type KgiaSource = typeof kgiaSources.$inferSelect;
export type InsertKgiaSource = typeof kgiaSources.$inferInsert;

// ============================================================================
// 2. KGIA Sessions — user interaction sessions
// ============================================================================

export const kgiaSessions = pgTable("kgia_sessions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  userId: integer("userId").references(() => users.id),
  title: varchar("title", { length: 500 }),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  config: json("config").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_kgia_sessions_ws").on(table.workspaceId),
  userIdx: index("idx_kgia_sessions_user").on(table.userId),
}));

export type KgiaSession = typeof kgiaSessions.$inferSelect;
export type InsertKgiaSession = typeof kgiaSessions.$inferInsert;

// ============================================================================
// 3. KGIA Runs — individual question-answer runs within a session
// ============================================================================

export const kgiaRuns = pgTable("kgia_runs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  sessionId: integer("sessionId").notNull().references(() => kgiaSessions.id),
  question: text("question").notNull(),
  mode: varchar("mode", { length: 50 }), // "direct_query" | "graph_rag" | "memory" | "hybrid"
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  answer: text("answer"),
  confidence: real("confidence"),
  selectedMode: varchar("selectedMode", { length: 50 }),
  governanceVerdict: varchar("governanceVerdict", { length: 50 }),
  envelope: json("envelope").$type<Record<string, unknown>>(), // full AnswerEnvelope
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  durationMs: integer("durationMs"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_kgia_runs_ws").on(table.workspaceId),
  sessionIdx: index("idx_kgia_runs_session").on(table.sessionId),
  statusIdx: index("idx_kgia_runs_status").on(table.status),
}));

export type KgiaRun = typeof kgiaRuns.$inferSelect;
export type InsertKgiaRun = typeof kgiaRuns.$inferInsert;

// ============================================================================
// 4. KGIA Query Plans — generated query plans for a run
// ============================================================================

export const kgiaQueryPlans = pgTable("kgia_query_plans", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  runId: integer("runId").notNull().references(() => kgiaRuns.id),
  intent: varchar("intent", { length: 100 }),
  schemaSlice: json("schemaSlice").$type<Record<string, unknown>>(),
  queryLanguage: varchar("queryLanguage", { length: 50 }), // "cypher" | "sparql" | "hybrid"
  queryText: text("queryText"),
  validated: boolean("validated").default(false).notNull(),
  validationErrors: json("validationErrors").$type<string[]>(),
  repairAttempts: integer("repairAttempts").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  runIdx: index("idx_kgia_qplans_run").on(table.runId),
}));

export type KgiaQueryPlan = typeof kgiaQueryPlans.$inferSelect;
export type InsertKgiaQueryPlan = typeof kgiaQueryPlans.$inferInsert;

// ============================================================================
// 5. KGIA Query Executions — actual execution results
// ============================================================================

export const kgiaQueryExecutions = pgTable("kgia_query_executions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  runId: integer("runId").notNull().references(() => kgiaRuns.id),
  planId: integer("planId").references(() => kgiaQueryPlans.id),
  sourceId: integer("sourceId").references(() => kgiaSources.id),
  queryText: text("queryText"),
  resultCount: integer("resultCount"),
  resultData: json("resultData").$type<Record<string, unknown>>(),
  durationMs: integer("durationMs"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  runIdx: index("idx_kgia_qexec_run").on(table.runId),
}));

export type KgiaQueryExecution = typeof kgiaQueryExecutions.$inferSelect;
export type InsertKgiaQueryExecution = typeof kgiaQueryExecutions.$inferInsert;

// ============================================================================
// 6. KGIA Answers — persisted answer envelopes
// ============================================================================

export const kgiaAnswers = pgTable("kgia_answers", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  runId: integer("runId").notNull().references(() => kgiaRuns.id),
  answer: text("answer").notNull(),
  confidence: real("confidence"),
  selectedMode: varchar("selectedMode", { length: 50 }),
  observedFacts: json("observedFacts").$type<string[]>(),
  inferredClaims: json("inferredClaims").$type<string[]>(),
  provenanceRefs: json("provenanceRefs").$type<Record<string, unknown>[]>(),
  temporalValidity: json("temporalValidity").$type<Record<string, unknown>>(),
  missingKnowledge: json("missingKnowledge").$type<string[]>(),
  governanceVerdict: json("governanceVerdict").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  runIdx: index("idx_kgia_answers_run").on(table.runId),
}));

export type KgiaAnswer = typeof kgiaAnswers.$inferSelect;
export type InsertKgiaAnswer = typeof kgiaAnswers.$inferInsert;

// ============================================================================
// 7. KGIA Evidence Nodes — nodes in the evidence graph for a run
// ============================================================================

export const kgiaEvidenceNodes = pgTable("kgia_evidence_nodes", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  runId: integer("runId").notNull().references(() => kgiaRuns.id),
  nodeType: varchar("nodeType", { length: 100 }).notNull(), // "entity" | "literal" | "claim"
  label: varchar("label", { length: 500 }).notNull(),
  properties: json("properties").$type<Record<string, unknown>>(),
  sourceRef: varchar("sourceRef", { length: 500 }),
  confidence: real("confidence"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  runIdx: index("idx_kgia_enodes_run").on(table.runId),
}));

export type KgiaEvidenceNode = typeof kgiaEvidenceNodes.$inferSelect;
export type InsertKgiaEvidenceNode = typeof kgiaEvidenceNodes.$inferInsert;

// ============================================================================
// 8. KGIA Evidence Edges — edges in the evidence graph for a run
// ============================================================================

export const kgiaEvidenceEdges = pgTable("kgia_evidence_edges", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  runId: integer("runId").notNull().references(() => kgiaRuns.id),
  fromNodeId: integer("fromNodeId").notNull().references(() => kgiaEvidenceNodes.id),
  toNodeId: integer("toNodeId").notNull().references(() => kgiaEvidenceNodes.id),
  relationshipType: varchar("relationshipType", { length: 255 }).notNull(),
  properties: json("properties").$type<Record<string, unknown>>(),
  confidence: real("confidence"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  runIdx: index("idx_kgia_eedges_run").on(table.runId),
}));

export type KgiaEvidenceEdge = typeof kgiaEvidenceEdges.$inferSelect;
export type InsertKgiaEvidenceEdge = typeof kgiaEvidenceEdges.$inferInsert;

// ============================================================================
// 9. KGIA Memory Nodes — task memory graph nodes
// ============================================================================

export const kgiaMemoryNodes = pgTable("kgia_memory_nodes", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  sessionId: integer("sessionId").notNull().references(() => kgiaSessions.id),
  nodeType: varchar("nodeType", { length: 100 }).notNull(), // "observed_fact" | "inferred_claim" | "contradiction" | "unresolved_entity" | "hypothesis"
  label: varchar("label", { length: 500 }).notNull(),
  content: text("content"),
  status: varchar("status", { length: 50 }).default("active").notNull(), // "active" | "rejected" | "superseded"
  confidence: real("confidence"),
  evidenceRunId: integer("evidenceRunId").references(() => kgiaRuns.id),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  sessionIdx: index("idx_kgia_mnodes_session").on(table.sessionId),
}));

export type KgiaMemoryNode = typeof kgiaMemoryNodes.$inferSelect;
export type InsertKgiaMemoryNode = typeof kgiaMemoryNodes.$inferInsert;

// ============================================================================
// 10. KGIA Memory Edges — task memory graph edges
// ============================================================================

export const kgiaMemoryEdges = pgTable("kgia_memory_edges", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  sessionId: integer("sessionId").notNull().references(() => kgiaSessions.id),
  fromNodeId: integer("fromNodeId").notNull().references(() => kgiaMemoryNodes.id),
  toNodeId: integer("toNodeId").notNull().references(() => kgiaMemoryNodes.id),
  relationshipType: varchar("relationshipType", { length: 255 }).notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  sessionIdx: index("idx_kgia_medges_session").on(table.sessionId),
}));

export type KgiaMemoryEdge = typeof kgiaMemoryEdges.$inferSelect;
export type InsertKgiaMemoryEdge = typeof kgiaMemoryEdges.$inferInsert;

// ============================================================================
// 11. KGIA Ingestions — GraphRAG ingestion runs
// ============================================================================

export const kgiaIngestions = pgTable("kgia_ingestions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  sourceId: integer("sourceId").references(() => kgiaSources.id),
  name: varchar("name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // "pending" | "running" | "completed" | "failed"
  documentCount: integer("documentCount").default(0).notNull(),
  chunkCount: integer("chunkCount").default(0).notNull(),
  entityCount: integer("entityCount").default(0).notNull(),
  relationCount: integer("relationCount").default(0).notNull(),
  communityCount: integer("communityCount").default(0).notNull(),
  config: json("config").$type<Record<string, unknown>>(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_kgia_ingestions_ws").on(table.workspaceId),
  statusIdx: index("idx_kgia_ingestions_status").on(table.status),
}));

export type KgiaIngestion = typeof kgiaIngestions.$inferSelect;
export type InsertKgiaIngestion = typeof kgiaIngestions.$inferInsert;

// ============================================================================
// 12. KGIA Ingestion Chunks — individual chunks from ingestion
// ============================================================================

export const kgiaIngestionChunks = pgTable("kgia_ingestion_chunks", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  ingestionId: integer("ingestionId").notNull().references(() => kgiaIngestions.id),
  documentName: varchar("documentName", { length: 500 }),
  chunkIndex: integer("chunkIndex").notNull(),
  content: text("content"),
  entities: json("entities").$type<string[]>(),
  relations: json("relations").$type<Record<string, unknown>[]>(),
  embedding: json("embedding").$type<number[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  ingestionIdx: index("idx_kgia_ichunks_ingestion").on(table.ingestionId),
}));

export type KgiaIngestionChunk = typeof kgiaIngestionChunks.$inferSelect;
export type InsertKgiaIngestionChunk = typeof kgiaIngestionChunks.$inferInsert;

// ============================================================================
// 13. KGIA Entity Resolutions — entity resolution records
// ============================================================================

export const kgiaEntityResolutions = pgTable("kgia_entity_resolutions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  ingestionId: integer("ingestionId").notNull().references(() => kgiaIngestions.id),
  rawEntity: varchar("rawEntity", { length: 500 }).notNull(),
  resolvedEntity: varchar("resolvedEntity", { length: 500 }).notNull(),
  confidence: real("confidence"),
  method: varchar("method", { length: 100 }), // "exact" | "fuzzy" | "embedding" | "manual"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  ingestionIdx: index("idx_kgia_eres_ingestion").on(table.ingestionId),
}));

export type KgiaEntityResolution = typeof kgiaEntityResolutions.$inferSelect;
export type InsertKgiaEntityResolution = typeof kgiaEntityResolutions.$inferInsert;

// ============================================================================
// 14. KGIA Benchmark Cases + Runs
// ============================================================================

export const kgiaBenchmarkCases = pgTable("kgia_benchmark_cases", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(), // "direct_lookup" | "multi_hop" | "mixed_retrieval" | "incomplete_knowledge" | "temporal" | "governance_block"
  question: text("question").notNull(),
  expectedAnswer: text("expectedAnswer"),
  expectedMode: varchar("expectedMode", { length: 50 }),
  sourceIds: json("sourceIds").$type<number[]>(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_kgia_bcases_ws").on(table.workspaceId),
  catIdx: index("idx_kgia_bcases_cat").on(table.category),
}));

export type KgiaBenchmarkCase = typeof kgiaBenchmarkCases.$inferSelect;
export type InsertKgiaBenchmarkCase = typeof kgiaBenchmarkCases.$inferInsert;

export const kgiaBenchmarkRuns = pgTable("kgia_benchmark_runs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  caseId: integer("caseId").notNull().references(() => kgiaBenchmarkCases.id),
  runId: integer("runId").references(() => kgiaRuns.id),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  passed: boolean("passed"),
  actualAnswer: text("actualAnswer"),
  actualMode: varchar("actualMode", { length: 50 }),
  durationMs: integer("durationMs"),
  score: real("score"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  caseIdx: index("idx_kgia_bruns_case").on(table.caseId),
}));

export type KgiaBenchmarkRun = typeof kgiaBenchmarkRuns.$inferSelect;
export type InsertKgiaBenchmarkRun = typeof kgiaBenchmarkRuns.$inferInsert;

// ============================================================================
// 15. KGIA Policy Decisions — governance audit trail
// ============================================================================

export const kgiaPolicyDecisions = pgTable("kgia_policy_decisions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  runId: integer("runId").references(() => kgiaRuns.id),
  sessionId: integer("sessionId").references(() => kgiaSessions.id),
  action: varchar("action", { length: 100 }).notNull(),
  decision: varchar("decision", { length: 50 }).notNull(), // "allow" | "deny" | "review_required"
  reason: text("reason"),
  policyRule: varchar("policyRule", { length: 255 }),
  actorId: integer("actorId").references(() => users.id),
  context: json("context").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_kgia_pdecisions_ws").on(table.workspaceId),
  runIdx: index("idx_kgia_pdecisions_run").on(table.runId),
  decisionIdx: index("idx_kgia_pdecisions_decision").on(table.decision),
}));

export type KgiaPolicyDecision = typeof kgiaPolicyDecisions.$inferSelect;
export type InsertKgiaPolicyDecision = typeof kgiaPolicyDecisions.$inferInsert;
