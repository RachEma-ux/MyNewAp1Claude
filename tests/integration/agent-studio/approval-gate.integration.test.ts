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

    it("decide on already-decided row → returns terminal state + emits rejected_already_decided audit row (M5-c4)", async () => {
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
        decidedBy: 999_555,
      });
      expect(decision.ok).toBe(false);
      expect(decision.reason).toBe("already_decided");
      // Status is unchanged (idempotency preserved — row stays "allowed").
      expect(decision.status).toBe("allowed");

      // M5-c4 (cycle-4 audit §M5): pre-cycle-4 the rejected second
      // decide was silent. Now it emits a forensic-audit row so a
      // reader can reconstruct the concurrent-decide attempt.
      const after = await db
        .select()
        .from(agsRuntimePolicyEvents)
        .where(eq(agsRuntimePolicyEvents.runId, RUNTIME_RUN_ID));
      expect(after.length).toBe(beforeCount + 1);

      const rejection = after.find(
        (e) => e.decision === "rejected_already_decided",
      );
      expect(rejection).toBeDefined();
      expect(rejection?.policyKey).toBe("approval_gate");
      const payload = (rejection?.payload ?? {}) as Record<string, unknown>;
      expect(payload.attemptedBy).toBe(999_555);
      expect(payload.attemptedStatus).toBe("denied");
      expect(payload.currentStatus).toBe("allowed");
      expect(payload.approvalRequestId).toBe(requestId);
    });

    // C2-c4 PR-3 (D-RESUME-1, D-RESUME-2) — resume bus end-to-end:
    // a chat-stream-style waiter subscribes via getApprovalEventBus()
    // and resolves when decideApprovalRequest() commits the new state.
    // This integration test exercises the cross-module flow: gate
    // → subscribe → decide → emit → resolve → re-eval → permit.
    it("resume bus: waiter receives decide event + gate re-eval permits (C2-c4 PR-3)", async () => {
      const { getApprovalEventBus, _resetApprovalEventBusForTests } =
        await import(
          "../../../server/agent-studio/services/runtime/approval-event-bus"
        );
      _resetApprovalEventBusForTests();

      const RESUME_RUN_ID = 999_003;
      const RESUME_DRAFT_ID = 999_003;
      const RESUME_TOOL: ProposedToolCall = {
        mcpServerId: "test-srv-c2",
        toolName: "fetch_url",
        arguments: { url: "https://example.com/c2c4" },
        rationale: "operator approval flow",
        evidenceChunkIds: [],
        riskLevel: "high",
        requiresApproval: true,
      };

      const db = getAsDb()!;
      try {
        // 1. Create the pending row.
        const created = await createApprovalRequest({
          runtimeRunId: RESUME_RUN_ID,
          agentDraftId: RESUME_DRAFT_ID,
          proposedToolCall: RESUME_TOOL,
          description: "C2-c4 resume test",
        });
        expect(created.created).toBe(true);

        // 2. Subscribe BEFORE deciding (mirrors chat-stream wait order).
        const waitPromise = getApprovalEventBus().waitFor(
          created.approvalRequestId,
          5000, // 5s — generous for slow CI
        );

        // 3. Decide allowed — emits on the bus AFTER the audit row write.
        const decideResult = await decideApprovalRequest({
          approvalRequestId: created.approvalRequestId,
          status: "allowed",
          decidedBy: 999_103,
          reason: "operator approves",
          ttlSecondsOverride: null,
        });
        expect(decideResult.ok).toBe(true);
        expect(decideResult.status).toBe("allowed");

        // 4. Wait must resolve with the event (not "timeout").
        const event = await waitPromise;
        expect(event).not.toBe("timeout");
        if (event === "timeout") return; // narrow for TS
        expect(event.approvalRequestId).toBe(created.approvalRequestId);
        expect(event.status).toBe("allowed");
        expect(event.expiresAt).toBeInstanceOf(Date);

        // 5. Gate re-eval (chat-stream's confirm step) returns permit.
        const gateAfter = await evaluateApprovalGate({
          agentDraftId: RESUME_DRAFT_ID,
          proposedToolCall: RESUME_TOOL,
        });
        expect(gateAfter.decision).toBe("permit");
      } finally {
        await db
          .delete(agsRuntimePolicyEvents)
          .where(eq(agsRuntimePolicyEvents.runId, RESUME_RUN_ID));
        await db
          .delete(agsPendingPermissionRequests)
          .where(eq(agsPendingPermissionRequests.runtimeRunId, RESUME_RUN_ID));
      }
    });

    // L2-c4 — toolApprovals.{list, listByDraft, getByHash} read queries
    // had zero direct tests. Cycle-4 audit
    // (`/sdcard/Download/APPROVAL_AUDIT_2026-05-09.md` §L2-c4) called
    // these the only operator-facing tRPC surface for discovering
    // pending requests. These 3 tests exercise each query against a
    // seeded fixture via the tRPC caller.
    describe("L2-c4 — toolApprovals read-query coverage", () => {
      const L2_RUN_A = 999_004;
      const L2_RUN_B = 999_005;
      const L2_DRAFT_A = 999_004;
      const L2_DRAFT_B = 999_005;
      const L2_TOOL_A: ProposedToolCall = {
        mcpServerId: "test-srv-l2a",
        toolName: "delete_user",
        arguments: { id: 1 },
        rationale: "L2 test A",
        evidenceChunkIds: [],
        riskLevel: "high",
        requiresApproval: true,
      };
      const L2_TOOL_B: ProposedToolCall = {
        mcpServerId: "test-srv-l2b",
        toolName: "send_email",
        arguments: { to: "x@y.z" },
        rationale: "L2 test B",
        evidenceChunkIds: [],
        riskLevel: "high",
        requiresApproval: true,
      };

      const callerCtx = {
        user: {
          id: 999_104,
          openId: "l2-tester",
          name: "L2 tester",
          role: "admin",
        },
      } as any;

      let createdA = 0;
      let createdB = 0;

      beforeAll(async () => {
        const a = await createApprovalRequest({
          runtimeRunId: L2_RUN_A,
          agentDraftId: L2_DRAFT_A,
          proposedToolCall: L2_TOOL_A,
          description: "L2 row A",
        });
        const b = await createApprovalRequest({
          runtimeRunId: L2_RUN_B,
          agentDraftId: L2_DRAFT_B,
          proposedToolCall: L2_TOOL_B,
          description: "L2 row B",
        });
        createdA = a.approvalRequestId;
        createdB = b.approvalRequestId;
      });

      afterAll(async () => {
        const db = getAsDb();
        if (!db) return;
        await db
          .delete(agsRuntimePolicyEvents)
          .where(eq(agsRuntimePolicyEvents.runId, L2_RUN_A));
        await db
          .delete(agsRuntimePolicyEvents)
          .where(eq(agsRuntimePolicyEvents.runId, L2_RUN_B));
        await db
          .delete(agsPendingPermissionRequests)
          .where(eq(agsPendingPermissionRequests.runtimeRunId, L2_RUN_A));
        await db
          .delete(agsPendingPermissionRequests)
          .where(eq(agsPendingPermissionRequests.runtimeRunId, L2_RUN_B));
      });

      it("toolApprovals.list returns rows for the requested runtimeRunId only", async () => {
        const { toolApprovalsRouter } = await import(
          "../../../server/agent-studio/api/tool-approvals-router"
        );
        const caller = toolApprovalsRouter.createCaller(callerCtx);
        const rows = await caller.list({
          runtimeRunId: L2_RUN_A,
          limit: 50,
        });
        expect(rows.length).toBeGreaterThanOrEqual(1);
        for (const r of rows) {
          expect(r.runtimeRunId).toBe(L2_RUN_A);
        }
        expect(rows.find((r) => r.id === createdA)).toBeDefined();
        // Cross-isolation: row B must not appear.
        expect(rows.find((r) => r.id === createdB)).toBeUndefined();
      });

      it("toolApprovals.listByDraft returns rows for the requested draft only, optionally filtered by status", async () => {
        const { toolApprovalsRouter } = await import(
          "../../../server/agent-studio/api/tool-approvals-router"
        );
        const caller = toolApprovalsRouter.createCaller(callerCtx);
        const all = await caller.listByDraft({
          agentDraftId: L2_DRAFT_A,
          limit: 50,
        });
        expect(all.length).toBeGreaterThanOrEqual(1);
        for (const r of all) {
          expect(r.agentDraftId).toBe(L2_DRAFT_A);
        }
        const pendingOnly = await caller.listByDraft({
          agentDraftId: L2_DRAFT_A,
          status: "pending",
          limit: 50,
        });
        for (const r of pendingOnly) {
          expect(r.status).toBe("pending");
        }
      });

      it("toolApprovals.getByHash returns the row for (agentDraftId, hash) or null", async () => {
        const { toolApprovalsRouter } = await import(
          "../../../server/agent-studio/api/tool-approvals-router"
        );
        const caller = toolApprovalsRouter.createCaller(callerCtx);
        const hash = hashProposedToolCall(L2_TOOL_A);
        const row = await caller.getByHash({
          agentDraftId: L2_DRAFT_A,
          proposedToolCallHash: hash,
        });
        expect(row).not.toBeNull();
        expect(row?.id).toBe(createdA);
        expect(row?.proposedToolCallHash).toBe(hash);

        // Wrong-hash → null (matches the .limit(1) + index lookup contract).
        const noRow = await caller.getByHash({
          agentDraftId: L2_DRAFT_A,
          proposedToolCallHash:
            "0".repeat(64) /* valid-shape but unmapped hash */,
        });
        expect(noRow).toBeNull();
      });
    });
  },
);
