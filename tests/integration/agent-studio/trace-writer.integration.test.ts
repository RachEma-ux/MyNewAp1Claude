/**
 * Follow-up B3 — DB-backed e2e for the runtime trace writers.
 *
 * Exercises the Phase 10 DB-touching paths against a live ASDB:
 *   1. recordToolCallTrace inserts an agsToolCallTraces row whose
 *      every column matches what buildToolCallTraceRow produces.
 *   2. patchRacRuntimeTrace updates plannerMode + plannerReason +
 *      cagCompiledHash on an existing agsRacRuntimeTraces row.
 *   3. Validator-rejected trace nulls the approval/governance/dispatch
 *      fields per the buildToolCallTraceRow invariant.
 *   4. ok+permit trace surfaces approval + dispatch metadata.
 *
 * Behavior + skip semantics match B1/B2 — runs only when ASDB env is
 * configured.
 */

import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getAsDb } from "../../../server/agent-studio/db/connection";
import {
  agsRacRuntimeTraces,
  agsToolCallTraces,
} from "../../../drizzle/tables/agent-studio";
import {
  patchRacRuntimeTrace,
  recordToolCallTrace,
} from "../../../server/agent-studio/services/runtime/trace-writer";
import type { ProposedToolCall } from "../../../server/agent-studio/services/mcp/proposed-tool-call";

const hasDb = (): boolean =>
  Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_ASDB);

describe.skipIf(!hasDb())(
  "B3 — runtime trace writers (live ASDB)",
  () => {
    const WORKSPACE_ID = 999_003;
    const AGENT_ID = 999_003;
    const AGENT_DRAFT_ID = 999_003;
    const RUNTIME_RUN_ID = 999_003;
    const insertedTraceIds: number[] = [];
    const insertedRacTraceIds: number[] = [];

    afterAll(async () => {
      const db = getAsDb();
      if (!db) return;
      if (insertedTraceIds.length > 0) {
        await db
          .delete(agsToolCallTraces)
          .where(inArray(agsToolCallTraces.id, insertedTraceIds));
      }
      if (insertedRacTraceIds.length > 0) {
        await db
          .delete(agsRacRuntimeTraces)
          .where(inArray(agsRacRuntimeTraces.id, insertedRacTraceIds));
      }
    });

    const SAMPLE_CALL: ProposedToolCall = {
      mcpServerId: "test-srv-b3",
      toolName: "search",
      arguments: { q: "x" },
      rationale: "",
      evidenceChunkIds: [],
      riskLevel: "low",
      requiresApproval: false,
    };

    it("recordToolCallTrace — happy path: dispatch ok", async () => {
      const r = await recordToolCallTrace({
        workspaceId: WORKSPACE_ID,
        agentId: AGENT_ID,
        agentDraftId: AGENT_DRAFT_ID,
        runtimeRunId: RUNTIME_RUN_ID,
        runtimeTraceId: null,
        messageId: null,
        proposedToolCall: SAMPLE_CALL,
        proposedToolCallHash: "h".repeat(64),
        validation: {
          ok: true,
          normalized: SAMPLE_CALL,
          liveSchemaHash: "x".repeat(64),
        },
        approvalDecision: null,
        approvalRequestId: null,
        governanceVerdict: "allow",
        dispatchResult: "ok",
        dispatchAuditId: null,
        durationMs: 12,
        errorMessage: null,
      });
      expect(r.id).toBeGreaterThan(0);
      insertedTraceIds.push(r.id);

      const db = getAsDb()!;
      const row = (
        await db
          .select()
          .from(agsToolCallTraces)
          .where(eq(agsToolCallTraces.id, r.id))
          .limit(1)
      )[0];
      expect(row.workspaceId).toBe(WORKSPACE_ID);
      expect(row.validationVerdict).toBe("ok");
      expect(row.dispatchResult).toBe("ok");
      expect(row.governanceVerdict).toBe("allow");
      expect(row.approvalStatus).toBeNull();
      expect(row.durationMs).toBe(12);
    });

    it("recordToolCallTrace — rejection nulls approval/governance/dispatch", async () => {
      const r = await recordToolCallTrace({
        workspaceId: WORKSPACE_ID,
        agentId: AGENT_ID,
        agentDraftId: AGENT_DRAFT_ID,
        runtimeRunId: RUNTIME_RUN_ID,
        runtimeTraceId: null,
        messageId: null,
        proposedToolCall: SAMPLE_CALL,
        proposedToolCallHash: "h".repeat(64),
        validation: {
          ok: false,
          code: "schema_mismatch",
          message: "schema differs",
        },
        approvalDecision: "permit", // caller passed; assembler must drop
        approvalRequestId: 123,
        governanceVerdict: "allow",
        dispatchResult: "ok",
        dispatchAuditId: null,
        durationMs: 1,
        errorMessage: null,
      });
      insertedTraceIds.push(r.id);

      const db = getAsDb()!;
      const row = (
        await db
          .select()
          .from(agsToolCallTraces)
          .where(eq(agsToolCallTraces.id, r.id))
          .limit(1)
      )[0];
      expect(row.validationVerdict).toBe("rejected");
      expect(row.validationCode).toBe("schema_mismatch");
      expect(row.approvalStatus).toBeNull();
      expect(row.approvalRequestId).toBeNull();
      expect(row.governanceVerdict).toBeNull();
      expect(row.dispatchResult).toBeNull();
    });

    it("recordToolCallTrace — ok + permit surfaces approval + dispatch", async () => {
      const HIGH_CALL: ProposedToolCall = {
        ...SAMPLE_CALL,
        riskLevel: "critical",
        requiresApproval: true,
      };
      const r = await recordToolCallTrace({
        workspaceId: WORKSPACE_ID,
        agentId: AGENT_ID,
        agentDraftId: AGENT_DRAFT_ID,
        runtimeRunId: RUNTIME_RUN_ID,
        runtimeTraceId: null,
        messageId: null,
        proposedToolCall: HIGH_CALL,
        proposedToolCallHash: "h".repeat(64),
        validation: {
          ok: true,
          normalized: HIGH_CALL,
          liveSchemaHash: "x".repeat(64),
        },
        approvalDecision: "permit",
        approvalRequestId: 77,
        governanceVerdict: "allow",
        dispatchResult: "ok",
        dispatchAuditId: null,
        durationMs: 100,
        errorMessage: null,
      });
      insertedTraceIds.push(r.id);

      const db = getAsDb()!;
      const row = (
        await db
          .select()
          .from(agsToolCallTraces)
          .where(eq(agsToolCallTraces.id, r.id))
          .limit(1)
      )[0];
      expect(row.approvalStatus).toBe("allowed");
      expect(row.approvalRequestId).toBe(77);
      expect(row.dispatchResult).toBe("ok");
    });

    it("patchRacRuntimeTrace — sets plannerMode + plannerReason + cagCompiledHash", async () => {
      const db = getAsDb()!;
      // Seed a runtime trace row to patch.
      const [trace] = await db
        .insert(agsRacRuntimeTraces)
        .values({
          workspaceId: WORKSPACE_ID,
          agentId: AGENT_ID,
          agentDraftId: AGENT_DRAFT_ID,
          actorId: AGENT_DRAFT_ID,
          mode: "safe_degraded",
          retrievalEnabled: false,
        })
        .returning({ id: agsRacRuntimeTraces.id });
      insertedRacTraceIds.push(trace.id);

      await patchRacRuntimeTrace(trace.id, {
        plannerMode: "hybrid_cag_rag",
        plannerReason: "CAG pack + KB/RAG sources",
        cagCompiledHash: "f".repeat(64),
      });

      const after = (
        await db
          .select()
          .from(agsRacRuntimeTraces)
          .where(eq(agsRacRuntimeTraces.id, trace.id))
          .limit(1)
      )[0];
      expect(after.plannerMode).toBe("hybrid_cag_rag");
      expect(after.plannerReason).toBe("CAG pack + KB/RAG sources");
      expect(after.cagCompiledHash).toMatch(/^f{64}$/);
    });
  },
);
