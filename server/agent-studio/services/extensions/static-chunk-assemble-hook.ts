/**
 * Static-chunk assemble lane hook factory — V1+ Phase 18-γ
 * (PR T-B.4-assemble).
 *
 * First concrete `assemble` lane hook beyond the observability-only
 * smoke-test slice (`lane-hooks-observability.ts` at PR #768).
 *
 * Pattern: the factory returns a `ContractedLaneHookFn<"assemble">`
 * that contributes a fixed set of `ContractedRetrievalChunk` values
 * to the assembled evidence AFTER the standard assembler runs.
 * Registrants supply an optional predicate to decide per-invocation
 * whether to contribute; the default is "always contribute".
 *
 * Why static chunks (vs. retrieve's static facts):
 *   - Assemble fires once per agent invocation, AFTER retrieval +
 *     plan filtering. The natural contribution is "boilerplate
 *     evidence that always applies" — e.g., a workspace policy
 *     summary, an operator-mandated citation footer.
 *   - The retrieve lane is key-driven (lookup by `factKey`); the
 *     assemble lane is context-driven (decide based on the full
 *     invocation context). The predicate gives registrants that
 *     branch point.
 *   - Tokens attributed defaults to a coarse estimate; the
 *     assembler enforces the `RAC_MAX_RETRIEVAL_EVIDENCE_TOKENS`
 *     cap so oversize claims are truncated regardless.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `*_API_KEY` reads.
 *   - No `dispatchMcpToolCall` import — assemble lane is non-tool.
 *   - No `neo4j-driver` / `GraphRepository` imports.
 *   - No `openrouter` imports.
 *   - Factory does NOT self-register.
 */

import type {
  ContractedAssembleOutcome,
  ContractedLaneHookFn,
  ContractedRetrievalChunk,
} from "./lane-hook-contracts.js";
import type {
  ExtensionRecord,
  InvokeFromExtensionInput,
} from "./contracts.js";

export interface StaticChunkAssemblePredicateParams {
  readonly extension: ExtensionRecord;
  readonly input: InvokeFromExtensionInput;
}

export type StaticChunkAssemblePredicate = (
  params: StaticChunkAssemblePredicateParams,
) => boolean;

export interface MakeStaticChunkAssembleHookOptions {
  /** Chunks contributed when the predicate passes. */
  readonly chunks: ReadonlyArray<ContractedRetrievalChunk>;
  /** Optional gate. Defaults to "always contribute". When supplied,
   *  returning `false` causes the hook to emit a clean
   *  `{ succeeded: true }` outcome with no chunks. */
  readonly shouldContribute?: StaticChunkAssemblePredicate;
  /** Optional override of the `tokensAttributed` value. Defaults to
   *  a coarse `Math.ceil(totalContentChars / 4)` estimate. */
  readonly tokensAttributed?: number;
}

/**
 * Default token estimator — 4 characters per token (coarse but
 * stable). Returns 0 for empty content arrays.
 */
export function defaultTokensAttributed(
  chunks: ReadonlyArray<ContractedRetrievalChunk>,
): number {
  let total = 0;
  for (const c of chunks) {
    total += c.content.length;
  }
  return total === 0 ? 0 : Math.ceil(total / 4);
}

/**
 * Default predicate — always contribute.
 */
export function defaultAssembleShouldContribute(
  _params: StaticChunkAssemblePredicateParams,
): boolean {
  return true;
}

/**
 * Factory — builds a `ContractedLaneHookFn<"assemble">` from a fixed
 * chunk list + optional predicate. The registrant calls this factory
 * and registers the returned hook via
 * `registerLaneHook("assemble", hook)`.
 */
export function makeStaticChunkAssembleHook(
  options: MakeStaticChunkAssembleHookOptions,
): ContractedLaneHookFn<"assemble"> {
  const chunks = options.chunks;
  const shouldContribute =
    options.shouldContribute ?? defaultAssembleShouldContribute;
  const tokensAttributed =
    options.tokensAttributed ?? defaultTokensAttributed(chunks);

  return async (params) => {
    if (!shouldContribute(params)) {
      const out: ContractedAssembleOutcome = { succeeded: true };
      return out;
    }
    if (chunks.length === 0) {
      const out: ContractedAssembleOutcome = { succeeded: true };
      return out;
    }
    const out: ContractedAssembleOutcome = {
      succeeded: true,
      supplementalChunks: chunks,
      tokensAttributed,
    };
    return out;
  };
}
