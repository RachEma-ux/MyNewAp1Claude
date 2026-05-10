/**
 * AI Agent Studio — Simulation Service
 *
 * Foundation for dry-run behavior analysis. Simulation is NOT testing —
 * it shows how the agent would interpret a request, what plan it would
 * create, what tools it would call, and what governance gates would fire.
 *
 * Phase 3 implementation: deterministic, mocked simulation that produces
 * a structured execution timeline. The interface is stable; advanced
 * behavior (real LLM, real tool calls) can replace the body without
 * breaking the contract.
 *
 * Toggles supported:
 * - mockedTools (default true): all tool calls are simulated
 * - sandboxMemory (default true): memory ops do not touch real stores
 * - strictPolicy (default true): policy violations block simulation steps
 * - fullOrchestration (default false): include downstream agents
 * - stepByStep (default false): pause-able execution
 */

import * as repo from "../repository";
import { evaluateGovernance } from "./governance-adapter";
// Phase 5c (Roadmap V3) — simulation lane now mirrors chat-stream's
// validate → gate → dispatch chain. Closes H1 from the Phase 1a/1c
// audit (simulation previously dispatched without ProposedToolCall
// validator or approval gate). Imports kept colocated with the
// existing `mcpManager` / `dispatchMcpToolCall` block so a future
// reader sees the four runtime-governance entry points together.
import {
  validateRuntimeToolCall,
  gateRuntimeDispatch,
  persistRuntimeToolCallTrace,
} from "./runtime/proposed-tool-call-runtime";
import { buildRuntimeContext } from "./runtime/runtime-context";
import { getSnapshot } from "./mcp/registry";
// H1-c6 (cycle-6 audit closure §H1-c6): system-driven timeout flip
// migrated from `repo.decidePendingPermissionRequest` to
// `decideApprovalRequest` so the audit ledger records the system's
// timed_out transition. Pre-cycle-6 the flip was silent.
import { decideApprovalRequest } from "./approval/approval-gate";
import { fireHooksForEvent } from "./hook-runner";
import * as mcpManager from "./mcp/mcp-manager";
import { dispatchMcpToolCall } from "./mcp/dispatcher";
import { getToolCatalogEntry } from "../adapters/tool-catalog-adapter";
import { previewRetrieval } from "../adapters/knowledge-adapter";
// Phase 29.0a: simulation now resolves the agent's binding via
// `resolveForRun` and routes live runs through Model Access:
//   - `runViaOpenllmBridge` (direct-import) for runs that need the
//     openllm-agent2 WebSocket protocol (MCP servers + permission flow)
//   - `openRouter.modelAccess.execute` (gateway-call) for everything
//     else — lighter HTTP path
// Plan v3 D1 boundary preserved: simulation never touches process.env
// for credentials. Model Access resolves them internally via
// `withProviderCredential`. Phase 28.6b shipped the bridge primitive;
// Phase 28.4 shipped the embed primitive (not consumed here).
import { resolveForRun } from "../bindings";
import { gatewayCall } from "../../platform/modules/module-gateway";
import {
  runViaOpenllmBridge,
  type BridgePermissionDecision as PermissionDecision,
  type BridgePermissionResolver as PermissionResolver,
  type BridgeMcpServerConfig as McpServerConfigForBridge,
  type ModelAccessResult,
} from "../../openrouter/model-access";

/**
 * Phase 1c: Match a tool name against a permission-rule tool pattern.
 *
 * Mirrors openllm-agent2's matcher semantics:
 *  - exact match: "Bash" matches "Bash"
 *  - parens form: "Bash(*)" matches "Bash" with any args
 *  - wildcard:    "Web*" matches "WebFetch", "WebSearch"
 *  - "*" matches anything
 *
 * Case-sensitive — openllm tool names are PascalCase by convention.
 */
/**
 * Phase 5c (Roadmap V3) — strict 3-component parser for the runtime
 * dispatch-key shape `mcp__SERVER__TOOL`. Mirrors registry.ts's
 * `findToolByGlobalNameAsync` parser so lane-vs-registry behavior
 * stays in lockstep. SERVER may not contain `__`; tool names CAN
 * contain `__` (some MCP servers do this). Returns null on any
 * malformed input.
 */
function parseMcpDispatchKey(
  key: string,
): { serverName: string; remoteToolName: string } | null {
  if (typeof key !== "string" || !key.startsWith("mcp__")) return null;
  const rest = key.slice("mcp__".length);
  const sep = rest.indexOf("__");
  if (sep <= 0) return null;
  const remoteToolName = rest.slice(sep + 2);
  if (remoteToolName.length === 0) return null;
  return { serverName: rest.slice(0, sep), remoteToolName };
}

function matchesToolPattern(toolName: string, pattern: string): boolean {
  if (!toolName || !pattern) return false;
  if (pattern === "*") return true;
  if (pattern === toolName) return true;
  // Strip the (*) suffix — openllm treats "Bash(*)" as "Bash with any args"
  const noParen = pattern.replace(/\s*\(\*\)\s*$/, "");
  if (noParen === toolName) return true;
  if (pattern.includes("*")) {
    // Convert glob to regex (escape regex specials except *)
    const regexBody = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    const re = new RegExp(`^${regexBody}$`);
    if (re.test(toolName)) return true;
  }
  return false;
}

/**
 * Phase 1c: Build a permission resolver from a draft's permission rules.
 *
 * Semantics: first-match-wins firewall.
 *  - rule.ruleBehavior "allow" → resolver returns "allow"
 *  - rule.ruleBehavior "deny"  → resolver returns "deny"
 *  - rule.ruleBehavior "ask"   → resolver returns "needs_human"
 *  - no match                  → resolver returns "deny" (safe default)
 *
 * Disabled rules are skipped. Order is by toolPattern ASC (the order
 * `listPermissionRules` returns them in).
 */
function buildPermissionResolver(
  rules: Array<{
    toolPattern: string;
    ruleBehavior: string;
    enabled: boolean | null;
  }>
): (request: Parameters<PermissionResolver>[0]) => PermissionDecision {
  const enabled = rules.filter((r) => r.enabled !== false);
  return (request) => {
    const toolName = request.toolName ?? request.toolKey ?? "";
    for (const rule of enabled) {
      if (matchesToolPattern(toolName, rule.toolPattern)) {
        if (rule.ruleBehavior === "allow") return "allow" as PermissionDecision;
        if (rule.ruleBehavior === "ask") return "needs_human" as PermissionDecision;
        return "deny" as PermissionDecision;
      }
    }
    return "deny" as PermissionDecision;
  };
}

export interface SimulationToggles {
  mockedTools: boolean;
  sandboxMemory: boolean;
  strictPolicy: boolean;
  fullOrchestration: boolean;
  stepByStep: boolean;
}

export interface SimulationStep {
  index: number;
  type: "interpret" | "plan" | "tool_call" | "memory_op" | "policy_check" | "handoff" | "output";
  label: string;
  payload: Record<string, unknown>;
  verdict: "pass" | "warning" | "blocked";
  durationMs: number;
}

export interface SimulationResult {
  runId: number;
  status: "completed" | "failed" | "blocked";
  verdict: "pass" | "warning" | "blocked";
  summary: string;
  riskScore: number;
  costEstimate: number;
  durationMs: number;
  steps: SimulationStep[];
  output: Record<string, unknown>;
}

const DEFAULT_TOGGLES: SimulationToggles = {
  mockedTools: true,
  sandboxMemory: true,
  strictPolicy: true,
  fullOrchestration: false,
  stepByStep: false,
};

export async function runSimulation(input: {
  agentId: number;
  scenarioId?: number;
  inputPayload?: Record<string, unknown>;
  toggles?: Partial<SimulationToggles>;
  triggeredBy?: number;
}): Promise<SimulationResult> {
  const toggles: SimulationToggles = { ...DEFAULT_TOGGLES, ...(input.toggles ?? {}) };
  const draft = await repo.getCurrentDraft(input.agentId);
  if (!draft) throw new Error(`No draft found for agent ${input.agentId}`);

  // Phase 5c (Roadmap V3) — load the agent row so we can derive the
  // runtime lifecycle state for parallel-flow lockstep with
  // chat-stream.ts + chat.ts (Phase 5a/5b). Pre-flight #6 of the
  // roadmap: the published-fail-closed gate is agent-level, not
  // lane-level, so simulation of a published agent must enforce the
  // same default as production.
  const agent = await repo.getAgentById(input.agentId);
  if (!agent) throw new Error(`No agent found for id ${input.agentId}`);
  const runtimeContext = buildRuntimeContext({
    agentLifecycleState: (agent as { lifecycleState?: string }).lifecycleState ?? null,
  });
  // Same sentinel-fallback pattern as chat-stream.ts:1316 — the
  // ags_agents Drizzle schema doesn't expose `workspace_id` (the
  // column exists at the DB level for `listPublishedAgents`'s raw SQL
  // but the typed select() doesn't project it). Trace rows accept the
  // sentinel `1` until the schema rebase carries the column over.
  const workspaceId =
    typeof (agent as { workspaceId?: number }).workspaceId === "number"
      ? ((agent as { workspaceId?: number }).workspaceId as number)
      : 1;

  const scenario = input.scenarioId
    ? await repo.getSimulationScenarioById(input.scenarioId)
    : null;
  const inputPayload = input.inputPayload ?? scenario?.inputPayload ?? {};

  const run = await repo.createSimulationRun({
    agentId: input.agentId,
    scenarioId: input.scenarioId,
    triggeredBy: input.triggeredBy,
    // SimulationToggles is a strict interface; createSimulationRun stores
    // it as a generic jsonb Record. Spread into a fresh object to widen
    // the type without adding an index signature to the interface itself.
    toggles: { ...toggles } as Record<string, unknown>,
  });

  // Also create a runtime run row so the trace tabs in the runs page can
  // surface the events the simulation produces.
  const runtimeRun = await repo.appendRuntimeRun({
    agentId: input.agentId,
    environment: "draft",
    status: "running",
    triggeredBy: input.triggeredBy,
    triggerType: "simulation",
    inputPayload,
  });

  const start = Date.now();
  const steps: SimulationStep[] = [];
  let stepIdx = 0;
  let risk = 0;
  let cost = 0;
  let aborted = false;
  // Phase 11b-2 (Roadmap V3) — track the reason for the abort so the
  // terminal `updateRuntimeRun` can populate `errorReason` (Phase 11a
  // column #14). Operators dashboarding "why did this run fail?"
  // previously had to dig into the steps array; now the run-level
  // row carries the summary directly.
  let abortReason: string | undefined;
  // Phase 19 follow-up: hoisted so the final return statement can
  // surface the actual LLM response + metadata in `result.output`.
  // Previously this was declared inside the `if (!aborted)` block at
  // the Step 7 (Output) scope and the return hardcoded a minimal
  // `{aborted, runtimeRunId}` — throwing away responsePreview,
  // tokenCount, usage, and the live-run metadata that the UI's
  // "Logs & Output" panel needs to show the real answer.
  let finalOutputPayload: Record<string, unknown> = {};
  // Phase 5: hoisted so the final updateRuntimeRun() can persist usage.
  // Stays undefined for non-live runs and runs whose provider didn't
  // forward usage data.
  let liveUsage:
    | {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        costMicrocents?: number;
      }
    | undefined;

  // Pull all the draft state we'll reference in the steps below so the
  // simulation reflects real configuration honestly.
  const knowledge = await repo.listKnowledgeBindings(draft.id);
  const tools = await repo.listToolBindings(draft.id);
  const memory = await repo.listMemoryConfigs(draft.id);
  const enabledMemory = memory.filter((m) => m.enabled);
  const blockedTasks = (draft.blockedTasks ?? []) as string[];
  const allowedTasks = (draft.allowedTasks ?? []) as string[];

  // Detect if the input payload mentions any blocked task — drives refusal
  const inputText = JSON.stringify(inputPayload).toLowerCase();
  const matchedBlockedTask = blockedTasks.find((t) =>
    inputText.includes(t.toLowerCase())
  );

  // ── Step 1: Interpret request ──
  steps.push({
    index: stepIdx++,
    type: "interpret",
    label: "Interpret user request against mission",
    payload: {
      mission: draft.mission ?? "(no mission set)",
      input: inputPayload,
      autonomy: draft.autonomyLevel ?? "supervised",
      allowedTasksCount: allowedTasks.length,
      blockedTasksCount: blockedTasks.length,
      matchedBlockedTask: matchedBlockedTask ?? null,
      interpretation: matchedBlockedTask
        ? "Request matches a blocked task — refusal will be triggered"
        : "Request mapped to allowed task scope",
    },
    verdict: matchedBlockedTask ? "warning" : draft.mission ? "pass" : "warning",
    durationMs: 12,
  });

  // ── Step 1.5: Refusal short-circuit ──
  if (matchedBlockedTask && toggles.strictPolicy) {
    steps.push({
      index: stepIdx++,
      type: "output",
      label: "Refusal triggered by blocked-task policy",
      payload: {
        refusalBehavior:
          draft.refusalBehavior ?? "(default refusal — no custom message)",
        reason: `matched blocked task: ${matchedBlockedTask}`,
      },
      verdict: "blocked",
      durationMs: 4,
    });
    risk += 5;
    aborted = true;
    abortReason = "intent classification blocked by strict policy";
  }

  // ── Step 2: Plan ──
  if (!aborted) {
    steps.push({
      index: stepIdx++,
      type: "plan",
      label: "Build execution plan",
      payload: {
        plan: [
          "1. Retrieve grounding context from knowledge sources",
          "2. Evaluate tool requirements",
          "3. Compose response per output contract",
        ],
        autonomy: draft.autonomyLevel ?? "supervised",
        memoryAccess: enabledMemory.map((m) => m.memoryType),
      },
      verdict: "pass",
      durationMs: 8,
    });
  }

  // ── Step 3: Knowledge retrieval — uses real adapter preview ──
  if (!aborted && knowledge.length > 0) {
    const queryText =
      typeof (inputPayload as any).prompt === "string"
        ? (inputPayload as any).prompt
        : (inputPayload as any).query ?? JSON.stringify(inputPayload).slice(0, 80);
    const preview = await previewRetrieval({
      query: String(queryText),
      bindings: knowledge.map((k) => ({
        sourceKey: k.sourceKey,
        sourceName: k.sourceName,
        priority: k.priority ?? 50,
        retrievalDepth: k.retrievalDepth ?? 5,
        groundingMode: k.groundingMode ?? "hybrid",
      })),
    });
    steps.push({
      index: stepIdx++,
      type: "memory_op",
      label: `Retrieve from ${knowledge.length} knowledge source(s)`,
      payload: {
        sources: knowledge.map((k) => ({
          key: k.sourceKey,
          name: k.sourceName,
          priority: k.priority,
          groundingMode: k.groundingMode,
        })),
        sandbox: toggles.sandboxMemory,
        groundingPolicy: preview.groundingPolicy,
        topHits: preview.hits.slice(0, 3),
      },
      verdict: "pass",
      durationMs: 22,
    });
    cost += knowledge.length * 5;
    // Trace event
    await repo.appendRuntimeMemoryEvent({
      runId: runtimeRun.id,
      memoryType: "knowledge",
      operation: "retrieve",
      payload: { sourceCount: knowledge.length, hitCount: preview.totalHits },
    });
  }

  // ── Step 3.5: Memory ops for enabled persistent/episodic stores ──
  if (!aborted && enabledMemory.length > 0) {
    for (const mem of enabledMemory) {
      await repo.appendRuntimeMemoryEvent({
        runId: runtimeRun.id,
        memoryType: mem.memoryType,
        operation: toggles.sandboxMemory ? "sandbox_read" : "read",
        payload: {
          retentionDays: mem.retentionDays ?? null,
          deletionPolicy: mem.deletionPolicy,
        },
      });
    }
  }

  // ── Step 4: Tool calls — uses catalog adapter for kind-aware checks ──
  // Phase 4: PreToolUse and PostToolUse hooks fire around each tool call.
  // The hook runner spawns user-supplied commands as child processes and
  // persists results into agsRuntimeHookExecutions for the runs page tab.
  const draftWorkingDir = ((draft.workingDirectories ?? []) as string[])[0] ?? null;
  if (!aborted) {
    for (const t of tools.slice(0, 3)) {
      const catalogEntry = await getToolCatalogEntry(t.toolKey);
      const isDestructive =
        catalogEntry?.destructive === true ||
        ((t.allowedActions ?? []) as string[]).some((a) =>
          /delete|drop|destroy|wipe|truncate/i.test(a)
        );
      let verdict: SimulationStep["verdict"] = "pass";
      if (isDestructive && t.requiresApproval) {
        verdict = "warning";
      } else if (isDestructive && !t.requiresApproval) {
        verdict = toggles.strictPolicy ? "blocked" : "warning";
        risk += 30;
        if (toggles.strictPolicy) {
          aborted = true;
          abortReason = `destructive tool ${t.toolName} invoked without approval (strict policy)`;
        }
      }

      // Phase 4: PreToolUse hook
      await fireHooksForEvent({
        runId: runtimeRun.id,
        agentId: input.agentId,
        draftId: draft.id,
        eventName: "PreToolUse",
        toolName: t.toolName,
        payload: {
          toolKey: t.toolKey,
          kind: catalogEntry?.category ?? "unknown",
          mocked: toggles.mockedTools,
          destructive: isDestructive,
        },
        workingDirectory: draftWorkingDir,
      });

      // Phase 17a/d: MCP tool execution.
      // Three possible MCP-related tool kinds:
      //   1. mcp__<server>__<tool> — proxied call to a remote MCP tool
      //   2. ListMcpResources       — flatten resources across all servers
      //   3. ReadMcpResource         — read one resource by uri
      // All other tool keys fall through to mock/static execution.
      // The live openllm-agent2 path is upstream-blocked because its WS
      // bridge hardcodes mcpClients: [] in headless-engine.ts:419.
      let mcpResult: unknown = null;
      let mcpError: string | null = null;
      let mcpDurationMs = 30;
      const isMcpTool = t.toolKey.startsWith("mcp__");
      const isMcpListResources = t.toolKey === "ListMcpResources";
      const isMcpReadResource = t.toolKey === "ReadMcpResource";

      if ((isMcpListResources || isMcpReadResource) && !toggles.mockedTools) {
        const mcpStart = Date.now();
        try {
          if (isMcpListResources) {
            // Phase 17d: aggregate resources across every connected MCP
            // server attached to this draft.
            mcpResult = await mcpManager.listConnectedResources(draft.id);
          } else {
            // Phase 17d: ReadMcpResource expects a uri in the args. We
            // can't extract args from a static catalog tool call (the
            // simulation engine doesn't have a real LLM picking
            // arguments yet), so we read the FIRST resource on the
            // FIRST connected server as a smoke test. The live runtime
            // would pass real args.
            const all = await mcpManager.listConnectedResources(draft.id);
            if (all.length === 0) {
              mcpError =
                "no MCP resources discovered — connect a server that exposes resources/list";
              verdict = "warning";
            } else {
              const first = all[0];
              mcpResult = await mcpManager.readMcpResource({
                serverId: first.serverId,
                uri: first.uri,
              });
            }
          }
          mcpDurationMs = Date.now() - mcpStart;
        } catch (e) {
          mcpError = e instanceof Error ? e.message : String(e);
          mcpDurationMs = Date.now() - mcpStart;
          verdict = "warning";
        }
      } else if (isMcpTool && !toggles.mockedTools) {
        // Phase 5c (Roadmap V3) — simulation lane now goes through the
        // same `validate → gate → dispatch` chain as the chat lanes.
        // Closes H1 from the Phase 1a/1c audit (simulation previously
        // skipped both ProposedToolCall validation and the approval
        // gate). After this phase, every production lane writes
        // identical audit + trace evidence.
        //
        // Lockstep with chat-stream.ts:758-822 — same four steps:
        //   1. resolve serverRow + liveTool (skip with warning when
        //      not connected)
        //   2. validateRuntimeToolCall (records validator_rejected)
        //   3. gateRuntimeDispatch (records approval_required;
        //      simulation does NOT await — dry-run surfaces the gate
        //      verdict in the trace + step verdict and moves on)
        //   4. dispatchMcpToolCall with approvalRequestId +
        //      runtimeContext (the latter activates Phase 5b's fail-
        //      closed for published agents)
        const parsed = parseMcpDispatchKey(t.toolKey);
        const draftServers = await repo.listMcpServers(draft.id);
        const serverRow = parsed
          ? draftServers.find((s) => s.name === parsed.serverName)
          : undefined;
        const snap = serverRow ? getSnapshot(serverRow.id) : undefined;
        const liveTool = snap?.tools.find(
          (tt) => tt.name === parsed?.remoteToolName,
        );

        if (!parsed || !serverRow || !liveTool) {
          // Same shape as chat-stream's `spec_lookup_failed` branch:
          // tool isn't connected to this draft right now → warn and
          // skip dispatch. Trace not persisted (no validation row to
          // anchor it to).
          mcpError = `tool ${t.toolKey} not connected to draft (server or live tool unavailable)`;
          mcpDurationMs = 0;
          verdict = "warning";
        } else {
          const runtimeValidation = await validateRuntimeToolCall({
            mcpServerId: serverRow.name,
            toolName: liveTool.name,
            liveTool,
            arguments: {},
          });
          // Approval gate. Simulation does NOT await the resume loop —
          // dry-run surfaces approval_required as a "warning" step
          // verdict. Operators see which tools would have required
          // approval without simulation blocking on operator action.
          const runtimeVerdict = await gateRuntimeDispatch({
            validation: runtimeValidation,
            agentDraftId: draft.id,
            runtimeRunId: runtimeRun.id,
            description: `simulation run ${runtimeRun.id} · tool ${t.toolKey}`,
          });

          if (!runtimeVerdict.ok) {
            await persistRuntimeToolCallTrace({
              workspaceId: workspaceId,
              agentId: input.agentId,
              agentDraftId: draft.id,
              runtimeRunId: runtimeRun.id,
              runtimeTraceId: null,
              messageId: null,
              verdict: runtimeVerdict,
              validation: runtimeValidation,
              dispatchResult: null,
              governanceVerdict: null,
            });
            mcpError = `${runtimeVerdict.reason}: ${runtimeVerdict.message ?? "blocked"}`;
            mcpDurationMs = 0;
            // Validator rejection blocks; approval-required surfaces
            // as a warning so the simulation continues to gather
            // signal on subsequent tools.
            verdict =
              runtimeVerdict.reason === "validator_rejected"
                ? "blocked"
                : "warning";
          } else {
            const dispatchResult = await dispatchMcpToolCall({
              agentDraftId: draft.id,
              runtimeRunId: runtimeRun.id,
              toolName: t.toolKey,
              args: {},
              source: "simulation",
              approvalRequestId:
                runtimeVerdict.approvalRequestId ?? undefined,
              // Phase 5b: forward the runtime context so the dispatcher
              // can apply the fail-closed default for published agents
              // with zero enabled permission rules. Pre-flight #6 —
              // simulation of a published agent enforces fail-closed.
              runtimeContext,
            });
            mcpDurationMs = dispatchResult.durationMs;
            if (dispatchResult.ok) {
              mcpResult = dispatchResult.result;
            } else {
              mcpError = dispatchResult.error?.message ?? "MCP dispatch failed";
              verdict = "warning";
            }
            await persistRuntimeToolCallTrace({
              workspaceId: workspaceId,
              agentId: input.agentId,
              agentDraftId: draft.id,
              runtimeRunId: runtimeRun.id,
              runtimeTraceId: null,
              messageId: null,
              verdict: runtimeVerdict,
              validation: runtimeValidation,
              dispatchResult: {
                ok: dispatchResult.ok,
                error: dispatchResult.error
                  ? { message: dispatchResult.error.message }
                  : undefined,
                durationMs: dispatchResult.durationMs,
              },
              governanceVerdict: dispatchResult.governanceVerdict ?? null,
            });
          }
        }
      }

      const usedMcp = isMcpTool || isMcpListResources || isMcpReadResource;
      steps.push({
        index: stepIdx++,
        type: "tool_call",
        label: usedMcp
          ? `${toggles.mockedTools ? "Mock" : "MCP"} call: ${t.toolName}`
          : `${toggles.mockedTools ? "Mock" : "Live"} call: ${t.toolName}`,
        payload: {
          toolKey: t.toolKey,
          kind: catalogEntry?.category ?? (usedMcp ? "mcp" : "unknown"),
          mocked: toggles.mockedTools,
          approvalRequired: t.requiresApproval,
          destructive: isDestructive,
          result: mcpError
            ? { ok: false, error: mcpError, source: "mcp" }
            : usedMcp && !toggles.mockedTools
              ? { ok: true, source: "mcp", data: mcpResult }
              : toggles.mockedTools
                ? { ok: true, mock: true }
                : { ok: true, executed: true },
        },
        verdict,
        durationMs: mcpDurationMs,
      });
      cost += 10;
      // Trace event so the runs page Tools tab has data
      await repo.appendRuntimeToolCall({
        runId: runtimeRun.id,
        toolKey: t.toolKey,
        requestPayload: {
          mocked: toggles.mockedTools,
          kind: catalogEntry?.category,
          isMcp: usedMcp,
          mcpKind: isMcpListResources
            ? "list_resources"
            : isMcpReadResource
              ? "read_resource"
              : isMcpTool
                ? "tool_call"
                : null,
        },
        responsePayload: mcpError
          ? { verdict, destructive: isDestructive, mcpError }
          : usedMcp && !toggles.mockedTools
            ? { verdict, destructive: isDestructive, mcpResult }
            : { verdict, destructive: isDestructive },
        verdict,
        durationMs: mcpDurationMs,
      });

      // Phase 4: PostToolUse hook (fires even on blocked verdict — the
      // hook gets to see what happened)
      await fireHooksForEvent({
        runId: runtimeRun.id,
        agentId: input.agentId,
        draftId: draft.id,
        eventName: "PostToolUse",
        toolName: t.toolName,
        payload: {
          toolKey: t.toolKey,
          verdict,
          destructive: isDestructive,
          aborted,
        },
        workingDirectory: draftWorkingDir,
      });

      if (aborted) break;
    }
  }

  // ── Step 5: Governance policy check ──
  const govResult = await evaluateGovernance(input.agentId);
  steps.push({
    index: stepIdx++,
    type: "policy_check",
    label: "Evaluate governance policy",
    payload: {
      verdict: govResult.verdict,
      riskScore: govResult.riskScore,
      reasons: govResult.reasons,
    },
    verdict:
      govResult.verdict === "blocked"
        ? "blocked"
        : govResult.verdict === "warning"
          ? "warning"
          : "pass",
    durationMs: 5,
  });
  risk += govResult.riskScore;
  // Trace event so the runs page Policy tab has data
  for (const reason of govResult.reasons.slice(0, 6)) {
    await repo.appendRuntimePolicyEvent({
      runId: runtimeRun.id,
      policyKey: reason.rule,
      decision:
        reason.severity === "blocker"
          ? "deny"
          : reason.severity === "warning"
            ? "warn"
            : "allow",
      reason: reason.message,
    });
  }
  if (govResult.verdict === "blocked" && toggles.strictPolicy) {
    aborted = true;
    abortReason =
      govResult.reasons?.[0]?.message ??
      govResult.reasons?.[0]?.rule ??
      "governance evaluation blocked by strict policy";
  }

  // ── Step 6: Handoff (only if orchestration enabled) ──
  if (toggles.fullOrchestration && !aborted) {
    steps.push({
      index: stepIdx++,
      type: "handoff",
      label: "Hand off to downstream agent (orchestration mode)",
      payload: { mode: "full_orchestration" },
      verdict: "pass",
      durationMs: 6,
    });
  }

  // ── Step 7: Output ──
  // Phase 1b: when mockedTools=false AND the agent has a configured runtime
  // endpoint (providerConfig.baseUrl OR provider+model with default fallback),
  // route the output step through the openllm-agent2 WebSocket runtime
  // adapter and use its real response. Otherwise stay deterministic.
  if (!aborted) {
    const providerConfig = (draft.providerConfig ?? {}) as Record<string, unknown>;
    // Phase 29.0a: replaces `resolveOpenllmEndpoint(providerConfig)`. Live
    // runs require the agent to have a hosted Provider Connection
    // binding (`providerConnection !== null`); local-provider bindings
    // and unbound agents stay deterministic-only.
    const bindingResult = await resolveForRun({ draftId: draft.id });
    const useLiveRuntime =
      !toggles.mockedTools &&
      bindingResult.ok &&
      bindingResult.providerConnection !== null;

    let responsePreview: string;
    let outputDurationMs = 18;
    const outputPayload: Record<string, unknown> = {
      contract: draft.outputContract ?? "(no contract defined)",
      refusalBehavior: draft.refusalBehavior ?? null,
    };

    if (useLiveRuntime && bindingResult.providerConnection) {
      const pcid = bindingResult.providerConnection.providerConnectionId;
      const modelRef = bindingResult.binding.modelRef;
      // Build the user message from the input payload
      const inputText =
        typeof (inputPayload as any).prompt === "string"
          ? ((inputPayload as any).prompt as string)
          : typeof (inputPayload as any).query === "string"
            ? ((inputPayload as any).query as string)
            : JSON.stringify(inputPayload);

      // Phase 1c + Phase 3: Pull the draft's permission rules and turn them
      // into a resolver the adapter can call once per `permission_request`.
      //  - allow / deny rules → resolved synchronously from the rules table
      //  - "ask" rules → insert a pending row and BLOCK the run by polling
      //    until a human flips it (or the timeout elapses, recorded as denied)
      // Tracks per-request decisions so the trace records what actually
      // happened.
      const permissionRules = await repo.listPermissionRules(draft.id);
      const baseResolver = buildPermissionResolver(permissionRules);
      const decisionLog: Array<{
        ts: number;
        decision: PermissionDecision;
        toolName: string;
        humanDecided: boolean;
        pendingRequestId?: number;
      }> = [];
      const trackingResolver: PermissionResolver = async (request) => {
        const toolName = request.toolName ?? request.toolKey ?? "(unknown)";
        const ruleDecision = baseResolver(request);

        // Allow / Deny — resolved by rules alone, no human needed
        if (ruleDecision === "allow" || ruleDecision === "deny") {
          decisionLog.push({
            ts: Date.now(),
            decision: ruleDecision,
            toolName,
            humanDecided: false,
          });
          return ruleDecision;
        }

        // needs_human (rule was "ask" or unmatched) — Phase 3 flow:
        // create a pending request and poll until decided.
        const pending = await repo.createPendingPermissionRequest({
          runtimeRunId: runtimeRun.id,
          toolName,
          description: request.description,
          rawPayload: request.rawPayload,
        });
        const pollIntervalMs = 1500;
        const pollTimeoutMs = 5 * 60 * 1000; // 5 min hard cap
        const deadline = Date.now() + pollTimeoutMs;
        let finalDecision: PermissionDecision = "deny";
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          const row = await repo.getPendingPermissionRequestById(pending.id);
          if (!row) break;
          if (row.status === "allowed") {
            finalDecision = "allow";
            break;
          }
          if (row.status === "denied" || row.status === "timed_out") {
            finalDecision = "deny";
            break;
          }
          // still pending — keep polling
        }
        // If we exited the loop because of the deadline (still pending),
        // flip the row to timed_out so the UI reflects reality.
        const finalRow = await repo.getPendingPermissionRequestById(pending.id);
        if (finalRow && finalRow.status === "pending") {
          // H1-c6: system timeout flip via the audit-writing service
          // path. `decidedBy` stays null (no operator authored this).
          await decideApprovalRequest({
            approvalRequestId: pending.id,
            status: "timed_out",
            decidedBy: null,
            reason: `No human response within ${pollTimeoutMs / 1000}s`,
          });
          finalDecision = "deny";
        }
        decisionLog.push({
          ts: Date.now(),
          decision: finalDecision,
          toolName,
          humanDecided: true,
          pendingRequestId: pending.id,
        });
        return finalDecision;
      };

      // Phase 18: Build the MCP server list to inject into the live
      // runtime via the new `configure_session` message. We only forward
      // rows the MCP manager has actually connected (status='connected')
      // — un-connected rows would just generate per-server errors on
      // the upstream side and waste a roundtrip. OAuth tokens are
      // decrypted SERVER-SIDE here (decision #9a) using the platform
      // encryption helper. The cross-module import is the documented
      // exception that the api/router.ts oauth-exchange path already
      // uses for the same secret-storage purpose.
      let bridgeMcpServers: McpServerConfigForBridge[] = [];
      try {
        const mcpRows = await repo.listMcpServers(draft.id);
        const connectedRows = mcpRows.filter(
          (r) => r.status === "connected" && r.enabled !== false
        );
        if (connectedRows.length > 0) {
          // Lazy import — only pulled in when there are encrypted tokens
          // to decrypt for an attached OAuth-flavored MCP server.
          let decryptFn: ((s: string) => string) | null = null;
          const ensureDecrypt = async () => {
            if (decryptFn) return decryptFn;
            const mod = await import("../../_core/encryption");
            decryptFn = mod.decrypt;
            return decryptFn;
          };

          const built: McpServerConfigForBridge[] = [];
          for (const row of connectedRows) {
            // OAuth → bearer token header (best effort, fail-soft)
            let authHeaders: Record<string, string> | undefined;
            const oauthState = (row.oauthState ?? null) as Record<
              string,
              unknown
            > | null;
            const encryptedTokens =
              oauthState && typeof oauthState.encryptedTokens === "string"
                ? (oauthState.encryptedTokens as string)
                : undefined;
            if (encryptedTokens) {
              try {
                const dec = await ensureDecrypt();
                const tokens = JSON.parse(dec(encryptedTokens)) as {
                  accessToken?: string;
                };
                if (tokens.accessToken) {
                  authHeaders = {
                    Authorization: `Bearer ${tokens.accessToken}`,
                  };
                }
              } catch {
                // Decryption / parse failure → skip auth headers, the
                // server may still work for non-protected operations
              }
            }

            switch (row.transport) {
              case "stdio":
                if (row.command) {
                  built.push({
                    type: "stdio",
                    command: row.command,
                    args: (row.args ?? []) as string[],
                    env: (row.env ?? {}) as Record<string, string>,
                  });
                }
                break;
              case "http":
                if (row.url) {
                  built.push({
                    type: "http",
                    url: row.url,
                    headers: authHeaders,
                  });
                }
                break;
              case "sse":
                if (row.url) {
                  built.push({
                    type: "sse",
                    url: row.url,
                    headers: authHeaders,
                  });
                }
                break;
              case "websocket":
                if (row.url) {
                  built.push({
                    type: "websocket",
                    url: row.url,
                    headers: authHeaders,
                  });
                }
                break;
              case "sdk":
                if (row.command) {
                  built.push({ type: "sdk", serverName: row.command });
                }
                break;
              default:
                // Unknown transport — skip silently, the upstream patch
                // will reject anything outside its 8-transport union
                break;
            }
          }
          bridgeMcpServers = built;
        }
      } catch {
        // Listing MCP rows failed — proceed without injection. The live
        // run still works, just without MCP tools (same as the pre-Phase-18
        // behavior). Don't fail the whole simulation over this.
        bridgeMcpServers = [];
      }

      // Phase 29.0a: pick the Model Access surface based on what the
      // run actually needs:
      //
      //   - Bridge (`runViaOpenllmBridge`, direct-import):
      //       when MCP servers OR permission rules are configured.
      //       The agent loop runs against openllm-agent2's WebSocket
      //       protocol — `configure_session` injects MCP, and
      //       `permission_request` events flow through the resolver.
      //       Requires the binding's Provider Connection to point at
      //       an openllm-agent2 instance (a plain OpenAI Provider
      //       Connection has no WebSocket endpoint).
      //
      //   - Execute (`openRouter.modelAccess.execute`, gateway-call):
      //       when no permission/MCP features are needed. Lighter HTTP
      //       path; works against any HTTP-based provider (OpenAI,
      //       Anthropic, openllm-agent2 passthrough).
      //
      // Both branches map their result onto the unified shape that
      // the downstream metadata-payload code expects (matches the
      // legacy `OpenllmRuntimeResult` contract).
      //
      // Phase 3 timeout policy (6 minutes) preserved on the bridge
      // path so a `permission_request` that goes to "ask" can wait
      // the full 5-minute human-poll window plus 1 minute of slack.

      const needsBridge =
        bridgeMcpServers.length > 0 || permissionRules.length > 0;
      const systemPrompt =
        [draft.systemInstructions, draft.roleInstructions]
          .filter((s) => typeof s === "string" && s.length > 0)
          .join("\n\n") || "You are a helpful assistant.";

      type UnifiedRuntimeResult = {
        ok: boolean;
        text: string;
        tokenCount: number;
        durationMs: number;
        error?: string;
        finalizedNormally: boolean;
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
          costMicrocents?: number;
        };
        permissionEvents: Array<{ ts: number; payload: Record<string, unknown> }>;
        policyEvents: Array<{ ts: number; payload: Record<string, unknown> }>;
        sessionConfig:
          | null
          | "no_ack"
          | { mcpServerCount: number; mcpToolCount: number; errors: Array<{ serverName: string; error: string }> };
      };

      let liveResult: UnifiedRuntimeResult;

      if (needsBridge) {
        const bridgeResult = await runViaOpenllmBridge({
          providerConnectionId: pcid,
          modelRef,
          message: inputText,
          timeoutMs: 6 * 60 * 1000,
          permissionResolver: trackingResolver,
          mcpServers: bridgeMcpServers,
          mcpScope: "managed",
          intent: "agent-test",
          workspaceId: bindingResult.binding.workspaceId,
          actorId: input.triggeredBy ?? 0,
        });
        liveResult = {
          ok: bridgeResult.ok,
          text: bridgeResult.text,
          tokenCount: bridgeResult.tokenCount,
          durationMs: bridgeResult.durationMs,
          error: bridgeResult.error,
          finalizedNormally: bridgeResult.finalizedNormally,
          usage: bridgeResult.usage
            ? {
                inputTokens: bridgeResult.usage.inputTokens,
                outputTokens: bridgeResult.usage.outputTokens,
                totalTokens: bridgeResult.usage.totalTokens,
                costMicrocents: bridgeResult.usage.costMicrocents,
              }
            : undefined,
          permissionEvents: bridgeResult.permissionEvents,
          policyEvents: bridgeResult.policyEvents,
          sessionConfig: bridgeResult.sessionConfig,
        };
      } else {
        const executeResult = (await gatewayCall({
          ctx: {
            sourceModule: "agentStudio",
            targetModule: "openRouter",
            actionKey: "openRouter.modelAccess.execute",
            workspaceId: bindingResult.binding.workspaceId,
            actorId: input.triggeredBy ?? 0,
          },
          input: {
            providerConnectionId: pcid,
            modelRef,
            messages: [
              { role: "system" as const, content: systemPrompt },
              { role: "user" as const, content: inputText },
            ],
            intent: "agent-test" as const,
            workspaceId: bindingResult.binding.workspaceId,
            actorId: input.triggeredBy ?? 0,
            temperature:
              typeof (providerConfig as any).temperature === "number"
                ? (providerConfig as any).temperature
                : 0.2,
            tokenBudget:
              typeof (providerConfig as any).maxTokens === "number"
                ? (providerConfig as any).maxTokens
                : undefined,
          },
        })) as ModelAccessResult;
        liveResult = {
          ok: executeResult.status === "ok",
          text: executeResult.output ?? "",
          tokenCount: executeResult.usage?.outputTokens ?? 0,
          durationMs: executeResult.latencyMs,
          error: executeResult.error,
          finalizedNormally: executeResult.status === "ok",
          usage: executeResult.usage
            ? {
                inputTokens: executeResult.usage.inputTokens,
                outputTokens: executeResult.usage.outputTokens,
                totalTokens: executeResult.usage.totalTokens,
                // Model Access doesn't track cost today — Phase 29 leaves
                // costMicrocents undefined for the execute path. Bridge
                // path still surfaces cost when the upstream done message
                // carries it.
                costMicrocents: undefined,
              }
            : undefined,
          permissionEvents: [],
          policyEvents: [],
          sessionConfig: null,
        };
      }

      if (liveResult.ok) {
        responsePreview = liveResult.text || "(empty response)";
        outputDurationMs = liveResult.durationMs;
        outputPayload.live = true;
        // Phase 29.0a: was `endpoint.source`/`endpoint.wsUrl`/
        // `endpoint.provider`/`endpoint.model`. The new shape surfaces
        // the binding's Provider Connection refs so reviewers can join
        // back to the catalog instead of seeing a raw WS URL.
        outputPayload.runtimeSource = needsBridge ? "bridge" : "execute";
        outputPayload.providerConnectionId = pcid;
        outputPayload.providerCatalogEntryId =
          bindingResult.binding.providerCatalogEntryId ?? null;
        outputPayload.modelCatalogEntryId =
          bindingResult.binding.modelCatalogEntryId ?? null;
        outputPayload.model = modelRef || null;
        outputPayload.tokenCount = liveResult.tokenCount;
        outputPayload.permissionRequestCount = liveResult.permissionEvents.length;
        outputPayload.policyEventCount = liveResult.policyEvents.length;
        // Phase 18: surface the configure_session outcome so the runs page
        // can show whether MCP injection actually took effect.
        //  - null    → no MCP servers attached
        //  - "no_ack"→ upstream is un-patched (live ran without MCP)
        //  - object  → patched upstream confirmed N servers / M tools
        outputPayload.mcpInjection = (() => {
          if (liveResult.sessionConfig === null) {
            return { sent: false, reason: "no_mcp_servers_attached" };
          }
          if (liveResult.sessionConfig === "no_ack") {
            return {
              sent: true,
              acked: false,
              reason:
                "upstream openllm-agent2 did not ack within timeout — likely un-patched (Phase 18 fork not yet deployed)",
              attemptedServerCount: bridgeMcpServers.length,
            };
          }
          return {
            sent: true,
            acked: true,
            mcpServerCount: liveResult.sessionConfig.mcpServerCount,
            mcpToolCount: liveResult.sessionConfig.mcpToolCount,
            errors: liveResult.sessionConfig.errors,
          };
        })();
        // Phase 5: surface usage in the output payload AND capture it for
        // the final updateRuntimeRun() write so the runs page header
        // shows tokens + cost without rummaging through the JSON blob.
        if (liveResult.usage) {
          liveUsage = {
            inputTokens: liveResult.usage.inputTokens,
            outputTokens: liveResult.usage.outputTokens,
            totalTokens: liveResult.usage.totalTokens,
            costMicrocents: liveResult.usage.costMicrocents,
          };
          outputPayload.usage = {
            inputTokens: liveResult.usage.inputTokens ?? null,
            outputTokens: liveResult.usage.outputTokens ?? null,
            totalTokens: liveResult.usage.totalTokens ?? null,
            costMicrocents: liveResult.usage.costMicrocents ?? null,
          };
          // Roll the cost into the simulation's existing cost counter so
          // the simulation_runs row reflects real spend (cost is already
          // in cents-ish units; we convert microcents → cents for parity).
          if (liveResult.usage.costMicrocents != null) {
            cost += Math.round(liveResult.usage.costMicrocents / 10_000);
          }
        }
      } else {
        responsePreview = `[live run failed: ${liveResult.error}]`;
        outputDurationMs = liveResult.durationMs;
        outputPayload.live = true;
        outputPayload.failed = true;
        outputPayload.error = liveResult.error;
        outputPayload.runtimeSource = needsBridge ? "bridge" : "execute";
        outputPayload.providerConnectionId = pcid;
        // Don't abort the simulation — record the failure but let the rest finish
      }

      // Phase 1c + Phase 3: Persist permission events from the live run as
      // runtime policy events. The decision recorded is the actual one
      // returned by the resolver (rule-based or human-decided). Pair each
      // event with the matching log entry by index — the adapter emits
      // permission_request and resolver calls in lockstep.
      for (let i = 0; i < liveResult.permissionEvents.length; i++) {
        const ev = liveResult.permissionEvents[i];
        const logged = decisionLog[i];
        const decision: PermissionDecision = logged?.decision ?? "deny";
        const persistedDecision = decision === "allow" ? "allow" : "deny";
        const toolName = logged?.toolName ?? "(unknown tool)";
        let reason: string;
        if (logged?.humanDecided) {
          // Phase 3: human responded (or timeout fired)
          reason =
            decision === "allow"
              ? `Allowed by human via permission request #${logged.pendingRequestId} (${toolName})`
              : `Denied by human or timed out via permission request #${logged.pendingRequestId} (${toolName})`;
        } else {
          // Phase 1c: rule-based
          reason =
            decision === "allow"
              ? `Allowed by permission rule for ${toolName}`
              : `Denied by permission rules (${toolName})`;
        }
        await repo.appendRuntimePolicyEvent({
          runId: runtimeRun.id,
          policyKey: "openllm.permission_request",
          decision: persistedDecision,
          reason,
          payload: ev.payload,
        });
      }
      outputPayload.permissionDecisions = decisionLog.map((d) => ({
        toolName: d.toolName,
        decision: d.decision,
        humanDecided: d.humanDecided,
        pendingRequestId: d.pendingRequestId,
      }));
      for (const ev of liveResult.policyEvents) {
        await repo.appendRuntimePolicyEvent({
          runId: runtimeRun.id,
          policyKey: "openllm.policy_event",
          decision: "info",
          reason: typeof ev.payload.message === "string" ? ev.payload.message : undefined,
          payload: ev.payload,
        });
      }
    } else {
      // Deterministic fallback (Phase 0c behavior preserved)
      responsePreview =
        "[simulated response — set providerConfig.baseUrl AND mockedTools=false to call openllm-agent2]";
    }

    outputPayload.responsePreview = responsePreview;

    steps.push({
      index: stepIdx++,
      type: "output",
      label: useLiveRuntime
        ? "Live response via Model Access"
        : "Compose response per output contract",
      payload: outputPayload,
      verdict: draft.outputContract ? "pass" : "warning",
      durationMs: outputDurationMs,
    });

    // Phase 19 follow-up: capture the full outputPayload into the
    // function-scoped variable so the return statement can surface
    // responsePreview + live run metadata in result.output. Without
    // this capture, the UI's "Logs & Output" panel only sees the
    // hardcoded { aborted, runtimeRunId } minimal object and the
    // actual LLM response is invisible (it still exists in
    // steps[output].payload but users look at the panel first).
    finalOutputPayload = { ...outputPayload };
  }

  const durationMs = Date.now() - start;
  const verdict: SimulationResult["verdict"] = aborted
    ? "blocked"
    : steps.some((s) => s.verdict === "warning")
      ? "warning"
      : "pass";
  const status: SimulationResult["status"] = aborted ? "blocked" : "completed";

  // Persist simulation steps + simulation run finalize
  for (const s of steps) {
    await repo.appendSimulationStep({
      runId: run.id,
      stepIndex: s.index,
      stepType: s.type,
      label: s.label,
      payload: s.payload,
      verdict: s.verdict,
      durationMs: s.durationMs,
    });
    // Mirror into the runtime run steps so the runs page Steps tab shows
    // the same timeline (the simulation run and runtime run share an
    // execution trail).
    await repo.appendRuntimeRunStep({
      runId: runtimeRun.id,
      stepIndex: s.index,
      stepType: s.type,
      label: s.label,
      payload: s.payload,
      verdict: s.verdict,
      durationMs: s.durationMs,
    });
  }
  const summary = aborted
    ? "Simulation blocked by governance/policy"
    : verdict === "warning"
      ? "Simulation completed with warnings"
      : "Simulation completed successfully";
  await repo.updateSimulationRun(run.id, {
    status,
    verdict,
    summary,
    riskScore: Math.min(100, risk),
    costEstimate: cost,
    durationMs,
    output: { steps: steps.length, aborted },
    finishedAt: new Date(),
  });
  // Phase 4: fire Stop hook at end of run (success or failure). Best-effort
  // — failures don't poison the finalize path.
  try {
    await fireHooksForEvent({
      runId: runtimeRun.id,
      agentId: input.agentId,
      draftId: draft.id,
      eventName: "Stop",
      payload: {
        verdict,
        aborted,
        durationMs,
        stepCount: steps.length,
      },
      workingDirectory: draftWorkingDir,
    });
  } catch {
    /* ignore — Stop hook failure must not break the run finalize */
  }

  // Finalize the runtime run too — same status, summary, output
  // Phase 5: persist usage columns so the runs page header can show them
  // without parsing the output JSON blob.
  await repo.updateRuntimeRun(runtimeRun.id, {
    status: aborted ? "failed" : "completed",
    summary,
    durationMs,
    finishedAt: new Date(),
    outputPayload: { simulationRunId: run.id, verdict, aborted },
    inputTokens: liveUsage?.inputTokens,
    outputTokens: liveUsage?.outputTokens,
    totalTokens: liveUsage?.totalTokens,
    costMicrocents: liveUsage?.costMicrocents,
    // Phase 11b-2 — populate the run-level errorReason column when
    // the simulation aborted. Per Phase 11a's audit, errorReason is
    // metric #14 — surfaces "why did this run fail?" without parsing
    // the steps array.
    errorReason: aborted ? abortReason : undefined,
  });

  return {
    runId: run.id,
    status,
    verdict,
    summary,
    riskScore: Math.min(100, risk),
    costEstimate: cost,
    durationMs,
    steps,
    // Phase 19 follow-up: surface the full output payload (includes
    // responsePreview, tokenCount, usage, runtimeSource, error, etc.)
    // plus the bookkeeping fields. The UI's "Logs & Output" panel
    // reads this to show the actual LLM response — without the merge
    // it only sees { aborted, runtimeRunId } and users couldn't tell
    // what the agent actually said.
    output: {
      ...finalOutputPayload,
      aborted,
      runtimeRunId: runtimeRun.id,
    },
  };
}

export async function compareSimulationRuns(runIdA: number, runIdB: number) {
  const a = await repo.getSimulationRun(runIdA);
  const b = await repo.getSimulationRun(runIdB);
  if (!a || !b) throw new Error("One or both simulation runs not found");
  const stepsA = await repo.listSimulationRunSteps(runIdA);
  const stepsB = await repo.listSimulationRunSteps(runIdB);
  return {
    runA: a,
    runB: b,
    stepsA,
    stepsB,
    diff: {
      verdict: a.verdict !== b.verdict,
      riskDelta: (b.riskScore ?? 0) - (a.riskScore ?? 0),
      costDelta: (b.costEstimate ?? 0) - (a.costEstimate ?? 0),
      durationDelta: (b.durationMs ?? 0) - (a.durationMs ?? 0),
      stepCountDelta: stepsB.length - stepsA.length,
    },
  };
}
