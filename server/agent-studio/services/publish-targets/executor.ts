/**
 * Publish-target execution — Phase 19-α V1+ first slice.
 *
 * Composes:
 *   1. Target lookup (by id or targetKey)
 *   2. Pusher resolution from the registry (by targetType)
 *   3. Ledger row insert (`ags_publish_target_executions`)
 *   4. Pusher invocation (pusher acquires its own credentials)
 *   5. Ledger row finalization (success / failure)
 *   6. Returns a structured result
 *
 * Idempotency: the `(target_id, source_promotion_id, attempt)`
 * unique tuple is enforced at the DB level. The executor computes
 * `attempt` as `max(existing attempts for this (target, promotion))
 * + 1`. Callers retry by re-invoking; the second call inserts
 * `attempt=2`.
 *
 * Hard-rule compliance (Plan v3 D2 + CLAUDE.md):
 *   - This module does NOT import the internal credential resolver
 *     (`server/provider-connections/internal/credential-resolver`).
 *     Per D2, that import is restricted to
 *     `server/openrouter/model-access/**`. Source-scan tested.
 *   - This module does NOT read `process.env.*_API_KEY`. Source-
 *     scan tested.
 *   - The pusher is responsible for acquiring its own credentials
 *     (e.g. via a closure captured at registration time, or via
 *     Model Access for AI-bound targets). The `target.providerConnectionId`
 *     is an opaque reference the pusher can use to look up its
 *     scoped credential surface.
 *   - No graph mutation. This module reads promotion ids only.
 */

import { eq, sql, and } from "drizzle-orm";

import { getAsDb } from "../../db/connection.js";
import {
  agsPublishTargets,
  agsPublishTargetExecutions,
} from "../../../../drizzle/tables/agent-studio-publish-targets.js";
import { getPublishPusher } from "./registry.js";
import { getDefaultGovernanceGate } from "./default-governance-gate.js";
import {
  isPublishTargetType,
  type GovernanceGateFn,
  type PublishExecutionOutcome,
  type PublishPayload,
  type PublishPusher,
  type PublishTargetRecord,
  type PublishTargetType,
} from "./types.js";

export class PublishTargetNotFoundError extends Error {
  readonly code = "publish_target_not_found";
  constructor(identifier: string | number) {
    super(`Publish target not found: ${String(identifier)}`);
    this.name = "PublishTargetNotFoundError";
  }
}

export class PublishTargetDisabledError extends Error {
  readonly code = "publish_target_disabled";
  constructor(targetKey: string) {
    super(`Publish target is disabled: ${targetKey}`);
    this.name = "PublishTargetDisabledError";
  }
}

export class PublishPusherNotRegisteredError extends Error {
  readonly code = "publish_pusher_not_registered";
  constructor(targetType: string) {
    super(`No pusher registered for target type: ${targetType}`);
    this.name = "PublishPusherNotRegisteredError";
  }
}

export interface ExecutePublishInput {
  /** Either `targetId` OR `targetKey` is required. */
  readonly targetId?: number;
  readonly targetKey?: string;
  readonly payload: PublishPayload;
  /** Test seam — supply a stubbed pusher map and bypass the
   *  registry. The default uses `getPublishPusher()`. */
  readonly pusherLookup?: (
    targetType: PublishTargetType,
  ) => PublishPusher | undefined;
  /** V1+ Phase 19-γ — optional governance gate. When omitted, the
   *  executor proceeds as if the gate returned `"approved"`. */
  readonly governanceGate?: GovernanceGateFn;
  /** Test seam — supply a stubbed target loader and bypass the
   *  DB lookup. Default uses the internal `loadTarget` helper. */
  readonly targetLoader?: (
    input: { targetId?: number; targetKey?: string },
  ) => Promise<PublishTargetRecord>;
}

export interface ExecutePublishResult {
  readonly executionId: number;
  readonly attempt: number;
  readonly outcome: PublishExecutionOutcome;
}

async function loadTarget(input: ExecutePublishInput): Promise<PublishTargetRecord> {
  const db = getAsDb();
  if (!db) {
    throw new PublishTargetNotFoundError(
      input.targetKey ?? input.targetId ?? "(none)",
    );
  }
  const rows = await db
    .select()
    .from(agsPublishTargets)
    .where(
      input.targetId !== undefined
        ? eq(agsPublishTargets.id, input.targetId)
        : eq(agsPublishTargets.targetKey, input.targetKey ?? ""),
    );
  const row = rows[0];
  if (!row) {
    throw new PublishTargetNotFoundError(
      input.targetKey ?? input.targetId ?? "(none)",
    );
  }
  if (!isPublishTargetType(row.targetType)) {
    throw new Error(
      `Target ${row.targetKey} has unrecognized targetType="${row.targetType}". ` +
        `Allowed: staging_env | remote_vault | external_kb.`,
    );
  }
  if (!row.enabled) {
    throw new PublishTargetDisabledError(row.targetKey);
  }
  return {
    id: row.id,
    targetKey: row.targetKey,
    targetType: row.targetType,
    endpoint: row.endpoint,
    providerConnectionId: row.providerConnectionId,
    config: (row.config as Record<string, unknown> | null) ?? null,
    enabled: row.enabled,
  };
}

async function nextAttempt(
  targetId: number,
  sourcePromotionId: number,
): Promise<number> {
  const db = getAsDb();
  if (!db) return 1;
  const rows = await db
    .select({ maxAttempt: sql<number>`coalesce(max(${agsPublishTargetExecutions.attempt}), 0)::int` })
    .from(agsPublishTargetExecutions)
    .where(
      and(
        eq(agsPublishTargetExecutions.targetId, targetId),
        eq(
          agsPublishTargetExecutions.sourcePromotionId,
          sourcePromotionId,
        ),
      ),
    );
  return (rows[0]?.maxAttempt ?? 0) + 1;
}

/**
 * Execute one push attempt against the named target. Inserts a
 * ledger row, runs the pusher, finalizes the ledger row with the
 * outcome, returns the structured result. The pusher is responsible
 * for its own credential acquisition (Plan v3 D2).
 */
export async function executePublish(
  input: ExecutePublishInput,
): Promise<ExecutePublishResult> {
  const loader = input.targetLoader ?? loadTarget;
  const target = await loader({
    targetId: input.targetId,
    targetKey: input.targetKey,
  });
  const pusherLookup = input.pusherLookup ?? getPublishPusher;
  const pusher = pusherLookup(target.targetType);
  if (!pusher) {
    throw new PublishPusherNotRegisteredError(target.targetType);
  }
  const attempt = await nextAttempt(
    target.id,
    input.payload.sourcePromotionId,
  );
  // V1+ Phase 19-γ — governance gate. Per-call `input.governanceGate`
  // wins; otherwise the module-default installed via
  // `installDefaultGovernanceGate` is consulted (AS-2). When neither
  // is set, no gate runs and the decision stays "approved".
  // The gate result drives the row's status:
  //   approved → continue (pusher runs, in_flight → succeeded/failed)
  //   pending  → stage a `pending` ledger row; pusher NEVER runs;
  //              caller re-invokes after governance sign-off.
  //   rejected → stage a `failed` ledger row with errorMessage
  //              "governance_rejected"; pusher NEVER runs.
  const governanceGate =
    input.governanceGate ?? getDefaultGovernanceGate();
  let governanceDecision: "approved" | "pending" | "rejected" = "approved";
  if (governanceGate) {
    governanceDecision = await governanceGate({
      target,
      payload: input.payload,
    });
  }
  if (governanceDecision !== "approved") {
    const stagedStatus = governanceDecision === "pending" ? "pending" : "failed";
    const stagedError =
      governanceDecision === "rejected" ? "governance_rejected" : undefined;
    const outcome: PublishExecutionOutcome = {
      status: stagedStatus,
      errorMessage: stagedError,
      details: { governanceDecision },
    };
    const db = getAsDb();
    if (!db) return { executionId: 0, attempt, outcome };
    const [staged] = await db
      .insert(agsPublishTargetExecutions)
      .values({
        targetId: target.id,
        sourcePromotionId: input.payload.sourcePromotionId,
        sourceVersionId: input.payload.sourceVersionId ?? null,
        attempt,
        status: stagedStatus,
        startedAt: new Date(),
        completedAt: stagedStatus === "failed" ? new Date() : null,
        errorMessage: stagedError ?? null,
        details: { governanceDecision },
      })
      .returning({ id: agsPublishTargetExecutions.id });
    return { executionId: staged?.id ?? 0, attempt, outcome };
  }

  const db = getAsDb();
  if (!db) {
    // Test-mode fall-through: still call the pusher so unit tests
    // exercising the wire-up shape work.
    const outcome = await pusher({ target, payload: input.payload });
    return { executionId: 0, attempt, outcome };
  }

  const startedAt = new Date();
  const [inserted] = await db
    .insert(agsPublishTargetExecutions)
    .values({
      targetId: target.id,
      sourcePromotionId: input.payload.sourcePromotionId,
      sourceVersionId: input.payload.sourceVersionId ?? null,
      attempt,
      status: "in_flight",
      startedAt,
    })
    .returning({ id: agsPublishTargetExecutions.id });
  const executionId = inserted?.id ?? 0;

  let outcome: PublishExecutionOutcome;
  try {
    outcome = await pusher({ target, payload: input.payload });
  } catch (err) {
    outcome = {
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  await db
    .update(agsPublishTargetExecutions)
    .set({
      status: outcome.status,
      upstreamArtifactId: outcome.upstreamArtifactId ?? null,
      payloadDigest: outcome.payloadDigest ?? null,
      errorMessage: outcome.errorMessage ?? null,
      details: outcome.details ?? null,
      completedAt: new Date(),
    })
    .where(eq(agsPublishTargetExecutions.id, executionId));

  return { executionId, attempt, outcome };
}
