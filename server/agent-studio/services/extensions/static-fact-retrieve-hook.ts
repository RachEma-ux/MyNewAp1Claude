/**
 * Static-fact retrieve lane hook factory — V1+ Phase 18-γ (PR T-B.4-retrieve).
 *
 * First concrete `retrieve` lane hook beyond the observability-only
 * smoke-test slice (`lane-hooks-observability.ts` at PR #768).
 *
 * Pattern: the factory returns a `ContractedLaneHookFn<"retrieve">`
 * that the registrant wires at boot via `registerLaneHook("retrieve", hook)`.
 * The hook looks up the invocation input's `factKey` (passed in
 * `input.arguments.factKey`) against a registrant-supplied static
 * fact table and contributes the matching `ContractedRetrievalChunk`
 * as a supplemental chunk. Non-matching keys produce a clean
 * `{ succeeded: true }` outcome with no contribution.
 *
 * Why static facts:
 *   - Smallest concrete contribution that exercises the full contract
 *     shape (`ContractedRetrievalChunk` + `ContractedChunkProvenance`).
 *   - No DB I/O — keeps the factory pure-data so tests don't need
 *     ASDB or a graph backend.
 *   - The shape generalizes: future hooks (vault-note retrieve,
 *     KB-search retrieve, graph-traversal retrieve) follow the same
 *     factory pattern with their own per-call data sources.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `*_API_KEY` reads.
 *   - No `dispatchMcpToolCall` import — retrieve lane is non-tool.
 *   - No `neo4j-driver` / `GraphRepository` imports — factory is
 *     data-table driven; concrete graph retrieve hooks go through
 *     GraphRepository in separate slices.
 *   - No `openrouter` imports.
 *   - The factory does NOT register itself — production callers
 *     decide whether to register; the factory is a building block.
 */

import type {
  ContractedChunkProvenance,
  ContractedLaneHookFn,
  ContractedRetrievalChunk,
  ContractedRetrieveOutcome,
} from "./lane-hook-contracts.js";

export interface StaticFactEntry {
  /** Lookup key matched against `input.arguments.factKey`. */
  readonly factKey: string;
  /** Pre-formed retrieval chunk contributed when the key matches.
   *  MUST carry valid provenance for downstream citation. */
  readonly chunk: ContractedRetrievalChunk;
}

export interface MakeStaticFactRetrieveHookOptions {
  /** Static fact table. Each entry is matched by exact `factKey`. */
  readonly facts: ReadonlyArray<StaticFactEntry>;
  /** Optional override of how the input's `factKey` argument is
   *  extracted. Defaults to reading `input.arguments?.factKey` when
   *  it's a string; otherwise returns null. */
  readonly extractFactKey?: (
    arguments_: Record<string, unknown> | undefined,
  ) => string | null;
}

/**
 * Lookup key extractor — the default implementation. Reads
 * `arguments.factKey` as a string; returns null when the field is
 * missing, undefined, or non-string.
 */
export function defaultExtractFactKey(
  arguments_: Record<string, unknown> | undefined,
): string | null {
  if (!arguments_) return null;
  const v = arguments_.factKey;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Factory — builds a `ContractedLaneHookFn<"retrieve">` from a static
 * fact table. The registrant calls this factory and registers the
 * returned hook via `registerLaneHook("retrieve", hook)`.
 */
export function makeStaticFactRetrieveHook(
  options: MakeStaticFactRetrieveHookOptions,
): ContractedLaneHookFn<"retrieve"> {
  // Build a key→chunk index at factory time so the per-invocation
  // path is O(1). Duplicates last-write-wins (registrants can
  // override defaults).
  const byKey = new Map<string, ContractedRetrievalChunk>();
  for (const entry of options.facts) {
    byKey.set(entry.factKey, entry.chunk);
  }
  const extract = options.extractFactKey ?? defaultExtractFactKey;

  return async ({ input }) => {
    const key = extract(input.payload);
    if (key === null) {
      const out: ContractedRetrieveOutcome = { succeeded: true };
      return out;
    }
    const chunk = byKey.get(key);
    if (!chunk) {
      const out: ContractedRetrieveOutcome = { succeeded: true };
      return out;
    }
    const out: ContractedRetrieveOutcome = {
      succeeded: true,
      supplementalChunks: [chunk],
    };
    return out;
  };
}

/**
 * Convenience builder — builds a `ContractedRetrievalChunk` from
 * the minimal fields. Use when authoring fact tables inline.
 */
export function makeStaticFactChunk(params: {
  readonly content: string;
  readonly score?: number;
  readonly provenance: ContractedChunkProvenance;
}): ContractedRetrievalChunk {
  return {
    content: params.content,
    score: params.score,
    provenance: params.provenance,
  };
}
