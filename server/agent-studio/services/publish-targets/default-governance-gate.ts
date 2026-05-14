/**
 * Default governance-gate registry — V1+ AS-2 follow-up to PR-V1-25.
 *
 * AS-1 (#776) shipped `createApprovalStepsGovernanceGate(opts)` as a
 * working `GovernanceGateFn` factory. The 19-γ executor (#772),
 * however, only consulted gates supplied as `input.governanceGate`
 * — meaning the AS-1 adapter had to be threaded through every
 * caller. This module installs a module-singleton "default" gate so
 * the executor falls through to it when callers don't supply their
 * own, mirroring the existing publish-pusher registry pattern
 * (`registry.ts`).
 *
 * Composition (production):
 *   At boot, `installDefaultGovernanceGate(
 *     createApprovalStepsGovernanceGate({ resolvePublishRequestId }))`
 *   wires the AS-1 adapter as the default. Per-call overrides via
 *   `executePublish({ ..., governanceGate })` still take precedence.
 *
 * Composition (tests):
 *   Tests use `__resetDefaultGovernanceGateForTests()` between
 *   cases so module state never leaks between specs.
 *
 * Hard-rule compliance:
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `neo4j-
 *     driver` imports. No raw `process.env.*_API_KEY`.
 *   - The registry holds the gate function only — it does not run
 *     it (the executor does). Idempotent re-registration overwrites.
 */

import type { GovernanceGateFn } from "./types.js";

let defaultGovernanceGate: GovernanceGateFn | null = null;

export function installDefaultGovernanceGate(
  gate: GovernanceGateFn,
): void {
  defaultGovernanceGate = gate;
}

export function getDefaultGovernanceGate(): GovernanceGateFn | null {
  return defaultGovernanceGate;
}

export function hasDefaultGovernanceGate(): boolean {
  return defaultGovernanceGate != null;
}

export function __resetDefaultGovernanceGateForTests(): void {
  defaultGovernanceGate = null;
}
