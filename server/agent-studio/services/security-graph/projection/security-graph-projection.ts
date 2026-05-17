/**
 * Security Graph Neo4j Projection — production interface + wiring.
 *
 * Surface contract pinned at T-G.3.1. T-G.3.4 (this PR) wires the
 * factory to a real implementation that:
 *
 *   1. Reads the ingestion's nodes + edges from the ASDB store
 *      (`SecurityGraphStore.readIngestion()` — T-G.3.3)
 *   2. Converts each SecurityGraphNode / SecurityGraphEdge into a
 *      `ProjectionWrite` (the shape consumed by
 *      `GraphProjectionRepository.applyProjectionJob`)
 *   3. Calls `applyProjectionJob` — Phase 7.5b backs this with
 *      batched UNWIND writes via the wired Neo4j adapter (Phase 7.5a).
 *
 * Mirrors T-G.2.4's code-graph projection line-for-line —
 * precedent (q) carry-forward + DI factory takes { store,
 * repository }.
 *
 * Source-of-truth invariant: projection ONLY reads ASDB; never
 * writes to it. Re-projection of an existing ingestion is a
 * single-method call.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No direct `neo4j-driver` import. Projection calls through
 *     the GraphRepository surface (Phase 7.5b path).
 *   - No `dispatchMcpToolCall`.
 *   - No `process.env.*_API_KEY` reads.
 */

import type { SecurityGraphStore } from "../persistence/security-graph-store.js";
import type {
  GraphProjectionRepository,
  ProjectionWrite,
  ProvenanceFields,
} from "../../graph/repository/types.js";
import type {
  SecurityGraphEdge,
  SecurityGraphNode,
} from "../persistence/security-graph-store.js";

export interface ProjectSecurityGraphInput {
  readonly ingestionId: string;
}

export interface ProjectSecurityGraphResult {
  readonly ingestionId: string;
  readonly nodesProjected: number;
  readonly edgesProjected: number;
  readonly durationMs: number;
}

export interface SecurityGraphProjection {
  /**
   * Project an existing ASDB security-graph ingestion into Neo4j
   * via the GraphRepository. Idempotent (Neo4j MERGE on id).
   */
  projectIngestion(
    input: ProjectSecurityGraphInput,
  ): Promise<ProjectSecurityGraphResult>;
}

export interface SecurityGraphProjectionOptions {
  readonly store: SecurityGraphStore;
  readonly repository: GraphProjectionRepository;
}

/**
 * Factory entry point. Returns a projection that reads from the
 * given ASDB store and writes derived facts to Neo4j via the
 * given GraphRepository.
 */
export function createSecurityGraphProjection(
  options: SecurityGraphProjectionOptions,
): SecurityGraphProjection {
  return {
    async projectIngestion(
      input: ProjectSecurityGraphInput,
    ): Promise<ProjectSecurityGraphResult> {
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
        nodesProjected: result.nodesCreated + result.nodesUpdated,
        edgesProjected: result.edgesCreated + result.edgesUpdated,
        durationMs,
      };
    },
  };
}

function toNodeWrite(
  ingestionId: string,
  node: SecurityGraphNode,
): ProjectionWrite {
  const provenance: ProvenanceFields = {
    sourceType: "security_graph_ingestion",
    sourceId: ingestionId,
    lineageStatus: "derived",
    extractionMethod: "nvd_cve_feed",
    governanceStatus: "active",
  };
  return {
    kind: "upsert_node",
    node: {
      typeKey: node.typeKey,
      id: node.id,
      properties: {
        name: node.name,
        ...(node.properties ?? {}),
      },
      provenance,
    },
  };
}

function toEdgeWrite(
  ingestionId: string,
  edge: SecurityGraphEdge,
  nodes: ReadonlyArray<SecurityGraphNode>,
): ProjectionWrite {
  // Same unresolved-endpoint tolerance pattern as T-G.2.4: when
  // a target node isn't in the same batch (cross-ingestion link)
  // we tag with placeholder `unresolved` typeKey. Neo4j MERGE on
  // id still lands the write; the lens runner joins on read.
  const sourceTypeKey =
    nodes.find((n) => n.id === edge.sourceId)?.typeKey ?? "unresolved";
  const targetTypeKey =
    nodes.find((n) => n.id === edge.targetId)?.typeKey ?? "unresolved";
  const provenance: ProvenanceFields = {
    sourceType: "security_graph_ingestion",
    sourceId: ingestionId,
    lineageStatus: "derived",
    extractionMethod: "nvd_cve_feed",
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
