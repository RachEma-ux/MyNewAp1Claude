/**
 * Port: RDF Store — abstract interface for SPARQL-based backends.
 * Implementations: Generic SPARQL, Neptune SPARQL
 */
import type { GraphSource } from "../types";

export interface SparqlQueryResult {
  bindings: Record<string, unknown>[];
  variables: string[];
  resultCount: number;
  durationMs: number;
}

export interface RdfStorePort {
  /** Read schema via SPARQL introspection (classes, properties, ranges) */
  readSchema(source: GraphSource): Promise<Record<string, unknown>>;

  /** Execute a read-only SPARQL query */
  executeQuery(source: GraphSource, queryText: string): Promise<SparqlQueryResult>;

  /** Test connectivity */
  testConnection(source: GraphSource): Promise<{ connected: boolean; latencyMs?: number; error?: string }>;
}
