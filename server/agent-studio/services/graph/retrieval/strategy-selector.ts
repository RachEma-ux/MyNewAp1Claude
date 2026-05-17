/**
 * Advanced GraphRAG — strategy selector (Item 58, slice 1).
 *
 * Closes the strategy-selection gap surfaced by the post-MVP closure
 * prompt: prior to this module, `GraphAgentEngine.pickRetrievalMode`
 * hard-coded `graphrag_local` when the caller's `retrievalPreference`
 * was `"auto"`. The engine had no way to differentiate a single-hop
 * lookup ("what is X?") from a multi-hop ("how does X depend on Y?")
 * from a path question ("trace from X to Y") from a global question
 * ("what's in this knowledge graph?").
 *
 * This module ships a pure-functional `pickGraphRagStrategy(input)`
 * that returns the appropriate `RetrievalMode` for a given query +
 * available seed information. The function is deterministic, has no
 * I/O, and uses heuristic rules only (no model call) — so callers
 * can opt-in without risking new dependencies.
 *
 * Selection taxonomy:
 *
 *   - `graphrag_shortest_path` — query contains "path from X to Y",
 *     "trace from X to Y", "route from X to Y"; caller supplies a
 *     toNodeId; seedNodeId present.
 *
 *   - `graphrag_neighborhood`  — query contains "around", "near",
 *     "next to", "adjacent"; OR caller supplies a seedNodeId AND
 *     maxDepth >= 2; OR query starts with "what's connected to".
 *
 *   - `graphrag_local`         — query contains a known seed entity
 *     name AND no path/global signal; default for single-entity
 *     questions when a seed is available.
 *
 *   - `graphrag_global`        — no seed available; query is broad
 *     ("show me everything", "summarize the graph", "what's in here").
 *
 *   - `graphrag_algorithm`     — query contains an algorithm keyword
 *     ("most central", "communities", "page rank", "shortest path
 *     between all", etc.) AND the caller pre-resolved an
 *     `algorithmKey`.
 *
 * The selector NEVER returns `graphrag_text2cypher` — Text2Cypher is
 * the privileged escape hatch and stays caller-explicit.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` import.
 *   - No `openrouter` import.
 *   - No `dispatchMcpToolCall` import.
 *   - Pure module — no DB or model I/O.
 */

import type { RetrievalMode } from "./retrieval-router.js";

export interface StrategySelectorInput {
  /** The operator/user's natural-language query. */
  readonly query: string;
  /** Optional seed node id (e.g., the note the operator is on). */
  readonly seedNodeId?: string;
  /** Optional target node id (for path-style questions). */
  readonly toNodeId?: string;
  /** Optional max depth hint from caller; used to differentiate
   *  "local" (depth 1) from "neighborhood" (depth >= 2). */
  readonly maxDepth?: number;
  /** Optional pre-resolved algorithm key (e.g., "pagerank",
   *  "betweenness"); when present + query has an algorithm signal,
   *  the selector returns `graphrag_algorithm`. */
  readonly algorithmKey?: string;
}

export interface StrategySelectorOutput {
  readonly mode: RetrievalMode;
  /** Short, operator-readable reason for the selection. Surfaces
   *  into the decision-trace step output via the engine, so an
   *  operator opening "Why this answer?" can see why graphrag_local
   *  vs graphrag_neighborhood was chosen. */
  readonly reason: string;
  /** Per-rule contributions, exposed for debugging + audit. */
  readonly signals: Readonly<{
    pathSignal: boolean;
    neighborhoodSignal: boolean;
    globalSignal: boolean;
    algorithmSignal: boolean;
    hasSeed: boolean;
    hasTarget: boolean;
    hasAlgorithmKey: boolean;
  }>;
}

// Keyword sets — kept compact and operator-readable. Single source
// of truth so the test surface can assert against the same set.

export const PATH_KEYWORDS = [
  "path from",
  "trace from",
  "route from",
  "shortest path",
  "how do i get from",
  "how does x reach",
] as const;

export const NEIGHBORHOOD_KEYWORDS = [
  "around",
  "near",
  "next to",
  "adjacent",
  "connected to",
  "what's connected",
  "neighbors of",
  "siblings of",
] as const;

export const GLOBAL_KEYWORDS = [
  "summarize the graph",
  "show me everything",
  "what's in here",
  "overview",
  "high-level view",
  "all the",
] as const;

export const ALGORITHM_KEYWORDS = [
  "most central",
  "centrality",
  "communities",
  "page rank",
  "pagerank",
  "betweenness",
  "louvain",
  "shortest path between all",
] as const;

function lc(s: string): string {
  return s.toLowerCase();
}

function anyKeyword(query: string, keywords: ReadonlyArray<string>): boolean {
  const q = lc(query);
  for (const k of keywords) if (q.includes(k)) return true;
  return false;
}

/**
 * Pick the best GraphRAG retrieval mode for a given query + caller
 * context.
 *
 * Precedence order (highest priority first):
 *   1. Algorithm — when both keyword + algorithmKey are present.
 *   2. Shortest path — when path keyword + seed + target are all present.
 *   3. Neighborhood — when neighborhood keyword OR maxDepth >= 2 with seed.
 *   4. Local — when seed is present and no global/path signal.
 *   5. Global — when no seed AND query has global signal (or as fallback).
 *
 * The precedence is "specific-first": algorithm > path > neighborhood
 * > local > global. Reason: more-specific retrieval modes return
 * smaller, more-relevant context windows; the model wastes tokens on
 * irrelevant context if global is chosen too eagerly.
 */
export function pickGraphRagStrategy(
  input: StrategySelectorInput,
): StrategySelectorOutput {
  const pathSignal = anyKeyword(input.query, PATH_KEYWORDS);
  const neighborhoodSignal = anyKeyword(input.query, NEIGHBORHOOD_KEYWORDS);
  const globalSignal = anyKeyword(input.query, GLOBAL_KEYWORDS);
  const algorithmSignal = anyKeyword(input.query, ALGORITHM_KEYWORDS);
  const hasSeed = typeof input.seedNodeId === "string" && input.seedNodeId.length > 0;
  const hasTarget = typeof input.toNodeId === "string" && input.toNodeId.length > 0;
  const hasAlgorithmKey =
    typeof input.algorithmKey === "string" && input.algorithmKey.length > 0;

  const signals = {
    pathSignal,
    neighborhoodSignal,
    globalSignal,
    algorithmSignal,
    hasSeed,
    hasTarget,
    hasAlgorithmKey,
  } as const;

  // 1. Algorithm — most specific
  if (algorithmSignal && hasAlgorithmKey) {
    return {
      mode: "graphrag_algorithm",
      reason: `query contains an algorithm keyword AND caller supplied algorithmKey="${input.algorithmKey}"`,
      signals,
    };
  }

  // 2. Shortest path — specific second
  if (pathSignal && hasSeed && hasTarget) {
    return {
      mode: "graphrag_shortest_path",
      reason: `query contains a path keyword AND both seedNodeId + toNodeId supplied`,
      signals,
    };
  }

  // 3. Neighborhood — when the question is about "things around X"
  if (neighborhoodSignal || (hasSeed && (input.maxDepth ?? 0) >= 2)) {
    if (hasSeed) {
      return {
        mode: "graphrag_neighborhood",
        reason: neighborhoodSignal
          ? `query contains a neighborhood keyword AND seedNodeId supplied`
          : `caller hinted maxDepth>=2 with seedNodeId supplied`,
        signals,
      };
    }
    // Neighborhood signal but no seed → fall back to global
    // (don't trap on a malformed input).
  }

  // 4. Local — default for single-entity questions with seed
  if (hasSeed && !globalSignal) {
    return {
      mode: "graphrag_local",
      reason: `seedNodeId supplied; no path/neighborhood/algorithm/global signal in query`,
      signals,
    };
  }

  // 5. Global — fallback when no seed
  return {
    mode: "graphrag_global",
    reason: hasSeed
      ? `seedNodeId supplied but query contains a global signal — falling back to bounded global sample`
      : `no seedNodeId supplied; defaulting to bounded global sample`,
    signals,
  };
}
