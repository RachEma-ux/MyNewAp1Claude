/**
 * Follow-up B2 — DB-backed e2e for the approval gate.
 *
 * Exercises the full Phase 9 lifecycle against a live ASDB:
 *   1. createApprovalRequest inserts a pending row keyed on
 *      (agentDraftId, proposedToolCallHash) — and is idempotent on
 *      re-call with the same canonical envelope.
 *   2. evaluateApprovalGate returns "pending" while the row is
 *      unactioned.
 *   3. decideApprovalRequest({status:"allowed"}) flips status, sets
 *      expiresAt = decidedAt + ttl, writes a state-transition row to
 *      agsRuntimePolicyEvents (D-APP-EXT-6).
 *   4. evaluateApprovalGate returns "permit" + bumps lastUsedAt.
 *   5. Forcing expiresAt into the past flips the gate to "expired".
 *   6. A denied row stays denied across re-evaluations.
 *
 * Behavior + skip semantics match B1 — runs only when ASDB env is
 * configured.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, lt } from "drizzle-orm";
import { getAsDb } from "../../../server/agent-studio/db/connection";
import {
  agsPendingPermissionRequests,
  agsRuntimePolicyEvents,
} from "../../../drizzle/tables/agent-studio";
import {
  createApprovalRequest,
  decideApprovalRequest,
  evaluateApprovalGate,
} from "../../../server/agent-studio/services/approval/approval-gate";
import type { ProposedToolCall } from "../../../server/agent-studio/services/mcp/proposed-tool-call";
import { hashProposedToolCall } from "../../../server/agent-studio/services/mcp/proposed-tool-call";

const hasDb = (): boolean =>
  Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_ASDB);

describe.skipIf(!hasDb())(
  "B2 — approval gate state machine round-trip (live ASDB)",
  () => {
    const RUNTIME_RUN_ID = 999_002;
    const AGENT_DRAFT_ID = 999_002;

    const SAMPLE: ProposedToolCall = {
      mcpServerId: "test-srv-b2",
      toolName: "drop_table",
      arguments: { name: "users" },
      rationale: "operator requested cleanup",
      evidenceChunkIds: [],
      riskLevel: "critical",
      requiresApproval: true,
    };
    const SAMPLE_HASH = hashProposedToolCall(SAMPLE);

    afterAll(async () => {
      const db = getAsDb();
      if (!db) return;
      await db
        .delete(agsRuntimePolicyEvents)
        .where(eq(agsRuntimePolicyEvents.runId, RUNTIME_RUN_ID));
      await db
        .delete(agsPendingPermissionRequests)
        .where(eq(agsPendingPermissionRequests.runtimeRunId, RUNTIME_RUN_ID));
    });

    it("create + idempotency on (agentDraftId, hash)", async () => {
      const r1 = await createApprovalRequest({
        runtimeRunId: RUNTIME_RUN_ID,
        agentDraftId: AGENT_DRAFT_ID,
        proposedToolCall: SAMPLE,
        description: "drop users table",
      });
      expect(r1.created).toBe(true);
      expect(r1.approvalRequestId).toBeGreaterThan(0);

      const r2 = await createApprovalRequest({
        runtimeRunId: RUNTIME_RUN_ID,
        agentDraftId: AGENT_DRAFT_ID,
        proposedToolCall: SAMPLE,
      });
      expect(r2.created).toBe(false);
      expect(r2.approvalRequestId).toBe(r1.approvalRequestId);

      const db = getAsDb()!;
      const events = await db
        .select()
        .from(agsRuntimePolicyEvents)
        .where(eq(agsRuntimePolicyEvents.runId, RUNTIME_RUN_ID));
      // Only one transition event for the original create, not the duplicate.
      expect(events.length).toBe(1);
      expect(events[0].decision).toBe("pending");
      expect(events[0].policyKey).toBe("approval_gate");
    });

    it("evaluateApprovalGate returns 'pending' while unactioned", async () => {
      const r = await evaluateApprovalGate({
        agentDraftId: AGENT_DRAFT_ID,
        proposedToolCall: SAMPLE,
      });
      expect(r.decision).toBe("pending");
      expect(r.proposedToolCallHash).toBe(SAMPLE_HASH);
    });

    it("decide allowed → expiresAt set, audit row written, gate now permits", async () => {
      const db = getAsDb()!;
      const existing = await db
        .select()
        .from(agsPendingPermissionRequests)
        .where(
          and(
            eq(agsPendingPermissionRequests.runtimeRunId, RUNTIME_RUN_ID),
            eq(agsPendingPermissionRequests.proposedToolCallHash, SAMPLE_HASH),
          ),
        )
        .limit(1);
      const requestId = existing[0].id;

      const decision = await decideApprovalRequest({
        approvalRequestId: requestId,
        status: "allowed",
        decidedBy: 999,
        reason: "operator approved",
        ttlSecondsOverride: 600,
      });
      expect(decision.ok).toBe(true);
      expect(decision.status).toBe("allowed");
      expect(decision.expiresAt).not.toBeNull();
      expect(decision.expiresAt!.getTime()).toBeGreaterThan(Date.now());

      // Audit row written for the transition.
      const events = await db
        .select()
        .from(agsRuntimePolicyEvents)
        .where(eq(agsRuntimePolicyEvents.runId, RUNTIME_RUN_ID));
      expect(events.length).toBe(2); // create + decide
      const allowed = events.find((e) => e.decision === "allowed");
      expect(allowed).toBeDefined();

      // Gate now permits.
      const gate = await evaluateApprovalGate({
        agentDraftId: AGENT_DRAFT_ID,
        proposedToolCall: SAMPLE,
      });
      expect(gate.decision).toBe("permit");
      expect(gate.approvalRequestId).toBe(requestId);

      // lastUsedAt was bumped.
      const refreshed = await db
        .select()
        .from(agsPendingPermissionRequests)
        .where(eq(agsPendingPermissionRequests.id, requestId))
        .limit(1);
      expect(refreshed[0].lastUsedAt).not.toBeNull();
    });

    it("expired path: forcing expiresAt into the past flips gate to expired", async () => {
      const db = getAsDb()!;
      // Force expiry into the past for this test (real flow waits for TTL).
      const existing = await db
        .select()
        .from(agsPendingPermissionRequests)
        .where(
          and(
            eq(agsPendingPermissionRequests.runtimeRunId, RUNTIME_RUN_ID),
            eq(agsPendingPermissionRequests.proposedToolCallHash, SAMPLE_HASH),
          ),
        )
        .limit(1);
      await db
        .update(agsPendingPermissionRequests)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(agsPendingPermissionRequests.id, existing[0].id));

      const gate = await evaluateApprovalGate({
        agentDraftId: AGENT_DRAFT_ID,
        proposedToolCall: SAMPLE,
      });
      expect(gate.decision).toBe("expired");
      expect(gate.reason).toBe("approval_expired");
    });

    it("denied path stays denied across re-evaluations", async () => {
      // Different proposed call (different rationale → different hash).
      const denyCall: ProposedToolCall = {
        ...SAMPLE,
        rationale: "denial test rationale",
      };
      const created = await createApprovalRequest({
        runtimeRunId: RUNTIME_RUN_ID,
        agentDraftId: AGENT_DRAFT_ID,
        proposedToolCall: denyCall,
      });
      const decision = await decideApprovalRequest({
        approvalRequestId: created.approvalRequestId,
        status: "denied",
        reason: "operator denied",
      });
      expect(decision.ok).toBe(true);
      expect(decision.expiresAt).toBeNull();

      const gate1 = await evaluateApprovalGate({
        agentDraftId: AGENT_DRAFT_ID,
        proposedToolCall: denyCall,
      });
      expect(gate1.decision).toBe("denied");

      const gate2 = await evaluateApprovalGate({
        agentDraftId: AGENT_DRAFT_ID,
        proposedToolCall: denyCall,
      });
      expect(gate2.decision).toBe("denied");
    });

    it("decide on already-decided row → returns terminal state, no second audit row", async () => {
      const db = getAsDb()!;
      // Pick the already-allowed row from earlier.
      const existing = await db
        .select()
        .from(agsPendingPermissionRequests)
        .where(
          and(
            eq(agsPendingPermissionRequests.runtimeRunId, RUNTIME_RUN_ID),
            eq(agsPendingPermissionRequests.status, "allowed"),
          ),
        )
        .limit(1);
      const requestId = existing[0].id;

      const before = await db
        .select()
        .from(agsRuntimePolicyEvents)
        .where(eq(agsRuntimePolicyEvents.runId, RUNTIME_RUN_ID));
      const beforeCount = before.length;

      const decision = await decideApprovalRequest({
        approvalRequestId: requestId,
        status: "denied",
      });
      expect(decision.ok).toBe(false);
      expect(decision.reason).toBe("already_decided");

      const after = await db
        .select()
        .from(agsRuntimePolicyEvents)
        .where(eq(agsRuntimePolicyEvents.runId, RUNTIME_RUN_ID));
      expect(after.length).toBe(beforeCount);
    });
  },
);
