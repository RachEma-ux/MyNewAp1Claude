/**
 * GraphRAG Retrieval Router.
 *
 * Phase 12. Registers as a new RetrievalPlanItem source type in the
 * existing RAC planner. Does NOT replace `server/agent-studio/services/rac/`.
 *
 * Flow:
 *   1. Receive retrieval request from RAC planner.
 *   2. Inspect intent + Graph Skill Pack eligibility.
 *   3. Choose template / Text2Cypher / hybrid path.
 *   4. Execute via GraphRepository (read-only).
 *   5. Apply permission filter (already pushdown'd or app-side).
 *   6. Apply context safety filter.
 *   7. Assemble citations.
 *   8. Return context blocks.
 *
 * ADR: docs/architecture/agent-studio-graphrag-retrieval-router.md
 */

import type {
  EdgeIdentity,
  GraphRepository,
  NodeIdentity,
  RuntimeContext,
} from "../repository/index.js";
import { filterContextBlocks, type ContextBlockInput, type FilterResult } from "./safety-filter.js";
import { validateCypherReadOnly } from "./text2cypher-validator.js";

/**
 * Phase 12 §6 — BFS hop distance from `seedNodeId` across the given
 * `edges`. Edges are treated as undirected (a 1-hop neighbor is "close"
 * regardless of edge direction). Disconnected nodes get `Infinity` so
 * the caller can decide whether to keep them at a tail score or drop
 * them. Pure function — exported for unit testing.
 */
export function computeHopDistances(
  seedNodeId: string,
  nodes: ReadonlyArray<NodeIdentity>,
  edges: ReadonlyArray<EdgeIdentity>,
): Map<string, number> {
  const distances = new Map<string, number>();
  for (const n of nodes) distances.set(n.id, Number.POSITIVE_INFINITY);
  if (!distances.has(seedNodeId)) {
    // Seed isn't in the node set — return all-infinity (caller decides
    // how to score). This matches what callers see when localGraph
    // returns 0 nodes (which is itself an empty-result path the router
    // already short-circuits, but the helper stays usable in either
    // direction so unit tests can call it standalone).
    return distances;
  }
  distances.set(seedNodeId, 0);
  // Adjacency list (undirected).
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    const a = e.sourceNode.id;
    const b = e.targetNode.id;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  // Standard BFS.
  const queue: string[] = [seedNodeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curDist = distances.get(cur) ?? 0;
    for (const nb of adj.get(cur) ?? []) {
      const prev = distances.get(nb);
      if (prev === undefined || curDist + 1 < prev) {
        distances.set(nb, curDist + 1);
        queue.push(nb);
      }
    }
  }
  return distances;
}

export type RetrievalMode =
  | "graphrag_local"
  | "graphrag_global"
  | "graphrag_traversal"
  | "graphrag_text2cypher"
  | "graphrag_algorithm"
  | "hybrid_cag_graphrag"
  | "hybrid_rac_graphrag";

export interface GraphRetrievalInput {
  readonly mode: RetrievalMode;
  readonly query: string;
  readonly seedNodeId?: string;
  readonly templateKey?: string;
  readonly templateParameters?: Record<string, unknown>;
  readonly generatedCypher?: string;
  readonly maxDepth?: number;
  readonly maxResults?: number;
  readonly runtime: RuntimeContext;
}

export interface GraphRetrievalOutput {
  readonly mode: RetrievalMode;
  readonly contextBlocks: FilterResult["blocks"];
  readonly safetyEvents: FilterResult["events"];
  readonly citations: Array<{ sourceKind: string; sourceId: string; sourceVersionId?: string }>;
  readonly truncated: boolean;
  readonly durationMs: number;
  readonly rejectionReason?: string;
}

export class GraphRetrievalRouter {
  constructor(private readonly repository: GraphRepository) {}

  async retrieve(input: GraphRetrievalInput): Promise<GraphRetrievalOutput> {
    const startedAt = Date.now();

    // Text2Cypher guardrail
    if (input.mode === "graphrag_text2cypher") {
      if (!input.generatedCypher) {
        return this.emptyResult(input.mode, startedAt, "no_cypher_provided");
      }
      const validation = validateCypherReadOnly(input.generatedCypher);
      if (!validation.ok) {
        // Manual narrow — `strictNullChecks: false` in tsconfig.json
        // prevents the discriminated-union narrowing from kicking in,
        // so we use `in` to surface `reason` safely.
        const reason = "reason" in validation ? validation.reason : "unknown";
        return this.emptyResult(input.mode, startedAt, `text2cypher_${reason}`);
      }
    }

    let rawBlocks: ContextBlockInput[] = [];
    let truncated = false;

    switch (input.mode) {
      case "graphrag_local": {
        if (!input.seedNodeId) {
          return this.emptyResult(input.mode, startedAt, "no_seed_node");
        }
        const r = await this.repository.localGraph(
          input.seedNodeId,
          { maxDepth: input.maxDepth ?? 2, maxResults: input.maxResults ?? 50 },
          input.runtime,
        );
        truncated = r.truncated;
        const distances = computeHopDistances(
          input.seedNodeId,
          r.nodes,
          r.edges,
        );
        rawBlocks = r.nodes.map((n) =>
          this.nodeToBlock(n, distances.get(n.id)),
        );
        break;
      }
      case "graphrag_global": {
        const r = await this.repository.globalGraphSample(
          { maxDepth: 1, maxResults: input.maxResults ?? 50 },
          input.runtime,
        );
        truncated = r.truncated;
        rawBlocks = r.nodes.map((n) => this.nodeToBlock(n));
        break;
      }
      case "graphrag_traversal":
      case "graphrag_text2cypher": {
        if (input.templateKey) {
          const r = await this.repository.executeTemplate({
            templateKey: input.templateKey,
            parameters: input.templateParameters ?? {},
            runtime: input.runtime,
          });
          truncated = r.truncated;
          rawBlocks = r.rows.map((row, i) => this.rowToBlock(`${input.templateKey}:${i}`, row));
        }
        break;
      }
      case "graphrag_algorithm": {
        // Phase 13.5 wires real algorithm invocation through GraphAlgorithmRepository.
        break;
      }
      case "hybrid_cag_graphrag":
      case "hybrid_rac_graphrag": {
        // Wires into existing RAC planner; this router supplies the graph slice.
        if (input.seedNodeId) {
          const r = await this.repository.localGraph(
            input.seedNodeId,
            { maxDepth: input.maxDepth ?? 2, maxResults: input.maxResults ?? 25 },
            input.runtime,
          );
          truncated = r.truncated;
          const distances = computeHopDistances(
            input.seedNodeId,
            r.nodes,
            r.edges,
          );
          rawBlocks = r.nodes.map((n) =>
            this.nodeToBlock(n, distances.get(n.id)),
          );
        }
        break;
      }
    }

    const filtered = filterContextBlocks(rawBlocks, input.runtime);
    const citations = filtered.blocks.map((b) => b.citation);
    return {
      mode: input.mode,
      contextBlocks: filtered.blocks,
      safetyEvents: filtered.events,
      citations,
      truncated,
      durationMs: Date.now() - startedAt,
    };
  }

  private nodeToBlock(
    n: NodeIdentity,
    hopDistance?: number,
  ): ContextBlockInput {
    const payload: Record<string, unknown> = { node: n };
    if (hopDistance !== undefined && Number.isFinite(hopDistance)) {
      payload.hopDistance = hopDistance;
    }
    return {
      id: n.id,
      kind: "text",
      sourceKind: n.typeKey,
      sourceId: n.sourceId ?? n.id,
      sourceVersionId: n.sourceVersionId,
      governanceStatus: "active",
      payload,
    };
  }

  private rowToBlock(id: string, row: Record<string, unknown>): ContextBlockInput {
    return {
      id,
      kind: "graph_subgraph",
      sourceKind: "cypher_template",
      sourceId: id,
      governanceStatus: "active",
      payload: row,
    };
  }

  private emptyResult(mode: RetrievalMode, startedAt: number, reason: string): GraphRetrievalOutput {
    return {
      mode,
      contextBlocks: [],
      safetyEvents: [],
      citations: [],
      truncated: false,
      durationMs: Date.now() - startedAt,
      rejectionReason: reason,
    };
  }
}
