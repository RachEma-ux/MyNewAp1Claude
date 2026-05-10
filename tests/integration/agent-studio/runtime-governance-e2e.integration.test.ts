/**
 * Phase 4 (Roadmap V3) — Runtime Governance E2E.
 *
 * Closes Definition-of-Done Gate 3. Exercises the full integrated
 * tool-call governance loop against a live ASDB:
 *
 *   validateRuntimeToolCall → gateRuntimeDispatch → dispatchMcpToolCall
 *      → agsRuntimePolicyEvents (audit row)
 *      → agsToolCallTraces (trace row)
 *      → agsPendingPermissionRequests (approval row, when applicable)
 *
 * The unit tests under `services/mcp/__tests__/dispatcher.test.ts`
 * cover each component in isolation with mocks for `repo.*` and
 * `evaluateMcpPreInvoke`. The integration tests under
 * `tests/integration/agent-studio/{approval-gate,trace-writer}` cover
 * the gate / trace persistence in isolation. **What was missing
 * before Phase 4** is proof that the full chain — wired together
 * the way `chat-stream.ts` / `chat.ts` wire it — produces the
 * correct DB state for every governance outcome.
 *
 * Four canonical paths:
 *
 *   Path A — read-only happy path
 *     - validator permits, gate permits (no approval), dispatcher
 *       invokes the (mocked) transport
 *     - audit row decision=allow + trace row dispatchResult=ok
 *
 *   Path B — validator rejection
 *     - model emits an invalid envelope (missing required arg)
 *     - validator returns ok=false; gate short-circuits to !ok
 *     - dispatcher NOT called; trace row dispatchResult=blocked +
 *       validation_verdict=rejected; NO audit row (no dispatch
 *       attempt)
 *
 *   Path C — approval-required lifecycle
 *     - tool with riskClass that requires approval
 *     - first call: gate creates pending row + returns !ok
 *     - decideApprovalRequest("allowed") flips status
 *     - second call: gate returns permit + dispatcher invokes
 *
 *   Path D — dispatcher failure
 *     - validator + gate permit; transport throws
 *     - dispatcher returns ok=false with `tool_execution_failed`
 *     - audit row decision=allow but error fields set; trace row
 *       dispatchResult=error
 *
 * Mocks: only the MCP transport (`getMcpConnection`) is mocked so
 * the test doesn't need a real MCP server. Every other component
 * (validator, gate, dispatcher, repo, governance) runs unmodified.
 *
 * Skip semantics: matches `approval-gate.integration.test.ts` and
 * `trace-writer.integration.test.ts` — runs only when ASDB is
 * configured. Local Termux dev + GitHub Actions both set
 * `DATABASE_URL` so the test runs in both.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getAsDb } from "../../../server/agent-studio/db/connection";
import {
  agsAgents,
  agsAgentDrafts,
  agsDraftMcpServers,
  agsDraftPermissionRules,
  agsPendingPermissionRequests,
  agsRuntimePolicyEvents,
  agsRuntimeRuns,
  agsToolCallTraces,
} from "../../../drizzle/tables/agent-studio";
import { publishSnapshot } from "../../../server/agent-studio/services/mcp/registry";
import { decideApprovalRequest } from "../../../server/agent-studio/services/approval/approval-gate";
import {
  validateRuntimeToolCall,
  gateRuntimeDispatch,
  persistRuntimeToolCallTrace,
} from "../../../server/agent-studio/services/runtime/proposed-tool-call-runtime";
import type { McpTool } from "../../../server/agent-studio/services/mcp/types";

// ── MCP transport mock ──────────────────────────────────────────────────────
//
// The dispatcher reads `getMcpConnection(serverId)` to get the live
// transport handle. We mock just this one boundary so the dispatcher
// runs unmodified but `conn.callTool(...)` returns whatever the test
// configures. Every other dispatcher dependency (repo, governance,
// trace writer) hits the real DB / real impl.

vi.mock("../../../server/agent-studio/services/mcp/mcp-manager", async () => {
  const actual = await vi.importActual<
    typeof import("../../../server/agent-studio/services/mcp/mcp-manager")
  >("../../../server/agent-studio/services/mcp/mcp-manager");
  return {
    ...actual,
    getMcpConnection: vi.fn(),
  };
});

import { getMcpConnection } from "../../../server/agent-studio/services/mcp/mcp-manager";
import { dispatchMcpToolCall } from "../../../server/agent-studio/services/mcp/dispatcher";

const hasDb = (): boolean =>
  Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_ASDB);

// ── Fixtures ────────────────────────────────────────────────────────────────

const RUN_ID = 999_004;
const WORKSPACE_ID = 999_004;

// `read_search` — read-only, no approval. Used by Path A + B + D.
const READ_TOOL: McpTool & { riskClass: "read_only" } = {
  name: "read_search",
  description: "search documentation",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  },
  riskClass: "read_only",
};

// `write_drop_table` — destructive, requires approval. Used by Path C.
const WRITE_TOOL: McpTool & { riskClass: "destructive" } = {
  name: "write_drop_table",
  description: "drop a table",
  inputSchema: {
    type: "object",
    properties: { table: { type: "string" } },
    required: ["table"],
    additionalProperties: false,
  },
  riskClass: "destructive",
};

// Mutable fixture ids — populated by beforeAll.
let agentId = -1;
let draftId = -1;
let serverId = -1;

describe.skipIf(!hasDb())("Phase 4 — runtime governance E2E (live ASDB)", () => {
  beforeAll(async () => {
    const db = getAsDb();
    if (!db) return;

    // Seed agent → draft → mcp_server → permission_rule rows. We use
    // high-numbered ids and clean up in afterAll so a parallel run
    // doesn't collide.
    const [agent] = await db
      .insert(agsAgents)
      .values({
        name: "phase4-e2e-agent",
        internalKey: `phase4-e2e-${RUN_ID}`,
        ownerId: 0,
        lifecycleState: "draft",
      })
      .returning();
    agentId = agent.id;

    const [draft] = await db
      .insert(agsAgentDrafts)
      .values({
        agentId,
        name: "phase4-e2e-draft",
        systemInstructions: "test",
      })
      .returning();
    draftId = draft.id;

    const [server] = await db
      .insert(agsDraftMcpServers)
      .values({
        draftId,
        name: "e2e-srv",
        transport: "stdio",
        config: {},
        enabled: true,
      })
      .returning();
    serverId = server.id;

    // Allow rule covers both tools. Path C's approval requirement is
    // driven by riskClass, NOT by the rule (which says "allow") — the
    // approval gate fires AFTER allowedTools.
    await db.insert(agsDraftPermissionRules).values([
      {
        draftId,
        toolPattern: `mcp__e2e-srv__*`,
        ruleBehavior: "allow",
        enabled: true,
      },
    ]);

    // Register the tools in the runtime registry so the dispatcher's
    // findToolForServer lookup resolves.
    publishSnapshot({
      serverId,
      tools: [READ_TOOL, WRITE_TOOL] as unknown as McpTool[],
      prompts: [],
      resources: [],
    });
  });

  afterAll(async () => {
    const db = getAsDb();
    if (!db) return;
    // Cascade-delete fixture rows. Order matters: traces / approvals /
    // policy events first, then drafts/mcp/rules, then agent.
    if (draftId > 0) {
      await db
        .delete(agsToolCallTraces)
        .where(eq(agsToolCallTraces.agentDraftId, draftId));
      await db
        .delete(agsPendingPermissionRequests)
        .where(eq(agsPendingPermissionRequests.agentDraftId, draftId));
      await db
        .delete(agsRuntimePolicyEvents)
        .where(eq(agsRuntimePolicyEvents.runId, RUN_ID));
      await db
        .delete(agsRuntimeRuns)
        .where(eq(agsRuntimeRuns.id, RUN_ID))
        .catch(() => {});
      await db
        .delete(agsDraftPermissionRules)
        .where(eq(agsDraftPermissionRules.draftId, draftId));
      await db
        .delete(agsDraftMcpServers)
        .where(eq(agsDraftMcpServers.draftId, draftId));
      await db
        .delete(agsAgentDrafts)
        .where(eq(agsAgentDrafts.id, draftId));
    }
    if (agentId > 0) {
      await db.delete(agsAgents).where(eq(agsAgents.id, agentId));
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Default conn returns a successful tool result. Individual tests
    // override the mock for their specific path.
    (getMcpConnection as any).mockReturnValue({
      serverId,
      transport: "stdio",
      tools: [READ_TOOL, WRITE_TOOL],
      prompts: [],
      resources: [],
      close: vi.fn().mockResolvedValue(undefined),
      callTool: vi
        .fn()
        .mockResolvedValue({ ok: true, content: [{ type: "text", text: "ok" }] }),
    });
    // Clean state between tests so the approval-row idempotency check
    // in Path C doesn't see leftovers from previous runs.
    const db = getAsDb()!;
    await db
      .delete(agsToolCallTraces)
      .where(eq(agsToolCallTraces.agentDraftId, draftId));
    await db
      .delete(agsPendingPermissionRequests)
      .where(eq(agsPendingPermissionRequests.agentDraftId, draftId));
    await db
      .delete(agsRuntimePolicyEvents)
      .where(eq(agsRuntimePolicyEvents.runId, RUN_ID));
  });

  // ── Path A ────────────────────────────────────────────────────────────────
  describe("Path A — read-only happy path", () => {
    it("validator permits → gate permits → dispatcher succeeds → audit + trace persisted", async () => {
      const validation = await validateRuntimeToolCall({
        mcpServerId: "e2e-srv",
        toolName: "read_search",
        liveTool: READ_TOOL,
        arguments: { query: "hello" },
      });
      expect(validation.ok).toBe(true);

      const verdict = await gateRuntimeDispatch({
        validation,
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        description: "Path A",
      });
      expect(verdict.ok).toBe(true);
      expect(verdict.approvalRequestId).toBeNull();

      const result = await dispatchMcpToolCall({
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        toolName: "mcp__e2e-srv__read_search",
        args: { query: "hello" },
        source: "live_runtime",
      });
      expect(result.ok).toBe(true);

      await persistRuntimeToolCallTrace({
        workspaceId: WORKSPACE_ID,
        agentId,
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        runtimeTraceId: null,
        messageId: null,
        verdict,
        validation,
        dispatchResult: { ok: true, durationMs: result.durationMs },
        governanceVerdict: result.governanceVerdict ?? null,
      });

      // Audit row: dispatcher writes it via writeAuditRow.
      const db = getAsDb()!;
      const auditRows = await db
        .select()
        .from(agsRuntimePolicyEvents)
        .where(
          and(
            eq(agsRuntimePolicyEvents.runId, RUN_ID),
            eq(agsRuntimePolicyEvents.policyKey, "mcp_dispatch"),
          ),
        );
      expect(auditRows.length).toBe(1);
      expect(auditRows[0].decision).toBe("allow");

      const traceRows = await db
        .select()
        .from(agsToolCallTraces)
        .where(eq(agsToolCallTraces.agentDraftId, draftId));
      expect(traceRows.length).toBe(1);
      expect(traceRows[0].dispatchResult).toBe("ok");
      expect(traceRows[0].validationVerdict).toBe("ok");
    });
  });

  // ── Path B ────────────────────────────────────────────────────────────────
  describe("Path B — validator rejection", () => {
    it("missing required arg → validator rejects → no dispatch → trace row blocked, no audit row", async () => {
      const validation = await validateRuntimeToolCall({
        mcpServerId: "e2e-srv",
        toolName: "read_search",
        liveTool: READ_TOOL,
        arguments: {}, // missing required `query`
      });
      expect(validation.ok).toBe(false);
      expect(validation.code).toBe("missing_parameter");

      const verdict = await gateRuntimeDispatch({
        validation,
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        description: "Path B",
      });
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toBe("validator_rejected");

      // Per the chat-stream pattern: persist trace on rejection AND
      // skip dispatch.
      await persistRuntimeToolCallTrace({
        workspaceId: WORKSPACE_ID,
        agentId,
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        runtimeTraceId: null,
        messageId: null,
        verdict,
        validation,
        dispatchResult: null,
        governanceVerdict: null,
      });
      expect(getMcpConnection).not.toHaveBeenCalled();

      const db = getAsDb()!;
      const auditRows = await db
        .select()
        .from(agsRuntimePolicyEvents)
        .where(
          and(
            eq(agsRuntimePolicyEvents.runId, RUN_ID),
            eq(agsRuntimePolicyEvents.policyKey, "mcp_dispatch"),
          ),
        );
      // No audit row — dispatch never attempted.
      expect(auditRows.length).toBe(0);

      const traceRows = await db
        .select()
        .from(agsToolCallTraces)
        .where(eq(agsToolCallTraces.agentDraftId, draftId));
      expect(traceRows.length).toBe(1);
      expect(traceRows[0].dispatchResult).toBe("blocked");
      expect(traceRows[0].validationVerdict).toBe("rejected");
    });
  });

  // ── Path C ────────────────────────────────────────────────────────────────
  describe("Path C — approval-required lifecycle", () => {
    it("first call creates pending → decision allowed → second call permits + dispatches", async () => {
      const validation = await validateRuntimeToolCall({
        mcpServerId: "e2e-srv",
        toolName: "write_drop_table",
        liveTool: WRITE_TOOL,
        arguments: { table: "users" },
      });
      expect(validation.ok).toBe(true);
      expect(validation.call.requiresApproval).toBe(true);

      // First evaluation creates the pending row.
      const verdict1 = await gateRuntimeDispatch({
        validation,
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        description: "Path C — first eval",
      });
      expect(verdict1.ok).toBe(false);
      expect(["approval_required", "approval_pending"]).toContain(
        verdict1.reason,
      );
      expect(verdict1.approvalRequestId).toBeGreaterThan(0);

      const db = getAsDb()!;
      const pending = await db
        .select()
        .from(agsPendingPermissionRequests)
        .where(eq(agsPendingPermissionRequests.id, verdict1.approvalRequestId!));
      expect(pending.length).toBe(1);
      expect(pending[0].status).toBe("pending");

      // Operator approves.
      await decideApprovalRequest({
        approvalRequestId: verdict1.approvalRequestId!,
        decidedBy: 0,
        decision: "allowed",
      });

      // Second evaluation permits.
      const verdict2 = await gateRuntimeDispatch({
        validation,
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        description: "Path C — second eval",
      });
      expect(verdict2.ok).toBe(true);
      expect(verdict2.approvalRequestId).toBe(verdict1.approvalRequestId);

      // Dispatch through the dispatcher with the approval id forwarded.
      const result = await dispatchMcpToolCall({
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        toolName: "mcp__e2e-srv__write_drop_table",
        args: { table: "users" },
        source: "live_runtime",
        approvalRequestId: verdict2.approvalRequestId ?? undefined,
      });
      expect(result.ok).toBe(true);

      await persistRuntimeToolCallTrace({
        workspaceId: WORKSPACE_ID,
        agentId,
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        runtimeTraceId: null,
        messageId: null,
        verdict: verdict2,
        validation,
        dispatchResult: { ok: true, durationMs: result.durationMs },
        governanceVerdict: result.governanceVerdict ?? null,
      });

      const traceRows = await db
        .select()
        .from(agsToolCallTraces)
        .where(eq(agsToolCallTraces.agentDraftId, draftId));
      expect(traceRows.length).toBe(1);
      expect(traceRows[0].dispatchResult).toBe("ok");
      expect(traceRows[0].approvalStatus).toBe("permit");
      expect(traceRows[0].approvalRequestId).toBe(verdict2.approvalRequestId);

      const auditRows = await db
        .select()
        .from(agsRuntimePolicyEvents)
        .where(eq(agsRuntimePolicyEvents.runId, RUN_ID));
      // approval_gate transition rows + the mcp_dispatch row. Confirm
      // both keys exist.
      const policyKeys = new Set(auditRows.map((r) => r.policyKey));
      expect(policyKeys.has("approval_gate")).toBe(true);
      expect(policyKeys.has("mcp_dispatch")).toBe(true);
    });

    it("denied decision blocks subsequent dispatch (gate returns !ok)", async () => {
      const validation = await validateRuntimeToolCall({
        mcpServerId: "e2e-srv",
        toolName: "write_drop_table",
        liveTool: WRITE_TOOL,
        arguments: { table: "logs" },
      });
      const verdict1 = await gateRuntimeDispatch({
        validation,
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        description: "Path C — denied",
      });
      expect(verdict1.approvalRequestId).toBeGreaterThan(0);

      await decideApprovalRequest({
        approvalRequestId: verdict1.approvalRequestId!,
        decidedBy: 0,
        decision: "denied",
        denyReason: "operator denied",
      });

      const verdict2 = await gateRuntimeDispatch({
        validation,
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        description: "Path C — denied re-eval",
      });
      expect(verdict2.ok).toBe(false);
      expect(verdict2.reason).toBe("approval_denied");
    });
  });

  // ── Path D ────────────────────────────────────────────────────────────────
  describe("Path D — dispatcher failure", () => {
    it("transport throws → dispatch returns ok=false → trace row error + audit row deny", async () => {
      // Override conn.callTool to throw so the dispatcher's failure
      // mapping kicks in.
      (getMcpConnection as any).mockReturnValue({
        serverId,
        transport: "stdio",
        tools: [READ_TOOL],
        prompts: [],
        resources: [],
        close: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockRejectedValue(new Error("transport boom")),
      });

      const validation = await validateRuntimeToolCall({
        mcpServerId: "e2e-srv",
        toolName: "read_search",
        liveTool: READ_TOOL,
        arguments: { query: "x" },
      });
      const verdict = await gateRuntimeDispatch({
        validation,
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        description: "Path D",
      });
      expect(verdict.ok).toBe(true);

      const result = await dispatchMcpToolCall({
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        toolName: "mcp__e2e-srv__read_search",
        args: { query: "x" },
        source: "live_runtime",
      });
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("tool_execution_failed");

      await persistRuntimeToolCallTrace({
        workspaceId: WORKSPACE_ID,
        agentId,
        agentDraftId: draftId,
        runtimeRunId: RUN_ID,
        runtimeTraceId: null,
        messageId: null,
        verdict,
        validation,
        dispatchResult: {
          ok: false,
          error: { message: result.error?.message },
          durationMs: result.durationMs,
        },
        governanceVerdict: result.governanceVerdict ?? null,
      });

      const db = getAsDb()!;
      const traceRows = await db
        .select()
        .from(agsToolCallTraces)
        .where(eq(agsToolCallTraces.agentDraftId, draftId));
      expect(traceRows.length).toBe(1);
      expect(traceRows[0].dispatchResult).toBe("error");

      const auditRows = await db
        .select()
        .from(agsRuntimePolicyEvents)
        .where(
          and(
            eq(agsRuntimePolicyEvents.runId, RUN_ID),
            eq(agsRuntimePolicyEvents.policyKey, "mcp_dispatch"),
          ),
        );
      // Audit row IS written even on dispatch failure — the dispatcher
      // captures the error in the audit payload.
      expect(auditRows.length).toBe(1);
      const payload = auditRows[0].payload as { errorCode?: string };
      expect(payload.errorCode).toBe("tool_execution_failed");
    });
  });
});
