/**
 * Agent Studio — Tool Approvals tRPC sub-router (Retrofit P11).
 *
 * Wires the Phase 9 approval-gate service to the operator UI.
 *
 *   - `list`            — protected; rows for a runtime run, newest first
 *   - `listByDraft`     — protected; pending rows for an agent draft
 *   - `getByHash`       — protected; lookup by (agentDraftId, hash)
 *   - `decide`          — governed; flips a pending row to allowed/denied
 *
 * Mounted on the agent-studio root router as `toolApprovals`. The
 * retrofit prompt names this surface `governance.toolApprovals.*` —
 * keeping it on the agent-studio root keeps the existing client
 * `agentStudio.toolApprovals` shape; the platform's `governance` slice
 * stays focused on workspace-level governance.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import {
  router,
  protectedProcedure,
  governedProcedure,
} from "../../_core/trpc";
import { getAsDb } from "../db/connection";
import {
  agsAgentDrafts,
  agsAgents,
  agsPendingPermissionRequests,
} from "../../../drizzle/tables/agent-studio";
import { decideApprovalRequest } from "../services/approval/approval-gate";

function asdb() {
  const db = getAsDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ASDB unavailable" });
  }
  return db;
}

/**
 * H2-c6 (cycle-6 audit closure §H2-c6) — safe column projection for
 * API-exposed list endpoints.
 *
 * Pre-cycle-6 `list` / `listByDraft` / `getByHash` used bare
 * `.select()`, returning every column on `agsPendingPermissionRequests`
 * — including:
 *
 *   - `rawPayload` — full request payload from openllm-agent2
 *     (contains tool arguments verbatim, which may include API keys,
 *     credentials, secrets that the LLM emitted)
 *   - `proposedToolCallJson` — full Phase 8 envelope (also contains
 *     unredacted arguments)
 *
 * Either column can leak credentials to anyone with read access to a
 * draft's approvals. The dispatcher's audit payload sanitizes args
 * via `sanitizeArgsForAudit`; these list endpoints did not.
 *
 * Post-cycle-6 — explicit projection. The PUBLIC_APPROVAL_COLUMNS
 * map names every column the operator UI consumes: id, runtimeRunId,
 * toolName, description, status, decidedBy, decidedAt, reason,
 * createdAt, expiresAt, lastUsedAt, agentDraftId,
 * proposedToolCallHash. Notably absent: `rawPayload`,
 * `proposedToolCallJson`. The hash IS exposed (operator UI displays
 * a short prefix; can't be used to reconstruct the args).
 *
 * If a future endpoint legitimately needs the raw payload (e.g.
 * dedicated detail-view with sanitization), it can call a separate
 * helper that explicitly projects the unsafe columns + sanitizes.
 * The default-deny posture: never project unsafe columns by default.
 */
const PUBLIC_APPROVAL_COLUMNS = {
  id: agsPendingPermissionRequests.id,
  runtimeRunId: agsPendingPermissionRequests.runtimeRunId,
  toolName: agsPendingPermissionRequests.toolName,
  description: agsPendingPermissionRequests.description,
  status: agsPendingPermissionRequests.status,
  decidedBy: agsPendingPermissionRequests.decidedBy,
  decidedAt: agsPendingPermissionRequests.decidedAt,
  reason: agsPendingPermissionRequests.reason,
  createdAt: agsPendingPermissionRequests.createdAt,
  proposedToolCallHash: agsPendingPermissionRequests.proposedToolCallHash,
  expiresAt: agsPendingPermissionRequests.expiresAt,
  lastUsedAt: agsPendingPermissionRequests.lastUsedAt,
  agentDraftId: agsPendingPermissionRequests.agentDraftId,
} as const;

/**
 * C2-c6 (cycle-6 audit closure §C2-c6) — per-row authorization for the
 * `decide` mutation.
 *
 * Pre-cycle-6: `decide` ran `decideApprovalRequest(approvalRequestId)`
 * directly. `governedProcedure` only checks the action-key-level RBAC
 * (cycle-3 R7 COARSE_CAPABILITY_ROLES), not which approval row the
 * caller has access to. An authenticated user with API access could
 * decide approvals on drafts they didn't own by guessing or
 * brute-forcing `approvalRequestId` — cross-workspace privilege
 * escalation.
 *
 * Post-cycle-6: this helper resolves the approval row → draft → agent
 * chain and returns the agent's `ownerId`. `decide` then enforces
 * `ownerId === ctx.user.id` OR caller has admin role. Returns null
 * when the approval row doesn't exist (caller gets `NOT_FOUND`); the
 * draft chain rows must exist if the approval row does (FK invariant
 * holds at the DB layer once M2-c5 + future approval-row FKs land —
 * for now the chain is best-effort and returns null on any missing
 * link, surfacing as `NOT_FOUND`).
 *
 * L2-c6 (cycle-6 audit closure §L2-c6) — nullable agentDraftId case:
 *   `agsPendingPermissionRequests.agentDraftId` is `integer` (nullable
 *   — the column was added in retrofit P9 D-APP-EXT-2 with no
 *   backfill, so legacy rows from before that phase carry NULL).
 *   When `agentDraftId IS NULL`, the `innerJoin` on
 *   `agsAgentDrafts.id` returns zero rows (NULL ≠ any id), so this
 *   helper returns null and the C2-c6 owner check throws
 *   `NOT_FOUND`. That is the CORRECT behavior — a legacy approval
 *   row has no resolvable owner and cannot be authorized — but the
 *   caller-visible 404 looks like a row-not-found error rather than
 *   a "row exists but is unauthorized." Operators triaging
 *   support tickets should distinguish:
 *     - 404 with no row in the table → typo / already-deleted
 *     - 404 with row in table but `agentDraftId IS NULL` → legacy
 *       row that needs backfill or hard-delete via DBA
 *   The L2-c6 closure is the documentation itself; no code change
 *   because the behavior is already correct (verify-then-decide
 *   via `if (!owner) throw NOT_FOUND`). A future PR that adds
 *   D-APP-EXT-2 backfill + NOT NULL constraint can remove this
 *   doc-block at the same time.
 */
async function resolveApprovalOwner(
  db: ReturnType<typeof asdb>,
  approvalRequestId: number,
): Promise<{ ownerId: number | null } | null> {
  const rows = await db
    .select({ ownerId: agsAgents.ownerId })
    .from(agsPendingPermissionRequests)
    .innerJoin(
      agsAgentDrafts,
      eq(agsPendingPermissionRequests.agentDraftId, agsAgentDrafts.id),
    )
    .innerJoin(agsAgents, eq(agsAgentDrafts.agentId, agsAgents.id))
    .where(eq(agsPendingPermissionRequests.id, approvalRequestId))
    .limit(1);
  return rows[0] ?? null;
}

export const toolApprovalsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        runtimeRunId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
      const db = asdb();
      // H2-c6: explicit projection (no rawPayload / proposedToolCallJson).
      return db
        .select(PUBLIC_APPROVAL_COLUMNS)
        .from(agsPendingPermissionRequests)
        .where(eq(agsPendingPermissionRequests.runtimeRunId, input.runtimeRunId))
        .orderBy(desc(agsPendingPermissionRequests.createdAt))
        .limit(input.limit);
    }),

  /**
   * M3-c6: filtering by `status: "allowed"` returns rows whose
   * `expiresAt` may already be in the past. The runtime gate
   * (`evaluateApprovalGate`) reads `expiresAt` per-call and rejects
   * expired rows correctly, but this listing endpoint surfaces
   * `status` verbatim. Operators who want a "currently-permitted"
   * count should either (a) run the periodic expiry-sweep SQL
   * (`scripts/migrations/manual/ags-pending-perm-expiry-sweep.sql`)
   * which flips elapsed `allowed` rows to `timed_out` with
   * `reason='expiry_sweep'`, or (b) post-filter the response by
   * `expiresAt > now`. We do not auto-filter at the SQL layer
   * because that would hide rows the operator legitimately wants
   * to see (e.g. for audit/forensic purposes).
   */
  listByDraft: protectedProcedure
    .input(
      z.object({
        agentDraftId: z.number().int().positive(),
        status: z
          .enum(["pending", "allowed", "denied", "timed_out"])
          .optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
      const db = asdb();
      const conds = [
        eq(agsPendingPermissionRequests.agentDraftId, input.agentDraftId),
      ];
      if (input.status) {
        conds.push(eq(agsPendingPermissionRequests.status, input.status));
      }
      // H2-c6: explicit projection (no rawPayload / proposedToolCallJson).
      return db
        .select(PUBLIC_APPROVAL_COLUMNS)
        .from(agsPendingPermissionRequests)
        .where(and(...conds))
        .orderBy(desc(agsPendingPermissionRequests.createdAt))
        .limit(input.limit);
    }),

  getByHash: protectedProcedure
    .input(
      z.object({
        agentDraftId: z.number().int().positive(),
        proposedToolCallHash: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .query(async ({ input }) => {
      const db = asdb();
      // H2-c6: explicit projection (no rawPayload / proposedToolCallJson).
      const rows = await db
        .select(PUBLIC_APPROVAL_COLUMNS)
        .from(agsPendingPermissionRequests)
        .where(
          and(
            eq(agsPendingPermissionRequests.agentDraftId, input.agentDraftId),
            eq(
              agsPendingPermissionRequests.proposedToolCallHash,
              input.proposedToolCallHash,
            ),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    }),

  decide: governedProcedure
    .input(
      z.object({
        approvalRequestId: z.number().int().positive(),
        status: z.enum(["allowed", "denied", "timed_out"]),
        decidedBy: z.number().int().positive().optional(),
        reason: z.string().max(2000).optional(),
        ttlSecondsOverride: z.number().int().positive().max(86_400).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = asdb();

      // C2-c6: per-row authorization. governedProcedure already
      // enforces action-key-level RBAC; this resolves the approval
      // row's owning agent and asserts the caller owns it (or is
      // admin). Without this check, approvalRequestId is sufficient
      // by itself to decide any approval in any draft — a
      // cross-workspace privilege escalation.
      const owner = await resolveApprovalOwner(db, input.approvalRequestId);
      if (!owner) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `approval request ${input.approvalRequestId} not found`,
        });
      }
      const isOwner = owner.ownerId !== null && owner.ownerId === ctx.user.id;
      const isAdmin = ctx.user.role === "admin";
      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "not authorized to decide this approval",
        });
      }

      try {
        return await decideApprovalRequest({
          approvalRequestId: input.approvalRequestId,
          status: input.status,
          decidedBy: input.decidedBy ?? null,
          reason: input.reason ?? null,
          ttlSecondsOverride: input.ttlSecondsOverride ?? null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `approval decide failed: ${msg}`,
        });
      }
    }),
});
