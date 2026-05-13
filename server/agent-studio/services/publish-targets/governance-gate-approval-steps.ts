/**
 * Approval-steps governance gate adapter — V1+ integration slice.
 *
 * Composes Phase 19-γ (#772) `executePublish` governance gate with
 * the existing `agsApprovalSteps` approval scaffolding referenced
 * by CLAUDE.md ("`agsApprovalSteps` ... `evaluateGovernance()` must
 * be reused where possible"). Until this adapter shipped, the 19-γ
 * gate had no concrete implementation — operators had to bring
 * their own `GovernanceGateFn`. This is the canonical wiring for
 * the publish-request approval workflow.
 *
 * Exports:
 *   - `decideGovernanceFromApprovalSteps(steps)` — pure decision
 *     over a list of approval-step states. Single source of truth
 *     for the gate's semantics; safe to unit-test without ASDB.
 *   - `createApprovalStepsGovernanceGate(opts)` — factory returning
 *     a `GovernanceGateFn` that resolves the publishRequestId from
 *     the gate input, loads its `agsApprovalSteps` rows, and applies
 *     the pure decision.
 *
 * Pure decision rule:
 *   - any step `"rejected"`                       → `"rejected"`
 *   - non-empty AND all steps `"approved"`        → `"approved"`
 *   - empty / null request id / any non-terminal → `"pending"`
 *
 * Hard-rule compliance (CLAUDE.md + Plan v3 D2):
 *   - DB access via the standard `getAsDb` seam; overrideable for
 *     tests via `opts.getDb` or `opts.listApprovalSteps`.
 *   - No `credential-resolver` import. No raw `process.env.*_API_KEY`.
 *   - No `dispatchMcpToolCall` import. No `neo4j-driver` import.
 *   - Read-only against `agsApprovalSteps`. State transitions stay
 *     in the existing approval router/services; this adapter does
 *     not write.
 */

import { eq } from "drizzle-orm";

import { getAsDb } from "../../db/connection.js";
import { agsApprovalSteps } from "../../../../drizzle/tables/agent-studio.js";
import type {
  GovernanceDecision,
  GovernanceGateFn,
  PublishPayload,
  PublishTargetRecord,
} from "./types.js";

export type ResolvePublishRequestIdFn = (input: {
  readonly target: PublishTargetRecord;
  readonly payload: PublishPayload;
}) => Promise<number | null>;

export interface ApprovalStepSnapshot {
  readonly state: string;
}

export interface CreateApprovalStepsGovernanceGateOptions {
  readonly resolvePublishRequestId: ResolvePublishRequestIdFn;
  /** Test seam — defaults to `getAsDb`. */
  readonly getDb?: typeof getAsDb;
  /** Test seam — when provided, the gate uses this list-fn instead
   *  of querying ASDB. Receives the resolved publishRequestId. */
  readonly listApprovalSteps?: (
    publishRequestId: number,
  ) => Promise<readonly ApprovalStepSnapshot[]>;
}

export function decideGovernanceFromApprovalSteps(
  steps: readonly ApprovalStepSnapshot[],
): GovernanceDecision {
  if (steps.length === 0) return "pending";
  let allApproved = true;
  for (const step of steps) {
    if (step.state === "rejected") return "rejected";
    if (step.state !== "approved") allApproved = false;
  }
  return allApproved ? "approved" : "pending";
}

export function createApprovalStepsGovernanceGate(
  opts: CreateApprovalStepsGovernanceGateOptions,
): GovernanceGateFn {
  return async function approvalStepsGate(input): Promise<GovernanceDecision> {
    const publishRequestId = await opts.resolvePublishRequestId(input);
    if (publishRequestId == null) return "pending";

    if (opts.listApprovalSteps) {
      const steps = await opts.listApprovalSteps(publishRequestId);
      return decideGovernanceFromApprovalSteps(steps);
    }

    const db = (opts.getDb ?? getAsDb)();
    if (!db) {
      // ASDB unavailable — defensive default. We never silently
      // approve when the store is down.
      return "pending";
    }

    const rows = await db
      .select({ state: agsApprovalSteps.state })
      .from(agsApprovalSteps)
      .where(eq(agsApprovalSteps.publishRequestId, publishRequestId));

    return decideGovernanceFromApprovalSteps(rows);
  };
}

export type { GovernanceGateFn, GovernanceDecision } from "./types.js";
