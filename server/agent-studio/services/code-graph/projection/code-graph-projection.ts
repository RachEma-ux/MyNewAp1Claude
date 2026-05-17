/**
 * Code Graph Neo4j Projection — production interface + wiring.
 *
 * Surface contract pinned at T-G.2.1. T-G.2.4 (this PR) wires the
 * factory to a real implementation that:
 *
 *   1. Reads the ingestion's nodes + edges from the ASDB store
 *      (`CodeGraphStore.readIngestion()` — T-G.2.3)
 *   2. Converts each ParsedCodeNode / ParsedCodeEdge into a
 *      `ProjectionWrite` (the shape consumed by
 *      `GraphProjectionRepository.applyProjectionJob`)
 *   3. Calls `applyProjectionJob` — which Phase 7.5b backs with
 *      batched UNWIND writes (`PROJECTION_BATCH_SIZE = 1000`) via
 *      the wired Neo4j adapter (Phase 7.5a).
 *
 * Dependency injection: the factory takes `{ store, repository }`
 * so callers can plug in real ASDB + Neo4j repositories in
 * production OR test doubles in tests. Mirrors the existing
 * pattern in `services/graph/projection/sync-worker.ts`.
 *
 * Source-of-truth invariant preserved: projection ONLY reads from
 * ASDB; it never writes to ASDB. Re-projection of an existing
 * ingestion is a single-method call (operators can flush Neo4j
 * and rebuild without re-running the parser).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No direct `neo4j-driver` import. Projection calls through
 *     the GraphRepository surface (`services/graph/repository/`),
 *     which Phase 7.5b wires to the real driver via the KGIA
 *     adapter.
 *   - No `dispatchMcpToolCall`.
 *   - No `process.env.*_API_KEY` reads.
 */

import type { CodeGraphStore } from "../persistence/code-graph-store.js";
import type {
  GraphProjectionRepository,
  ProjectionWrite,
  ProvenanceFields,
} from "../../graph/repository/types.js";
import type {
  ParsedCodeEdge,
  ParsedCodeNode,
} from "../parser/code-graph-parser.js";

export interface ProjectCodeGraphInput {
  /**
   * Operator-chosen identifier of the ingestion run. The projection
   * reads nodes + edges from ASDB keyed by this id and projects them
   * into Neo4j as a single batched UNWIND write (per Phase 7.5b's
   * `PROJECTION_BATCH_SIZE = 1000` carry-forward from T-E.5).
   */
  readonly ingestionId: string;
}

export interface ProjectCodeGraphResult {
  readonly ingestionId: string;
  readonly nodesProjected: number;
  readonly edgesProjected: number;
  /** Wall-clock projection duration. Operator dashboards compare
   *  this against the T-E.5 carry-forward gates (8s target,
   *  10s ceiling for ~12k-edge batches). */
  readonly durationMs: number;
}

export interface CodeGraphProjection {
  /**
   * Project an existing ASDB ingestion run into Neo4j via the
   * GraphRepository. Re-projection is idempotent (Neo4j MERGE on
   * the canonical id). T-G.2.4 implements; this contract is the
   * T-G.2.1 placeholder.
   */
  projectIngestion(
    input: ProjectCodeGraphInput,
  ): Promise<ProjectCodeGraphResult>;
}

export interface CodeGraphProjectionOptions {
  readonly store: CodeGraphStore;
  readonly repository: GraphProjectionRepository;
}

/**
 * Factory entry point. Returns a projection that reads from the
 * given ASDB store and writes derived facts to Neo4j via the
 * given GraphRepository. Caller wires up both — see
 * `services/graph/projection/sync-worker.ts` for the established
 * DI pattern.
 */
export function createCodeGraphProjection(
  options: CodeGraphProjectionOptions,
): CodeGraphProjection {
  return {
    async projectIngestion(
      input: ProjectCodeGraphInput,
    ): Promise<ProjectCodeGraphResult> {
      const start = Date.now();
      const { nodes, edges } = await options.store.readIngestion(
        input.ingestionId,
      );
      const writes: ProjectionWrite[] = [
        ...nodes.map((n) => toNodeWrite(input.ingestionId, n)),
        ...edges.map((e) => toEdgeWrite(input.ingestionId, e, nodes)),
      ];
      const result = await options.repository.applyProjectionJob(writes);
      const durationMs = Date.now() - start;
      return {
        ingestionId: input.ingestionId,
        nodesProjected:
          result.nodesCreated + result.nodesUpdated,
        edgesProjected:
          result.edgesCreated + result.edgesUpdated,
        durationMs,
      };
    },
  };
}

function toNodeWrite(
  ingestionId: string,
  node: ParsedCodeNode,
): ProjectionWrite {
  const provenance: ProvenanceFields = {
    sourceType: "code_graph_ingestion",
    sourceId: ingestionId,
    sourceLocator: node.filePath,
    lineageStatus: "derived",
    extractionMethod: "tree-sitter",
    governanceStatus: "active",
  };
  return {
    kind: "upsert_node",
    node: {
      typeKey: node.typeKey,
      id: node.id,
      properties: {
        name: node.name,
        filePath: node.filePath,
        startLine: node.startLine,
        endLine: node.endLine,
        ...(node.properties ?? {}),
      },
      provenance,
    },
  };
}

function toEdgeWrite(
  ingestionId: string,
  edge: ParsedCodeEdge,
  nodes: ReadonlyArray<ParsedCodeNode>,
): ProjectionWrite {
  // GraphProjectionRepository requires both endpoints carry a
  // typeKey. The persistence layer (T-G.2.3) already validated
  // every edge via the closed-taxonomy registry, so the source
  // typeKey is always resolvable from the batch; the target
  // may still be a raw cross-file reference (callee name /
  // import specifier) which we tag with the placeholder typeKey
  // `unresolved` — the projection writes still land in Neo4j
  // (MERGE on id) and the cross-file join happens in the lens
  // runner's read query.
  const sourceTypeKey =
    nodes.find((n) => n.id === edge.sourceId)?.typeKey ?? "unresolved";
  const targetTypeKey =
    nodes.find((n) => n.id === edge.targetId)?.typeKey ?? "unresolved";
  const provenance: ProvenanceFields = {
    sourceType: "code_graph_ingestion",
    sourceId: ingestionId,
    lineageStatus: "derived",
    extractionMethod: "tree-sitter",
    governanceStatus: "active",
  };
  return {
    kind: "upsert_edge",
    edge: {
      typeKey: edge.edgeTypeKey,
      id: edge.id,
      sourceNode: { typeKey: sourceTypeKey, id: edge.sourceId },
      targetNode: { typeKey: targetTypeKey, id: edge.targetId },
      properties: edge.properties ?? {},
      provenance,
    },
  };
}
