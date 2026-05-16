/**
 * Static-block compose lane hook factory — V1+ Phase 18-γ
 * (PR T-B.4-compose).
 *
 * Third and final concrete lane hook in the T-B.4 trio beyond the
 * observability-only smoke-test slice (`lane-hooks-observability.ts`
 * at PR #768). Companions: `makeStaticFactRetrieveHook` (#1179) for
 * the retrieve lane and `makeStaticChunkAssembleHook` (#1180) for the
 * assemble lane.
 *
 * Pattern: the factory returns a `ContractedLaneHookFn<"compose">`
 * that contributes a fixed set of opaque
 * `ReadonlyArray<Record<string, unknown>>` blocks AFTER the model's
 * composed answer arrives at the compose lane. The CAG-builder
 * integration is responsible for projecting these blocks into
 * whatever slot the builder accepts; the wrapper does not inspect
 * the payload (see `ContractedComposeOutcome` doc-block in
 * `lane-hook-contracts.ts`).
 *
 * Why static blocks (vs. assemble's static chunks):
 *   - Compose fires AFTER the model produces its answer. The natural
 *     contribution is "post-process annotation blocks" — e.g.,
 *     citation rewrites, redaction markers, formatter directives.
 *   - The block shape is opaque (`Record<string, unknown>`) by
 *     contract — the CAG-builder integration owns projection.
 *   - Predicate semantics match the assemble lane: registrants supply
 *     an optional `shouldContribute` to decide per-invocation; default
 *     is "always contribute".
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `*_API_KEY` reads.
 *   - No `dispatchMcpToolCall` import — compose lane is non-tool.
 *   - No `neo4j-driver` / `GraphRepository` imports.
 *   - No `openrouter` imports.
 *   - Factory does NOT self-register.
 */

import type {
  ContractedComposeOutcome,
  ContractedLaneHookFn,
} from "./lane-hook-contracts.js";
import type {
  ExtensionRecord,
  InvokeFromExtensionInput,
} from "./contracts.js";

export interface StaticBlockComposePredicateParams {
  readonly extension: ExtensionRecord;
  readonly input: InvokeFromExtensionInput;
}

export type StaticBlockComposePredicate = (
  params: StaticBlockComposePredicateParams,
) => boolean;

export interface MakeStaticBlockComposeHookOptions {
  /** Opaque blocks contributed when the predicate passes. */
  readonly blocks: ReadonlyArray<Record<string, unknown>>;
  /** Optional gate. Defaults to "always contribute". When supplied,
   *  returning `false` causes the hook to emit a clean
   *  `{ succeeded: true }` outcome with no blocks. */
  readonly shouldContribute?: StaticBlockComposePredicate;
}

/**
 * Default predicate — always contribute.
 */
export function defaultComposeShouldContribute(
  _params: StaticBlockComposePredicateParams,
): boolean {
  return true;
}

/**
 * Factory — builds a `ContractedLaneHookFn<"compose">` from a fixed
 * block list + optional predicate. The registrant calls this factory
 * and registers the returned hook via
 * `registerLaneHook("compose", hook)`.
 */
export function makeStaticBlockComposeHook(
  options: MakeStaticBlockComposeHookOptions,
): ContractedLaneHookFn<"compose"> {
  const blocks = options.blocks;
  const shouldContribute =
    options.shouldContribute ?? defaultComposeShouldContribute;

  return async (params) => {
    if (!shouldContribute(params)) {
      const out: ContractedComposeOutcome = { succeeded: true };
      return out;
    }
    if (blocks.length === 0) {
      const out: ContractedComposeOutcome = { succeeded: true };
      return out;
    }
    const out: ContractedComposeOutcome = {
      succeeded: true,
      supplementalBlocks: blocks,
    };
    return out;
  };
}
