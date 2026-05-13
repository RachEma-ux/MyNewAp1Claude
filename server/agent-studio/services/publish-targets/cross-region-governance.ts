/**
 * Cross-region publish governance — V1+ integration slice.
 *
 * Composes:
 *   - Phase MR-1 (#754) — region registry + workspace pinning.
 *   - Phase 19-γ (#772) — `executePublish` governance gate.
 *
 * Multi-region acceptance criterion #5 (V1+ plan §MR-1): "Governance
 * — cross-region promotion / publish requires explicit governance
 * step." This slice ships the composable gate adapter:
 *
 *   - `requiresCrossRegionGovernance(input)` — pure predicate over
 *     `(sourceRegionKey, targetRegionKey)`. Returns true when the
 *     two differ AND neither is null (no-pin → same-region default).
 *   - `wrapWithCrossRegionGovernance(baseGate, opts)` — adapter that
 *     composes a base `GovernanceGateFn` (the operator's normal
 *     same-region gate) with the cross-region check. When the
 *     regions differ, the result is downgraded to `"pending"` (the
 *     normal gate may still say "approved", but operator approval
 *     is mandatory for cross-region pushes).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure functions; no DB / no I/O. Region info is injected.
 *   - No `credential-resolver` import. No raw `process.env.*_API_KEY`.
 *   - No `dispatchMcpToolCall` import. No `neo4j-driver` import.
 *
 * The adapter is fully testable without a live ASDB; callers
 * supply `getTargetRegionKey(target, payload)` so the source of
 * region info stays operator-controlled (could be a config column,
 * a ledger lookup, or a request-scoped resolver).
 */

import type {
  GovernanceDecision,
  GovernanceGateFn,
  PublishPayload,
  PublishTargetRecord,
} from "./types.js";

export interface CrossRegionGovernanceInput {
  /** Region key the SOURCE workspace is pinned to. Null when the
   *  workspace has no pin (single-region operational baseline). */
  readonly sourceRegionKey: string | null;
  /** Region key the publish TARGET resides in. Null when unknown
   *  (rare — defensively treated as same-region). */
  readonly targetRegionKey: string | null;
}

/**
 * Pure predicate: true iff the source and target regions differ
 * AND both are known. A null on either side is treated as
 * same-region (single-region baseline; we don't escalate to extra
 * governance just because the operator hasn't pinned).
 */
export function requiresCrossRegionGovernance(
  input: CrossRegionGovernanceInput,
): boolean {
  if (input.sourceRegionKey == null || input.targetRegionKey == null) {
    return false;
  }
  return input.sourceRegionKey !== input.targetRegionKey;
}

export type GetSourceRegionKeyFn = (input: {
  readonly target: PublishTargetRecord;
  readonly payload: PublishPayload;
}) => Promise<string | null>;

export type GetTargetRegionKeyFn = (input: {
  readonly target: PublishTargetRecord;
  readonly payload: PublishPayload;
}) => Promise<string | null>;

export interface CrossRegionWrapOptions {
  /** Resolve the source workspace's pinned region. Operator-
   *  supplied (looks up workspace metadata; the executor itself
   *  has no opinion). */
  readonly getSourceRegionKey: GetSourceRegionKeyFn;
  /** Resolve the publish target's home region. */
  readonly getTargetRegionKey: GetTargetRegionKeyFn;
  /** Cross-region downgrade behavior:
   *  - `"pending"` (default) — operator must approve the cross-
   *    region push out-of-band.
   *  - `"rejected"` — cross-region pushes are blocked outright;
   *    operator must migrate the workspace first. */
  readonly downgrade?: "pending" | "rejected";
}

/**
 * Compose an existing `GovernanceGateFn` with the cross-region
 * check. The cross-region check runs FIRST; if it fires, the
 * decision is the configured downgrade (default `"pending"`)
 * regardless of the base gate's result. Otherwise the base gate
 * decides.
 *
 * Why "check first then short-circuit": same-region publishes
 * shouldn't pay the cross-region resolver cost beyond a string
 * compare; the base gate may be expensive (DB lookup of approval
 * steps).
 *
 * Test seam: the two resolver functions are caller-supplied, so
 * tests inject pure fakes.
 */
export function wrapWithCrossRegionGovernance(
  baseGate: GovernanceGateFn,
  opts: CrossRegionWrapOptions,
): GovernanceGateFn {
  const downgrade: "pending" | "rejected" = opts.downgrade ?? "pending";
  return async function composedGate(input): Promise<GovernanceDecision> {
    const sourceRegionKey = await opts.getSourceRegionKey(input);
    const targetRegionKey = await opts.getTargetRegionKey(input);
    if (
      requiresCrossRegionGovernance({ sourceRegionKey, targetRegionKey })
    ) {
      return downgrade;
    }
    return baseGate(input);
  };
}
