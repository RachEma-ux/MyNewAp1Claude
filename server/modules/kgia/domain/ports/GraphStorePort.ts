/**
 * Port: Graph Store — abstract interface for property graph backends.
 * Implementations: Neo4j, Neptune openCypher
 */
import type { GraphSource, SchemaSlice } from "../types";

export interface GraphQueryResult {
  records: Record<string, unknown>[];
  summary?: { resultAvailableAfter?: number; counters?: Record<string, number> };
}

export interface GraphStorePort {
  /** Read the full schema (labels, relationship types, properties) */
  readSchema(source: GraphSource): Promise<Record<string, unknown>>;

  /** Execute a read-only Cypher/openCypher query */
  executeQuery(source: GraphSource, queryText: string, params?: Record<string, unknown>): Promise<GraphQueryResult>;

  /** Test connectivity */
  testConnection(source: GraphSource): Promise<{ connected: boolean; latencyMs?: number; error?: string }>;
}
