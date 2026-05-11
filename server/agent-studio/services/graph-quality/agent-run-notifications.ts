/**
 * Quality-agent run → user notification bridge.
 *
 * Phase 22 ↔ Phase 23 follow-up. After a Quality Agent run
 * completes, pushes a per-user notification into
 * `ags_workspace_user_notifications` so the operator sees a
 * dashboard alert when scanners surface new findings or auto-
 * convert them into proposals.
 *
 * Best-effort: notification push errors are swallowed (logged at
 * the caller's discretion). A failed push must not break the
 * agent-run finalization.
 *
 * Notification kinds emitted:
 *   - `graph_quality_run_completed` — every run, regardless of
 *     findings count.
 *   - `graph_quality_proposals_created` — only when
 *     `autoConvertFindings=true` AND the run created at least
 *     one proposal.
 *
 * `userId` resolution: callers pass it explicitly. The agent-run
 * orchestrator picks it up from the calling tRPC context (operator-
 * triggered runs) or from a scheduled-agent registry (autonomous
 * runs) — neither is in scope for this helper.
 */

import { pushNotification } from "../workspace-observability/user-notifications.js";
import type { RunQualityAgentResult } from "./agent-run.js";
import type { ApplyApprovedProposalResult } from "./mutation-worker.js";

export interface AgentRunNotifyInput {
  readonly userId: number;
  readonly agentRunResult: RunQualityAgentResult;
}

export interface AgentRunNotifyOptions {
  readonly pushNotification?: typeof pushNotification;
}

export interface AgentRunNotifyOutcome {
  readonly runCompletedPushed: boolean;
  readonly proposalsCreatedPushed: boolean;
  readonly errors: readonly string[];
}

const RUN_KIND = "graph_quality_run_completed";
const PROPOSALS_KIND = "graph_quality_proposals_created";

export async function pushAgentRunNotifications(
  input: AgentRunNotifyInput,
  options: AgentRunNotifyOptions = {},
): Promise<AgentRunNotifyOutcome> {
  const pusher = options.pushNotification ?? pushNotification;
  const errors: string[] = [];

  const runPayload: Record<string, unknown> = {
    agentRunId: input.agentRunResult.agentRunId,
    status: input.agentRunResult.status,
    proposalsCreated: input.agentRunResult.proposalsCreated,
    scannerCount: input.agentRunResult.scannerSummaries.length,
    findingsCount: input.agentRunResult.scannerSummaries.reduce(
      (acc, s) => acc + s.result.findingsCount,
      0,
    ),
  };

  let runCompletedPushed = false;
  try {
    await pusher({
      userId: input.userId,
      notificationKind: RUN_KIND,
      payload: runPayload,
    });
    runCompletedPushed = true;
  } catch (e) {
    errors.push(`${RUN_KIND}: ${e instanceof Error ? e.message : String(e)}`);
  }

  let proposalsCreatedPushed = false;
  if (input.agentRunResult.proposalsCreated > 0) {
    try {
      await pusher({
        userId: input.userId,
        notificationKind: PROPOSALS_KIND,
        payload: {
          agentRunId: input.agentRunResult.agentRunId,
          proposalsCreated: input.agentRunResult.proposalsCreated,
        },
      });
      proposalsCreatedPushed = true;
    } catch (e) {
      errors.push(
        `${PROPOSALS_KIND}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { runCompletedPushed, proposalsCreatedPushed, errors };
}

// ---------- apply-proposal notification ----------

const PROPOSAL_APPLIED_KIND = "graph_quality_proposal_applied";
const PROPOSAL_APPLY_FAILED_KIND = "graph_quality_proposal_apply_failed";

export interface ApplyNotifyInput {
  readonly userId: number;
  readonly applyResult: ApplyApprovedProposalResult;
}

export interface ApplyNotifyOutcome {
  readonly pushed: boolean;
  readonly notificationKind: string | null;
  readonly error: string | null;
}

/**
 * Pushes a single notification reflecting the outcome of a mutation
 * worker apply:
 *   - `applied: true`  → `graph_quality_proposal_applied`
 *   - `applied: false` → `graph_quality_proposal_apply_failed`
 *
 * Best-effort same as the run-completion bridge — push errors land
 * in `outcome.error` instead of throwing. A failed notification
 * cannot break the apply path.
 */
export async function pushApplyProposalNotification(
  input: ApplyNotifyInput,
  options: AgentRunNotifyOptions = {},
): Promise<ApplyNotifyOutcome> {
  const pusher = options.pushNotification ?? pushNotification;
  const applied = input.applyResult.result.applied;
  const notificationKind = applied
    ? PROPOSAL_APPLIED_KIND
    : PROPOSAL_APPLY_FAILED_KIND;

  const payload: Record<string, unknown> = {
    proposalId: input.applyResult.proposalId,
    payloadKind: input.applyResult.payloadKind,
    applied,
    reason: input.applyResult.result.reason ?? null,
  };

  try {
    await pusher({
      userId: input.userId,
      notificationKind,
      payload,
    });
    return { pushed: true, notificationKind, error: null };
  } catch (e) {
    return {
      pushed: false,
      notificationKind,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
