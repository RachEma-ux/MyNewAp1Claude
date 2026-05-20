/**
 * Vector + text signal bridge — closes the partial-implementation
 * gap from PR #1398 ("vector/text signal caller wiring is a separate
 * slice; the ranker contract exists, but caller-side population from
 * vector/lexical retrievers remains follow-up").
 *
 * Callers (chat-stream orchestrator, simulation harness, the future
 * RetrievalContext composer) own their vector store + lexical
 * search; this module gives them a turn-key way to project those
 * results into the `signalLookup` callback that
 * `GraphRetrievalRouter` consumes.
 *
 * Why a bridge module rather than baking into the router:
 *   - The router stays graph-shaped; vector + text retrieval
 *     belong to the orchestrator's tool surface. Inverting that
 *     control would couple the router to the vector store SDK +
 *     the lexical index — both of which the orchestrator can swap.
 *   - Pure function with no I/O — unit-testable without booting any
 *     retrieval backends.
 *
 * Score normalisation: both axes expect `[0, 1]` scores. Callers
 * surfacing raw distances (vector L2) or raw lexical scores
 * (Lucene BM25) must normalise BEFORE handing the result to this
 * module — the bridge does NOT silently re-scale, because a wrong
 * scale would flatten the ranker's signal contribution invisibly.
 *
 * Lookup keying: the bridge keys on the `ContextBlockOutput.id`
 * field — the same id the retrieval pipeline assigns when
 * constructing blocks from rows. Callers that have their results
 * keyed differently (block citation, source id, etc.) should
 * pre-map before feeding here; we don't try to infer which key
 * the caller used.
 */

import type { ContextBlockOutput } from "./safety-filter.js";
import type { RankSignals } from "./hybrid-ranker.js";

/**
 * Single-block scoring tuple from a vector retriever. `score` is
 * the normalised similarity in `[0, 1]` (1 = exact, 0 = unrelated).
 * Callers using raw cosine-distance should pre-flip to `1 - dist`
 * and clamp.
 */
export interface VectorRetrieverHit {
  readonly blockId: string;
  readonly score: number;
}

/**
 * Single-block scoring tuple from a lexical / full-text retriever.
 * `score` is the normalised relevance in `[0, 1]` (1 = top hit,
 * 0 = no overlap). Callers using raw BM25 / TF-IDF must clamp +
 * normalise upstream.
 */
export interface TextRetrieverHit {
  readonly blockId: string;
  readonly score: number;
}

export interface SignalBridgeInput {
  readonly vectorHits?: ReadonlyArray<VectorRetrieverHit>;
  readonly textHits?: ReadonlyArray<TextRetrieverHit>;
  /**
   * Optional freshness scores, also in `[0, 1]`. Callers compute
   * freshness from validFrom / projection snapshot age and feed
   * it through here so the ranker can use it without re-fetching
   * the source.
   */
  readonly freshnessHits?: ReadonlyArray<{ blockId: string; score: number }>;
}

/**
 * Builds a `signalLookup(block) => Partial<RankSignals>` callback
 * suitable for passing into `GraphRetrievalRouter` (item 30
 * follow-up). The callback merges per-block lookups for each
 * axis; an axis the caller didn't populate stays `undefined` and
 * the ranker treats it as "no signal" (contributes 0).
 *
 * Time complexity: O(V + T + F) at build time (one Map insert
 * per hit per axis), O(1) per `signalLookup(block)` call.
 */
export function buildSignalLookup(
  input: SignalBridgeInput,
): (block: ContextBlockOutput) => Partial<RankSignals> {
  const vectorByBlock = new Map<string, number>();
  if (input.vectorHits) {
    for (const h of input.vectorHits) vectorByBlock.set(h.blockId, h.score);
  }
  const textByBlock = new Map<string, number>();
  if (input.textHits) {
    for (const h of input.textHits) textByBlock.set(h.blockId, h.score);
  }
  const freshnessByBlock = new Map<string, number>();
  if (input.freshnessHits) {
    for (const h of input.freshnessHits) freshnessByBlock.set(h.blockId, h.score);
  }
  return (block: ContextBlockOutput): Partial<RankSignals> => {
    const out: Partial<RankSignals> = {};
    const v = vectorByBlock.get(block.id);
    if (typeof v === "number") out.vectorScore = v;
    const t = textByBlock.get(block.id);
    if (typeof t === "number") out.textScore = t;
    const f = freshnessByBlock.get(block.id);
    if (typeof f === "number") out.freshness = f;
    return out;
  };
}

/**
 * Compose two `signalLookup` callbacks into one. Used when a caller
 * wants to layer per-block signals from multiple sources (e.g., a
 * vector retriever AND a vault-internal heuristic). The second
 * lookup's fields take precedence on the same axis — callers
 * should pass the more authoritative source second.
 */
export function composeSignalLookups(
  ...lookups: ReadonlyArray<(block: ContextBlockOutput) => Partial<RankSignals>>
): (block: ContextBlockOutput) => Partial<RankSignals> {
  return (block) => {
    const out: Partial<RankSignals> = {};
    for (const lookup of lookups) {
      Object.assign(out, lookup(block));
    }
    return out;
  };
}
