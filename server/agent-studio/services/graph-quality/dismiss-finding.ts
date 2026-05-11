/**
 * Operator-marked finding dismissal.
 *
 * Phase 23 §1. When a quality finding is no longer applicable — e.g.,
 * the orphan node was naturally cleaned up by an unrelated change, or
 * the operator decides this finding is a false positive — the
 * operator calls `dismissFinding(findingId, reason?)` to flip the
 * lifecycle status to `dismissed` and record the rationale in the
 * details JSON.
 *
 * Dismissal does NOT create a graph-correction proposal — that's the
 * point: dismissal is the "ignore this, don't touch the graph"
 * resolution path.
 *
 * Idempotency:
 *   - Already-dismissed → throws `FindingAlreadyResolvedError` (status
 *     not in {open, triaged}).
 *   - Already-applied → also throws `FindingAlreadyResolvedError`. A
 *     finding whose proposal was applied is terminal; dismissing it
 *     after the fact would be misleading.
 *   - Triaged + dismiss is allowed — operator can dismiss a finding
 *     even after converting (e.g., they realize the proposal is wrong
 *     before approving it). The proposal row is NOT cancelled by this
 *     call; the operator should reject the proposal separately.
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsGraphQualityFindings } from "../../../../drizzle/tables/agent-studio-graph-quality.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export class FindingNotFoundError extends Error {
  constructor(public readonly findingId: number) {
    super(`Graph quality finding ${findingId} not found`);
    this.name = "FindingNotFoundError";
  }
}

export class FindingAlreadyResolvedError extends Error {
  constructor(
    public readonly findingId: number,
    public readonly currentStatus: string,
  ) {
    super(
      `Finding ${findingId} cannot be dismissed (current status: ${currentStatus})`,
    );
    this.name = "FindingAlreadyResolvedError";
  }
}

export interface DismissFindingInput {
  readonly findingId: number;
  readonly reason?: string;
  readonly dismissedByUserId?: number;
}

export interface DismissFindingOptions {
  readonly getDb?: typeof getAsDb;
}

export interface DismissFindingResult {
  readonly findingId: number;
  readonly priorStatus: string;
}

interface FindingRow {
  id: number;
  status: string;
  details: Record<string, unknown> | null;
}

export async function dismissFinding(
  input: DismissFindingInput,
  options: DismissFindingOptions = {},
): Promise<DismissFindingResult> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const rows = (await db
    .select({
      id: agsGraphQualityFindings.id,
      status: agsGraphQualityFindings.status,
      details: agsGraphQualityFindings.details,
    })
    .from(agsGraphQualityFindings)
    .where(eq(agsGraphQualityFindings.id, input.findingId))
    .limit(1)) as FindingRow[];

  const finding = rows[0];
  if (!finding) throw new FindingNotFoundError(input.findingId);

  if (finding.status === "dismissed" || finding.status === "applied") {
    throw new FindingAlreadyResolvedError(input.findingId, finding.status);
  }

  const nextDetails = {
    ...(finding.details ?? {}),
    dismissedReason: input.reason ?? null,
    dismissedByUserId: input.dismissedByUserId ?? null,
    dismissedAt: new Date().toISOString(),
    priorStatus: finding.status,
  };

  await db
    .update(agsGraphQualityFindings)
    .set({ status: "dismissed", details: nextDetails })
    .where(eq(agsGraphQualityFindings.id, input.findingId));

  return { findingId: input.findingId, priorStatus: finding.status };
}
