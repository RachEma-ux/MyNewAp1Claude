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
import { fireHooksForEvent } from "./hook-runner";
import * as mcpManager from "./mcp/mcp-manager";
import { getToolCatalogEntry } from "../adapters/tool-catalog-adapter";
import { previewRetrieval } from "../adapters/knowledge-adapter";
import {
  resolveOpenllmEndpoint,
  runViaOpenllmAgent,
  type PermissionDecision,
  type PermissionResolver,
} from "../adapters/openllm-runtime-adapter";

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
        if (toggles.strictPolicy) aborted = true;
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

      // Phase 17a: MCP tool execution.
      // If the tool key matches the mcp__<server>__<tool> pattern AND
      // mockedTools is false, route the call through the MCP manager.
      // The connected MCP server actually executes the tool and returns
      // a result, which we record in the trace exactly like a normal
      // tool call. This is the simulation-mode unlock — the live
      // openllm-agent2 path is upstream-blocked because its WS bridge
      // hardcodes mcpClients: [] in headless-engine.ts:419.
      let mcpResult: unknown = null;
      let mcpError: string | null = null;
      let mcpDurationMs = 30;
      const isMcpTool = t.toolKey.startsWith("mcp__");
      if (isMcpTool && !toggles.mockedTools) {
        // Decode "mcp__<serverName>__<toolName>" — server name may
        // contain underscores so we split on the FIRST "__" only.
        const rest = t.toolKey.slice("mcp__".length);
        const sepIdx = rest.indexOf("__");
        if (sepIdx > 0) {
          const serverName = rest.slice(0, sepIdx);
          const remoteToolName = rest.slice(sepIdx + 2);
          // Look up the per-draft MCP server with this name to get its id
          const draftServers = await repo.listMcpServers(draft.id);
          const targetServer = draftServers.find(
            (s) => s.name === serverName
          );
          if (!targetServer) {
            mcpError = `MCP server "${serverName}" not attached to this draft`;
            verdict = "warning";
          } else {
            const mcpStart = Date.now();
            try {
              mcpResult = await mcpManager.callMcpTool({
                serverId: targetServer.id,
                toolName: remoteToolName,
                args: {},
              });
              mcpDurationMs = Date.now() - mcpStart;
            } catch (e) {
              mcpError = e instanceof Error ? e.message : String(e);
              mcpDurationMs = Date.now() - mcpStart;
              verdict = "warning";
            }
          }
        } else {
          mcpError = `Malformed MCP tool key: ${t.toolKey}`;
          verdict = "warning";
        }
      }

      steps.push({
        index: stepIdx++,
        type: "tool_call",
        label: isMcpTool
          ? `${toggles.mockedTools ? "Mock" : "MCP"} call: ${t.toolName}`
          : `${toggles.mockedTools ? "Mock" : "Live"} call: ${t.toolName}`,
        payload: {
          toolKey: t.toolKey,
          kind: catalogEntry?.category ?? (isMcpTool ? "mcp" : "unknown"),
          mocked: toggles.mockedTools,
          approvalRequired: t.requiresApproval,
          destructive: isDestructive,
          result: mcpError
            ? { ok: false, error: mcpError, source: "mcp" }
            : isMcpTool && !toggles.mockedTools
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
          isMcp: isMcpTool,
        },
        responsePayload: mcpError
          ? { verdict, destructive: isDestructive, mcpError }
          : isMcpTool && !toggles.mockedTools
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
    const endpoint = resolveOpenllmEndpoint(providerConfig);
    const useLiveRuntime = !toggles.mockedTools && endpoint !== null;

    let responsePreview: string;
    let outputDurationMs = 18;
    const outputPayload: Record<string, unknown> = {
      contract: draft.outputContract ?? "(no contract defined)",
      refusalBehavior: draft.refusalBehavior ?? null,
    };

    if (useLiveRuntime && endpoint) {
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
          await repo.decidePendingPermissionRequest({
            requestId: pending.id,
            status: "timed_out",
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

      // Phase 3: WS timeout must accommodate the worst case where the
      // agent issues a permission_request that goes to "ask" and a human
      // takes the full 5-minute permission poll window to respond. We use
      // 6 minutes here to give 1 minute of slack for the rest of the run.
      const liveResult = await runViaOpenllmAgent({
        wsUrl: endpoint.wsUrl,
        message: inputText,
        provider: endpoint.provider,
        model: endpoint.model,
        apiKey: endpoint.apiKey,
        timeoutMs: 6 * 60 * 1000,
        permissionResolver: trackingResolver,
      });

      if (liveResult.ok) {
        responsePreview = liveResult.text || "(empty response)";
        outputDurationMs = liveResult.durationMs;
        outputPayload.live = true;
        outputPayload.runtimeSource = endpoint.source;
        outputPayload.wsUrl = endpoint.wsUrl;
        outputPayload.provider = endpoint.provider ?? null;
        outputPayload.model = endpoint.model ?? null;
        outputPayload.tokenCount = liveResult.tokenCount;
        outputPayload.permissionRequestCount = liveResult.permissionEvents.length;
        outputPayload.policyEventCount = liveResult.policyEvents.length;
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
        outputPayload.runtimeSource = endpoint.source;
        outputPayload.wsUrl = endpoint.wsUrl;
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
        ? "Live response from openllm-agent2"
        : "Compose response per output contract",
      payload: outputPayload,
      verdict: draft.outputContract ? "pass" : "warning",
      durationMs: outputDurationMs,
    });
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
    output: { aborted, runtimeRunId: runtimeRun.id },
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
