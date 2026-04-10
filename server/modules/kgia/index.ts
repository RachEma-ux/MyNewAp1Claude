/**
 * KGIA — Knowledge Graph Interpretation Agent
 *
 * Module entry point. Exports the router and boot function.
 *
 * KGIA is a governed specialist worker that provides enterprise-grade
 * knowledge graph reading, interpretation, and evidence-backed answers
 * through three graph planes:
 *   A. Source Graph Plane — direct query over existing graph backends
 *   B. Retrieval Graph Plane — GraphRAG over documents
 *   C. Memory Graph Plane — session-scoped task memory
 *
 * Governance Center remains the enforcement owner.
 * All query execution is read-only by default and gated by non-bypassable controls.
 */

// Router
export { kgiaRouter } from "./router";

// Domain types
export type {
  GraphSource,
  SchemaSlice,
  QueryPlan,
  EvidenceGraph,
  EvidenceNode,
  EvidenceEdge,
  PathCandidate,
  AnswerEnvelope,
  RuntimeState,
  SafetyVerdict,
  Confidence,
  ProvenanceRef,
  TemporalClaim,
  MemoryNode,
  MemoryEdge,
  TaskMemoryGraph,
  KgiaMode,
} from "./domain/types";

// Runtime
export { createSession, executeRun } from "./runtime/orchestrator";

/**
 * Boot the KGIA module.
 * Called during server startup for any initialization that needs
 * to happen before the first request (schema warm-up, etc.).
 */
export async function bootKgia(): Promise<void> {
  console.log("[KGIA] Module initialized");
}
