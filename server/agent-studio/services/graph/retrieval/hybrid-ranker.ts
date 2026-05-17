/**
 * Hybrid ranker — GraphRAG / Retrieval item 30.
 *
 * Pure deterministic ranker over post-filter context blocks. Combines
 * up to five signals:
 *
 *   - graph proximity (hopDistance from seed when present)
 *   - vector similarity (when caller threads it in)
 *   - text/full-text score (when caller threads it in)
 *   - source freshness (validFrom / validTo / projection snapshot age)
 *   - source confidence (provenance.confidence)
 *
 * Permission status is enforced UPSTREAM by the safety filter — by the
 * time blocks reach this ranker, hidden / cross-workspace data is
 * already gone. The ranker NEVER promotes a hidden block (it never
 * sees one). This is the load-bearing invariant for item 30 acceptance.
 *
 * Why deterministic:
 *   - Same inputs → same ranks. No clock reads, no random, no model
 *     calls. Operator audit can re-derive any rank from the inputs.
 *
 * Why pure:
 *   - Easy to test. Easy to compose into the existing
 *     GraphRetrievalRouter return path without a second module
 *     boundary.
 */

import type { ContextBlockOutput } from "./safety-filter.js";

export interface RankSignals {
  /** BFS hop distance from the seed (smaller = closer). undefined → not applicable. */
  readonly hopDistance?: number;
  /** Vector similarity score in [0, 1] (higher = more similar). undefined → not applicable. */
  readonly vectorScore?: number;
  /** Full-text / lexical relevance score in [0, 1]. undefined → not applicable. */
  readonly textScore?: number;
  /** Freshness in [0, 1] (1 = brand new, 0 = stale). undefined → not applicable. */
  readonly freshness?: number;
  /** Provenance confidence in [0, 1]. undefined → not applicable. */
  readonly confidence?: number;
}

export interface RankWeights {
  readonly hopProximity: number;
  readonly vector: number;
  readonly text: number;
  readonly freshness: number;
  readonly confidence: number;
}

export const DEFAULT_RANK_WEIGHTS: RankWeights = {
  hopProximity: 0.30,
  vector: 0.25,
  text: 0.20,
  freshness: 0.15,
  confidence: 0.10,
};

export interface RankedBlock<T extends ContextBlockOutput = ContextBlockOutput> {
  readonly block: T;
  /** Final hybrid score in [0, 1]. Higher = more relevant. */
  readonly score: number;
  /** Per-signal contribution after normalization + weighting. */
  readonly contributions: Readonly<Record<keyof RankSignals, number>>;
  /** Human-readable reason; one short clause per non-zero contribution. */
  readonly reason: string;
}

export interface HybridRankInput<T extends ContextBlockOutput> {
  readonly block: T;
  readonly signals: RankSignals;
}

export interface HybridRankOptions {
  readonly weights?: Partial<RankWeights>;
  /**
   * Maximum hop distance to consider "close." Beyond this, the
   * proximity contribution decays to 0. Default 5 — matches the
   * router's default localGraph maxDepth ceiling.
   */
  readonly hopDistanceCeiling?: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function mergeWeights(overrides?: Partial<RankWeights>): RankWeights {
  return { ...DEFAULT_RANK_WEIGHTS, ...overrides };
}

function normalizedHopProximity(
  hopDistance: number | undefined,
  ceiling: number,
): number {
  if (typeof hopDistance !== "number" || !Number.isFinite(hopDistance)) {
    return 0;
  }
  if (hopDistance <= 0) return 1;
  if (hopDistance >= ceiling) return 0;
  // Linear decay from 1 at hop 0 → 0 at the ceiling.
  return clamp01(1 - hopDistance / ceiling);
}

function scoreBlock<T extends ContextBlockOutput>(
  signals: RankSignals,
  weights: RankWeights,
  hopCeiling: number,
): { score: number; contributions: Readonly<Record<keyof RankSignals, number>>; reason: string } {
  const contributions: Record<keyof RankSignals, number> = {
    hopDistance: 0,
    vectorScore: 0,
    textScore: 0,
    freshness: 0,
    confidence: 0,
  };
  contributions.hopDistance =
    weights.hopProximity * normalizedHopProximity(signals.hopDistance, hopCeiling);
  contributions.vectorScore =
    typeof signals.vectorScore === "number"
      ? weights.vector * clamp01(signals.vectorScore)
      : 0;
  contributions.textScore =
    typeof signals.textScore === "number"
      ? weights.text * clamp01(signals.textScore)
      : 0;
  contributions.freshness =
    typeof signals.freshness === "number"
      ? weights.freshness * clamp01(signals.freshness)
      : 0;
  contributions.confidence =
    typeof signals.confidence === "number"
      ? weights.confidence * clamp01(signals.confidence)
      : 0;
  const score =
    contributions.hopDistance +
    contributions.vectorScore +
    contributions.textScore +
    contributions.freshness +
    contributions.confidence;
  const reasons: string[] = [];
  if (contributions.hopDistance > 0)
    reasons.push(`hop-proximity ${contributions.hopDistance.toFixed(2)}`);
  if (contributions.vectorScore > 0)
    reasons.push(`vector ${contributions.vectorScore.toFixed(2)}`);
  if (contributions.textScore > 0)
    reasons.push(`text ${contributions.textScore.toFixed(2)}`);
  if (contributions.freshness > 0)
    reasons.push(`freshness ${contributions.freshness.toFixed(2)}`);
  if (contributions.confidence > 0)
    reasons.push(`confidence ${contributions.confidence.toFixed(2)}`);
  return {
    score: clamp01(score),
    contributions,
    reason: reasons.length === 0 ? "no signals" : reasons.join("; "),
  };
}

/**
 * Rank a list of post-filter context blocks by hybrid score.
 *
 * Stable sort — equal-scored blocks preserve their input order so the
 * router's existing ordering acts as the tiebreaker.
 *
 * IMPORTANT: this function MUST be called with already-permission-
 * filtered blocks (i.e., the output of `filterContextBlocks`). It does
 * NOT re-check permissions; doing so here would be a second source of
 * truth for the safety boundary.
 */
export function rankHybrid<T extends ContextBlockOutput>(
  inputs: ReadonlyArray<HybridRankInput<T>>,
  options: HybridRankOptions = {},
): ReadonlyArray<RankedBlock<T>> {
  const weights = mergeWeights(options.weights);
  const hopCeiling = options.hopDistanceCeiling ?? 5;
  // Map → preserve original index for stable tiebreaker.
  const scored = inputs.map((input, originalIdx) => {
    const { score, contributions, reason } = scoreBlock(
      input.signals,
      weights,
      hopCeiling,
    );
    return {
      block: input.block,
      score,
      contributions,
      reason,
      originalIdx,
    };
  });
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.originalIdx - b.originalIdx;
  });
  return scored.map(({ block, score, contributions, reason }) => ({
    block,
    score,
    contributions,
    reason,
  }));
}

/**
 * Convenience: extract rank signals from a block's payload + provenance
 * for the common case where the router has stashed hopDistance and
 * confidence on the block. Returns a partial signals object — callers
 * can layer vector/text/freshness signals on top.
 */
export function extractDefaultSignals(
  block: ContextBlockOutput,
): RankSignals {
  const payload = block.payload as Record<string, unknown>;
  const hopDistance =
    typeof payload?.hopDistance === "number" ? payload.hopDistance : undefined;
  const confidence =
    typeof payload?.confidence === "number" ? payload.confidence : undefined;
  return {
    hopDistance,
    confidence,
  };
}
