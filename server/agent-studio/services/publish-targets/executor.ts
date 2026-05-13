/**
 * Publish-target execution — Phase 19-α V1+ first slice.
 *
 * Composes:
 *   1. Target lookup (by id or targetKey)
 *   2. Pusher resolution from the registry (by targetType)
 *   3. Plan v3 D1 credential boundary (`withProviderCredential` if
 *      `providerConnectionId` is bound; otherwise null is passed)
 *   4. Ledger row insert (`ags_publish_target_executions`)
 *   5. Pusher invocation inside the credential closure
 *   6. Ledger row finalization (success / failure)
 *   7. Returns a structured result
 *
 * Idempotency: the `(target_id, source_promotion_id, attempt)`
 * unique tuple is enforced at the DB level. The executor computes
 * `attempt` as `max(existing attempts for this (target, promotion))
 * + 1`. Callers retry by re-invoking; the second call inserts
 * `attempt=2`.
 *
 * Hard-rule compliance:
 *   - No `process.env.*_API_KEY` reads here or in the pushers. The
 *     credential ALWAYS flows through `withProviderCredential`. A
 *     source-scan test pins this property.
 *   - No graph mutation. This module reads promotion ids but does
 *     not write graph state.
 */

import { eq, sql, and } from "drizzle-orm";

import { getAsDb } from "../../db/connection.js";
import {
  agsPublishTargets,
  agsPublishTargetExecutions,
} from "../../../../drizzle/tables/agent-studio-publish-targets.js";
import { withProviderCredential } from "../../../provider-connections/internal/credential-resolver.js";
import { getPublishPusher } from "./registry.js";
import {
  isPublishTargetType,
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
  /** Test seam — bypass `withProviderCredential`. Useful in unit
   *  tests where the secrets subsystem is not available. */
  readonly skipCredentialResolution?: boolean;
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
 * ledger row, runs the pusher inside the credential closure (if
 * any), finalizes the ledger row with the outcome, returns the
 * structured result.
 */
export async function executePublish(
  input: ExecutePublishInput,
): Promise<ExecutePublishResult> {
  const target = await loadTarget(input);
  const pusherLookup = input.pusherLookup ?? getPublishPusher;
  const pusher = pusherLookup(target.targetType);
  if (!pusher) {
    throw new PublishPusherNotRegisteredError(target.targetType);
  }
  const attempt = await nextAttempt(
    target.id,
    input.payload.sourcePromotionId,
  );
  const db = getAsDb();
  if (!db) {
    // Test-mode fall-through: still call the pusher so unit tests
    // exercising the wire-up shape work. Skip credential resolution.
    const outcome = await pusher({
      target,
      payload: input.payload,
      credential: null,
    });
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
    if (
      target.providerConnectionId !== null &&
      !input.skipCredentialResolution
    ) {
      outcome = await withProviderCredential(
        target.providerConnectionId,
        async (credential) =>
          pusher({ target, payload: input.payload, credential }),
      );
    } else {
      outcome = await pusher({
        target,
        payload: input.payload,
        credential: null,
      });
    }
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
