/**
 * Generic governance-gate composer — V1+ AS-3 follow-up to AS-1 + AS-2.
 *
 * Until now there were two composition shapes:
 *   - `wrapWithCrossRegionGovernance(base, opts)` — wraps ONE base
 *     gate behind a cross-region pre-check.
 *   - implicit: callers picked one of (cross-region OR approval-
 *     steps OR custom) and supplied it as `input.governanceGate`.
 *
 * Operators wanting BOTH cross-region governance AND approval-steps
 * governance had to hand-roll a wrapping function. This helper
 * packages that pattern: any number of `GovernanceGateFn`s, run in
 * order, with the strictest decision winning.
 *
 * Decision rule (strictest wins, short-circuit on "rejected"):
 *   - Empty gate list                     → "approved"
 *     (no constraints = no gate; preserves the executor's existing
 *      "no gate ⇒ approved" semantics)
 *   - Any gate returns "rejected"         → "rejected"  (short-circuit)
 *   - No gate "rejected" + any "pending"  → "pending"
 *   - All gates "approved"                → "approved"
 *
 * Short-circuit on "rejected" is load-bearing: it lets an expensive
 * gate (DB lookup, remote call) be skipped if a cheap pre-check has
 * already rejected. Mirrors the cross-region wrapper's "check first"
 * design rationale.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure composition only. No DB, no IO, no `credential-resolver`,
 *     no `dispatchMcpToolCall`, no `*_API_KEY` reads, no `neo4j-
 *     driver`. Tests verify by source-scan.
 *   - Composer does not mutate the input array.
 */

import type { GovernanceDecision, GovernanceGateFn } from "./types.js";

/**
 * Run N governance gates in order and return the strictest decision.
 *
 * - Returns "approved" for an empty list (no constraint).
 * - Returns "rejected" as soon as any gate rejects (skips the rest).
 * - Returns "pending" if no gate rejects but at least one is pending.
 * - Returns "approved" only when every gate approves.
 */
export function composeGovernanceGates(
  gates: readonly GovernanceGateFn[],
): GovernanceGateFn {
  // Defensive copy — caller-mutation of `gates` after composition
  // must not change the composed gate's behavior.
  const snapshot = [...gates];
  return async function composedGate(input): Promise<GovernanceDecision> {
    let sawPending = false;
    for (const gate of snapshot) {
      const decision = await gate(input);
      if (decision === "rejected") return "rejected";
      if (decision === "pending") sawPending = true;
    }
    return sawPending ? "pending" : "approved";
  };
}
