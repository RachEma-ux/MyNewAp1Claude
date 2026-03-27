/**
 * GraphRAG Types — shared type definitions for the GraphRAG engine.
 *
 * Key isolation rule: every operation is scoped to (moduleSlug, datasetKey).
 * No cross-module access is permitted.
 */

// ── Source Adapter Contract ──────────────────────────────────────────────────

export interface GraphRagDocument {
  id: string;
  text: string;
  title: string;
  creation_date: string;
  metadata: Record<string, unknown>;
}

export interface GraphRagSourceAdapter {
  moduleSlug: string;
  datasetKey: string;
  displayName: string;
  description: string;
  exportDocuments(args: {
    sinceCursor?: string;
    limit?: number;
  }): Promise<GraphRagDocument[]>;
}

// ── Query Types ──────────────────────────────────────────────────────────────

export type GraphRagQueryMethod = "basic" | "local" | "global" | "drift";

export interface GraphRagQueryRequest {
  moduleSlug: string;
  datasetKey: string;
  method: GraphRagQueryMethod;
  question: string;
  version?: string;
  runId?: number;
}

export interface GraphRagQueryResult {
  answer: string;
  method: GraphRagQueryMethod;
  context: {
    entities?: GraphRagEntity[];
    relationships?: GraphRagRelationship[];
    communities?: GraphRagCommunity[];
    sources?: string[];
  };
  tokenUsage: number;
  latencyMs: number;
}

// ── Graph Data Types ─────────────────────────────────────────────────────────

export interface GraphRagEntity {
  id: string;
  name: string;
  type: string;
  description: string;
  attributes: Record<string, unknown>;
}

export interface GraphRagRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
  description: string;
  weight: number;
}

export interface GraphRagCommunity {
  id: string;
  title: string;
  summary: string;
  level: number;
  entityCount: number;
}

export interface GraphRagCommunityReport {
  communityId: string;
  title: string;
  summary: string;
  findings: string[];
  entities: string[];
  level: number;
}

// ── Worker Contract Types ────────────────────────────────────────────────────

export type WorkerJobType = "index" | "query";

export interface WorkerIndexRequest {
  jobType: "index";
  moduleSlug: string;
  datasetKey: string;
  runKey: string;
  snapshotPath: string;
  workspacePath: string;
  settings: GraphRagWorkerSettings;
}

export interface WorkerQueryRequest {
  jobType: "query";
  moduleSlug: string;
  datasetKey: string;
  method: GraphRagQueryMethod;
  question: string;
  workspacePath: string;
}

export interface WorkerIndexResult {
  success: boolean;
  entityCount: number;
  relationshipCount: number;
  communityCount: number;
  tokenUsage: number;
  artifactPath: string;
  error?: string;
}

export interface WorkerQueryResult {
  success: boolean;
  answer: string;
  context: Record<string, unknown>;
  tokenUsage: number;
  error?: string;
}

export interface GraphRagWorkerSettings {
  llmModel: string;
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  maxGleanings: number;
  communityLevel: number;
}

// ── Runtime / Cost Controls ──────────────────────────────────────────────────

export interface GraphRagCostControls {
  maxDocumentsPerSync: number;
  maxTokensPerIndex: number;
  indexTimeoutMs: number;
  queryTimeoutMs: number;
  maxConcurrentJobs: number;
}

export const DEFAULT_COST_CONTROLS: GraphRagCostControls = {
  maxDocumentsPerSync: 10000,
  maxTokensPerIndex: 500000,
  indexTimeoutMs: 600000, // 10 minutes
  queryTimeoutMs: 60000, // 1 minute
  maxConcurrentJobs: 2,
};

export const DEFAULT_WORKER_SETTINGS: GraphRagWorkerSettings = {
  llmModel: "gpt-4o-mini",
  embeddingModel: "text-embedding-3-small",
  chunkSize: 1200,
  chunkOverlap: 200,
  maxGleanings: 1,
  communityLevel: 2,
};

// ── Run Status ───────────────────────────────────────────────────────────────

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
