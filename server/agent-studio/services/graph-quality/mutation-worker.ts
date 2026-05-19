/**
 * Approved-proposal mutation worker (Phase 23 §1 stub).
 *
 * Reads an approved `ags_graph_correction_proposals` row, extracts
 * the typed `payload` (built by `proposal-payload-builder` in PR #479),
 * dispatches to a per-kind applier, writes an `applied` (or `apply_failed`)
 * row into `ags_graph_correction_audit_events`, and returns a structured
 * result.
 *
 * THIS IS A STUB: the appliers do NOT yet write to the graph. The
 * actual Postgres/Neo4j mutations land in Phase 7.5 (Neo4j live wiring)
 * + Phase 11.5 (graph change proposal adapter). What ships here:
 *
 *   - the discriminated dispatch on `payload.kind`
 *   - the audit hookup (every apply attempt produces an audit event)
 *   - the state-guard contracts (must be approved, must not already
 *     be applied)
 *   - the per-kind applier surface so the future writer just fills
 *     in `appliers/<kind>.ts` without re-touching this orchestrator.
 *
 * Why ship the orchestrator before the appliers exist? Because the
 * contract is the load-bearing artifact: the future appliers must
 * be (proposal-row, payload) → applierResult; nothing else gets to
 * touch the graph through this path. Locking that contract here
 * means Phase 7.5's appliers slot in by name.
 */

import { and, desc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphCorrectionProposals,
  agsGraphCorrectionAuditEvents,
  agsGraphQualityFindings,
} from "../../../../drizzle/tables/agent-studio-graph-quality.js";
import type { ProposalPayload } from "./proposal-payload-builder.js";
import { pushApplyProposalNotification } from "./agent-run-notifications.js";
import { captureUnexpectedTrpcError } from "../workspace-observability/public-api.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export class ProposalNotFoundError extends Error {
  constructor(public readonly proposalId: number) {
    super(`Graph correction proposal ${proposalId} not found`);
    this.name = "ProposalNotFoundError";
  }
}

export class ProposalNotApprovedError extends Error {
  constructor(
    public readonly proposalId: number,
    public readonly currentStatus: string,
  ) {
    super(
      `Proposal ${proposalId} is not approved (status=${currentStatus}); cannot apply.`,
    );
    this.name = "ProposalNotApprovedError";
  }
}

export class ProposalAlreadyAppliedError extends Error {
  constructor(public readonly proposalId: number) {
    super(`Proposal ${proposalId} already applied`);
    this.name = "ProposalAlreadyAppliedError";
  }
}

export class InvalidProposalPayloadError extends Error {
  constructor(public readonly proposalId: number, message: string) {
    super(`Proposal ${proposalId} payload invalid: ${message}`);
    this.name = "InvalidProposalPayloadError";
  }
}

export interface ApplierResult {
  readonly applied: boolean;
  readonly reason?: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Per-payload-kind applier surface. Each function is pure-side-effect
 * over the graph; this orchestrator wraps every call in an audit row.
 *
 * `DEFAULT_APPLIER_REGISTRY` returns `{ applied: true, details: { stub:
 * true, ... } }` — intentionally no-op so unit tests can drive the
 * orchestrator without booting a graph backend. Production code wraps
 * the default with `createRepositoryBackedApplierRegistry`
 * (`repository-backed-applier.ts`), which routes the writes through
 * `GraphRepository.enqueueProjectionJob`. Apply-mode is observable on
 * the result via the `details.stub` discriminant; the operator UI
 * uses it to surface a "Stub apply mode" warning.
 */
export interface ApplierRegistry {
  readonly archive_node: (payload: Extract<ProposalPayload, { kind: "archive_node" }>) => Promise<ApplierResult>;
  readonly merge_into_canonical: (
    payload: Extract<ProposalPayload, { kind: "merge_into_canonical" }>,
  ) => Promise<ApplierResult>;
  readonly re_promote_with_source_version: (
    payload: Extract<ProposalPayload, { kind: "re_promote_with_source_version" }>,
  ) => Promise<ApplierResult>;
  readonly manual_review: (
    payload: Extract<ProposalPayload, { kind: "manual_review" }>,
  ) => Promise<ApplierResult>;
}

/**
 * Default appliers — no-op stubs that log the would-be-write into
 * `details` and return `applied: true` (orchestrator-only). Production
 * code overlays these with `createRepositoryBackedApplierRegistry`
 * (`repository-backed-applier.ts`), which routes the writes through
 * `GraphRepository.enqueueProjectionJob`. Callers that need to detect
 * whether a real write occurred can read `details.stub`.
 *
 * `manual_review` is the sole applier that returns `applied: false` —
 * by design, no automation runs for unknown finding kinds.
 */
export const DEFAULT_APPLIER_REGISTRY: ApplierRegistry = {
  archive_node: async (payload) => ({
    applied: true,
    details: {
      stub: true,
      wouldArchive: { typeKey: payload.typeKey, nodeId: payload.nodeId },
    },
  }),
  merge_into_canonical: async (payload) => ({
    applied: true,
    details: {
      stub: true,
      wouldMerge: {
        typeKey: payload.typeKey,
        canonicalNodeId: payload.canonicalNodeId,
        duplicateNodeId: payload.duplicateNodeId,
      },
    },
  }),
  re_promote_with_source_version: async (payload) => ({
    applied: true,
    details: {
      stub: true,
      wouldRePromote: {
        sourceTypeKey: payload.sourceTypeKey,
        sourceId: payload.sourceId,
        targetNodeId: payload.targetNodeId,
      },
    },
  }),
  manual_review: async (payload) => ({
    applied: false,
    reason: `manual_review requires operator action: ${payload.note}`,
  }),
};

export interface ApplyApprovedProposalInput {
  readonly proposalId: number;
  /**
   * If set, push a `graph_quality_proposal_applied` or
   * `graph_quality_proposal_apply_failed` notification to this user's
   * inbox after the apply finalizes. Best-effort — push errors are
   * swallowed and never break the apply path.
   */
  readonly notifyUserId?: number;
}

export interface ApplyApprovedProposalResult {
  readonly proposalId: number;
  readonly payloadKind: ProposalPayload["kind"];
  readonly result: ApplierResult;
}

export interface ApplyApprovedProposalOptions {
  readonly getDb?: typeof getAsDb;
  readonly registry?: ApplierRegistry;
}

interface ProposalRow {
  id: number;
  status: string;
  proposedChange: Record<string, unknown> | null;
}

function extractPayload(
  proposalId: number,
  proposedChange: Record<string, unknown> | null,
): ProposalPayload {
  if (!proposedChange) {
    throw new InvalidProposalPayloadError(
      proposalId,
      "proposedChange is null",
    );
  }
  const payload = proposedChange.payload;
  if (!payload || typeof payload !== "object") {
    throw new InvalidProposalPayloadError(
      proposalId,
      "proposedChange.payload missing or not an object",
    );
  }
  const kind = (payload as Record<string, unknown>).kind;
  if (typeof kind !== "string") {
    throw new InvalidProposalPayloadError(
      proposalId,
      "proposedChange.payload.kind missing or not a string",
    );
  }
  return payload as ProposalPayload;
}

function dispatchApplier(
  registry: ApplierRegistry,
  payload: ProposalPayload,
): Promise<ApplierResult> {
  switch (payload.kind) {
    case "archive_node":
      return registry.archive_node(payload);
    case "merge_into_canonical":
      return registry.merge_into_canonical(payload);
    case "re_promote_with_source_version":
      return registry.re_promote_with_source_version(payload);
    case "manual_review":
      return registry.manual_review(payload);
  }
}

export async function applyApprovedProposal(
  input: ApplyApprovedProposalInput,
  options: ApplyApprovedProposalOptions = {},
): Promise<ApplyApprovedProposalResult> {
  const getDb = options.getDb ?? getAsDb;
  const registry = options.registry ?? DEFAULT_APPLIER_REGISTRY;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const rows = (await db
    .select({
      id: agsGraphCorrectionProposals.id,
      status: agsGraphCorrectionProposals.status,
      proposedChange: agsGraphCorrectionProposals.proposedChange,
    })
    .from(agsGraphCorrectionProposals)
    .where(eq(agsGraphCorrectionProposals.id, input.proposalId))
    .limit(1)) as ProposalRow[];

  const proposal = rows[0];
  if (!proposal) throw new ProposalNotFoundError(input.proposalId);
  if (proposal.status !== "approved") {
    throw new ProposalNotApprovedError(input.proposalId, proposal.status);
  }

  // Already-applied guard: scan audit events for an "applied" row.
  const audits = await db
    .select({ id: agsGraphCorrectionAuditEvents.id })
    .from(agsGraphCorrectionAuditEvents)
    .where(
      and(
        eq(agsGraphCorrectionAuditEvents.proposalId, input.proposalId),
        eq(agsGraphCorrectionAuditEvents.eventKind, "applied"),
      ),
    )
    .orderBy(desc(agsGraphCorrectionAuditEvents.createdAt))
    .limit(1);
  if (audits.length > 0) {
    throw new ProposalAlreadyAppliedError(input.proposalId);
  }

  const payload = extractPayload(input.proposalId, proposal.proposedChange);

  let result: ApplierResult;
  try {
    result = await dispatchApplier(registry, payload);
  } catch (err) {
    result = {
      applied: false,
      reason: err instanceof Error ? err.message : String(err),
    };
    // Fire-and-forget observability capture. Applier throws are
    // converted to applied=false results so the audit chain stays
    // consistent; the operator dashboard also sees them via the
    // error_events stream. Same pattern as #505 wired into scan-
    // orchestrator + agent-run.
    void captureUnexpectedTrpcError("graphQuality.mutationWorker", err, {
      sourceId: String(input.proposalId),
      metadata: { payloadKind: payload.kind, proposalId: input.proposalId },
    });
  }

  await db.insert(agsGraphCorrectionAuditEvents).values({
    proposalId: input.proposalId,
    eventKind: result.applied ? "applied" : "apply_failed",
    metadata: {
      payloadKind: payload.kind,
      reason: result.reason ?? null,
      details: result.details ?? null,
    },
  });

  // Back-patch the source finding's lifecycle if we can resolve it from
  // the proposal payload. The converter (PR #475) carries
  // proposedChange.finding.id; the mutation-worker stub doesn't take a
  // hard dependency on that shape — if the id is missing/unparseable,
  // we silently skip the finding update.
  if (result.applied && proposal.proposedChange) {
    const findingBlob = (proposal.proposedChange as Record<string, unknown>)
      .finding;
    if (findingBlob && typeof findingBlob === "object") {
      const findingId = (findingBlob as Record<string, unknown>).id;
      if (typeof findingId === "number") {
        await db
          .update(agsGraphQualityFindings)
          .set({ status: "applied" })
          .where(eq(agsGraphQualityFindings.id, findingId));
      }
    }
  }

  const applyResult: ApplyApprovedProposalResult = {
    proposalId: input.proposalId,
    payloadKind: payload.kind,
    result,
  };

  // Best-effort notification push. Failure is swallowed by the
  // bridge (returns `error: string | null` instead of throwing) so
  // a failed push cannot break the apply path.
  if (input.notifyUserId != null) {
    await pushApplyProposalNotification({
      userId: input.notifyUserId,
      applyResult,
    });
  }

  return applyResult;
}
