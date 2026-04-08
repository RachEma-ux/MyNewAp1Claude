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
    toggles,
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
      steps.push({
        index: stepIdx++,
        type: "tool_call",
        label: `${toggles.mockedTools ? "Mock" : "Live"} call: ${t.toolName}`,
        payload: {
          toolKey: t.toolKey,
          kind: catalogEntry?.category ?? "unknown",
          mocked: toggles.mockedTools,
          approvalRequired: t.requiresApproval,
          destructive: isDestructive,
          result: toggles.mockedTools
            ? { ok: true, mock: true }
            : { ok: true, executed: true },
        },
        verdict,
        durationMs: 30,
      });
      cost += 10;
      // Trace event so the runs page Tools tab has data
      await repo.appendRuntimeToolCall({
        runId: runtimeRun.id,
        toolKey: t.toolKey,
        requestPayload: { mocked: toggles.mockedTools, kind: catalogEntry?.category },
        responsePayload: { verdict, destructive: isDestructive },
        verdict,
        durationMs: 30,
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

      // Phase 1c: Pull the draft's permission rules and turn them into a
      // resolver the adapter can call once per `permission_request`. This
      // replaces the Phase 1b auto-deny default. Tracks per-request
      // decisions so the trace below records what actually happened.
      const permissionRules = await repo.listPermissionRules(draft.id);
      const baseResolver = buildPermissionResolver(permissionRules);
      const decisionLog: Array<{ ts: number; decision: PermissionDecision; toolName: string }> = [];
      const trackingResolver: PermissionResolver = (request) => {
        const decision = baseResolver(request);
        decisionLog.push({
          ts: Date.now(),
          decision,
          toolName: request.toolName ?? request.toolKey ?? "(unknown)",
        });
        return decision;
      };

      const liveResult = await runViaOpenllmAgent({
        wsUrl: endpoint.wsUrl,
        message: inputText,
        provider: endpoint.provider,
        model: endpoint.model,
        apiKey: endpoint.apiKey,
        timeoutMs: 60_000,
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

      // Phase 1c: Persist permission events from the live run as runtime
      // policy events. The decision recorded is the actual one returned by
      // the resolver (allow/deny/needs_human → allow/deny/warn), not the
      // Phase 1b blanket deny. Pair each event with the matching log entry
      // by index — the adapter emits permission_request and resolver
      // calls in lockstep.
      for (let i = 0; i < liveResult.permissionEvents.length; i++) {
        const ev = liveResult.permissionEvents[i];
        const logged = decisionLog[i];
        const decision: PermissionDecision = logged?.decision ?? "deny";
        const persistedDecision =
          decision === "allow"
            ? "allow"
            : decision === "needs_human"
              ? "warn"
              : "deny";
        const reason =
          decision === "allow"
            ? `Allowed by permission rule for ${logged?.toolName ?? "(unknown tool)"}`
            : decision === "needs_human"
              ? `Rule says "ask" but no interactive UI yet — denied for safety, surfaced as needs-human (${logged?.toolName ?? "(unknown tool)"})`
              : `Denied by permission rules (${logged?.toolName ?? "(unknown tool)"})`;
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
  // Finalize the runtime run too — same status, summary, output
  await repo.updateRuntimeRun(runtimeRun.id, {
    status: aborted ? "failed" : "completed",
    summary,
    durationMs,
    finishedAt: new Date(),
    outputPayload: { simulationRunId: run.id, verdict, aborted },
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
