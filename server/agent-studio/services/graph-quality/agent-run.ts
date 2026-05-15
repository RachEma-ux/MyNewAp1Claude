/**
 * Graph Quality Agent run lifecycle.
 *
 * Phase 23 §1. Wraps multiple `runQualityScan` invocations (one per
 * registered scanner kind) inside a single audited run row in
 * `ags_graph_quality_agent_runs` (dormant table wired here for the
 * first time). Captures:
 *
 *   - startedAt / completedAt
 *   - status: running → completed | failed
 *   - proposalsCreated counter (incremented once per finding that the
 *     agent auto-converts to a proposal)
 *
 * The run wrapper has two modes:
 *   - `autoConvertFindings: false` (default) — runs scanners only.
 *     Findings land in `ags_graph_quality_findings`; an operator
 *     converts them later via `convertFindingToProposal`.
 *   - `autoConvertFindings: true` — runs scanners and immediately
 *     converts every emitted finding to a graph-correction proposal
 *     (with `proposedByAgentId` set). This is the autonomous
 *     quality-agent loop; it preserves the Phase 23 invariant that
 *     agents create PROPOSALS only — never approved mutations.
 *
 * The wrapper is fail-open per scanner: if scanner N throws, the
 * agent run continues to scanner N+1 and records the failure on the
 * scan-orchestrator row (status="failed", per PR #473). The agent
 * run itself only flips to failed if every scanner failed; partial
 * progress is the common case and is operator-surfaceable.
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsGraphQualityAgentRuns } from "../../../../drizzle/tables/agent-studio-graph-quality.js";
import {
  runQualityScan,
  type QualityScannerRegistration,
  type RunQualityScanResult,
} from "./scan-orchestrator.js";
import {
  convertFindingToProposal,
  FindingAlreadyConvertedError,
} from "./finding-to-proposal.js";
import type { GraphRepository } from "../graph/repository/index.js";
import { pushAgentRunNotifications } from "./agent-run-notifications.js";
import { captureUnexpectedTrpcError } from "../workspace-observability/public-api.js";
import { recordFailureStateEvent } from "../failure-states/observability-bridge.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export interface RunQualityAgentInput {
  /**
   * Which scanner kinds to run this agent pass. If omitted, runs every
   * scanner in `registry`.
   */
  readonly scanKinds?: readonly string[];
  readonly scope?: string;
  readonly sampleSize?: number;
  readonly autoConvertFindings?: boolean;
  readonly agentKey?: string;
  /**
   * Agent row id stamped on auto-created proposals. Only used when
   * `autoConvertFindings=true`.
   */
  readonly proposedByAgentId?: number;
  /**
   * If set, push `graph_quality_run_completed` + (conditionally)
   * `graph_quality_proposals_created` notifications to this user's
   * inbox after the run finalizes. Operator-triggered runs typically
   * pass `ctx.user.id`; autonomous runs may omit it.
   */
  readonly notifyUserId?: number;
}

export interface RunQualityAgentOptions {
  readonly registry: readonly QualityScannerRegistration[];
  readonly repository: GraphRepository;
  readonly getDb?: typeof getAsDb;
}

export interface ScannerInvocationSummary {
  readonly scanKind: string;
  readonly result: RunQualityScanResult;
}

export interface RunQualityAgentResult {
  readonly agentRunId: number;
  readonly status: "completed" | "failed";
  readonly proposalsCreated: number;
  readonly scannerSummaries: readonly ScannerInvocationSummary[];
}

/**
 * Resolves which scanner kinds the agent should run this pass.
 * Falls back to "every registered scanner" if the caller didn't
 * narrow the set.
 */
function resolveScanKinds(
  input: RunQualityAgentInput,
  registry: readonly QualityScannerRegistration[],
): readonly string[] {
  if (input.scanKinds && input.scanKinds.length > 0) return input.scanKinds;
  return registry.map((r) => r.scanKind);
}

interface FindingForConversion {
  id: number;
}

/**
 * Reads finding rows for a single scan id (used to drive
 * auto-conversion). Separate from `runQualityScan` itself so the
 * agent run can decide whether to convert *after* every scanner
 * has run — keeps scanner output and proposal generation logically
 * separable.
 */
async function listFindingIdsForScan(
  db: ReturnType<typeof getAsDb>,
  scanId: number,
): Promise<readonly number[]> {
  if (!db) return [];
  // Avoid a Drizzle table import circle by referring to the table
  // through the orchestrator's own module; readers pull from
  // `ags_graph_quality_findings` directly via lazy module load.
  const { agsGraphQualityFindings } = await import(
    "../../../../drizzle/tables/agent-studio-graph-quality.js"
  );
  const rows = (await db
    .select({ id: agsGraphQualityFindings.id })
    .from(agsGraphQualityFindings)
    .where(eq(agsGraphQualityFindings.scanId, scanId))) as FindingForConversion[];
  return rows.map((r) => Number(r.id));
}

/**
 * Inner loop for the autoConvertFindings path. Walks the finding ids
 * for a completed scan and runs `convertFindingToProposal` on each.
 * Returns the count of successful conversions.
 *
 * Conversion failures are NOT fatal for the agent run (per-finding
 * skip-and-continue), but expected failures (`FindingAlreadyConvertedError`,
 * the idempotent re-run case) are filtered out before observability
 * capture so the dashboard doesn't fill with benign duplicate-id noise.
 * Unexpected failures (ASDB unavailable, malformed finding row, etc.)
 * land in `ags_workspace_error_events` for the operator to triage.
 *
 * Exported for direct unit-testing — the agent-run integration test
 * exercises the orchestration; this helper covers the per-finding
 * skip/capture decision matrix in isolation.
 */
export async function convertFindingsBatch(
  findingIds: readonly number[],
  ctx: {
    readonly agentRunId: number;
    readonly scanKind: string;
    readonly proposedByAgentId?: number;
    readonly getDb?: typeof getAsDb;
  },
): Promise<number> {
  let converted = 0;
  for (const findingId of findingIds) {
    try {
      await convertFindingToProposal(
        {
          findingId,
          proposedByAgentId: ctx.proposedByAgentId,
        },
        { getDb: ctx.getDb },
      );
      converted += 1;
    } catch (err) {
      if (!(err instanceof FindingAlreadyConvertedError)) {
        void captureUnexpectedTrpcError(
          "graphQuality.agentRun.convertFinding",
          err,
          {
            sourceId: String(findingId),
            metadata: {
              findingId,
              agentRunId: ctx.agentRunId,
              scanKind: ctx.scanKind,
            },
          },
        );
      }
    }
  }
  return converted;
}

export async function runQualityAgent(
  input: RunQualityAgentInput,
  options: RunQualityAgentOptions,
): Promise<RunQualityAgentResult> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const inserted = await db
    .insert(agsGraphQualityAgentRuns)
    .values({
      agentKey: input.agentKey ?? "graph_quality_agent",
      startedAt: new Date(),
      status: "running",
    })
    .returning({ id: agsGraphQualityAgentRuns.id });
  const agentRunId = inserted[0]?.id;
  if (!agentRunId) {
    throw new Error("Failed to insert agent run row");
  }

  const scanKinds = resolveScanKinds(input, options.registry);
  const summaries: ScannerInvocationSummary[] = [];
  let proposalsCreated = 0;
  let allFailed = scanKinds.length > 0;

  for (const scanKind of scanKinds) {
    try {
      const result = await runQualityScan(
        {
          scanKind,
          scope: input.scope,
          sampleSize: input.sampleSize,
        },
        {
          registry: options.registry,
          repository: options.repository,
          getDb: options.getDb,
        },
      );
      summaries.push({ scanKind, result });
      if (result.status === "completed") {
        allFailed = false;
        // T-I.5 batch B — bridge per-scanner findings to the Phase 22
        // closed-taxonomy emission surface. Today only
        // `duplicate_entity` has a direct closed-kind mapping
        // (`entity_resolution_conflict`); other scanners feed proposals
        // without their own Phase 22 closed kind. Fire-and-forget.
        if (
          scanKind === "duplicate_entity" &&
          result.findingsCount > 0
        ) {
          void recordFailureStateEvent({
            failureState: "entity_resolution_conflict",
            sourceKind: "graph-quality-agent",
            sourceId: result.scanId == null ? null : String(result.scanId),
            errorMessage: `Duplicate-entity scan flagged ${result.findingsCount} conflict candidate(s)`,
            metadata: {
              scanKind,
              scanId: result.scanId,
              findingsCount: result.findingsCount,
              agentRunId,
            },
          }).catch(() => {
            // Fail-soft.
          });
        }
        if (input.autoConvertFindings && result.scanId != null) {
          const findingIds = await listFindingIdsForScan(
            db,
            result.scanId,
          );
          proposalsCreated += await convertFindingsBatch(findingIds, {
            agentRunId,
            scanKind,
            proposedByAgentId: input.proposedByAgentId,
            getDb: options.getDb,
          });
        }
      } else if (result.status !== "failed") {
        allFailed = false;
      }
    } catch (err) {
      summaries.push({
        scanKind,
        result: {
          scanId: null,
          status: "failed",
          findingsCount: 0,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      // Fire-and-forget observability capture per-scanner failure.
      // The agent run is fail-open across scanners (one failing
      // scanner doesn't kill the others), so capturing here surfaces
      // each individual scanner break to the dashboard while the
      // run summary keeps the per-kind detail in `summaries[]`.
      void captureUnexpectedTrpcError("graphQuality.agentRun", err, {
        sourceId: String(agentRunId),
        metadata: { scanKind, agentRunId },
      });
    }
  }

  const finalStatus: "completed" | "failed" =
    scanKinds.length === 0 ? "completed" : allFailed ? "failed" : "completed";

  await db
    .update(agsGraphQualityAgentRuns)
    .set({
      status: finalStatus,
      completedAt: new Date(),
      proposalsCreated,
    })
    .where(eq(agsGraphQualityAgentRuns.id, agentRunId));

  const result: RunQualityAgentResult = {
    agentRunId,
    status: finalStatus,
    proposalsCreated,
    scannerSummaries: summaries,
  };

  // Best-effort notification push. Failure is swallowed by the
  // bridge (returns errors[] instead of throwing) so a missing
  // notification never breaks the agent run.
  if (input.notifyUserId != null) {
    await pushAgentRunNotifications({
      userId: input.notifyUserId,
      agentRunResult: result,
    });
  }

  return result;
}
