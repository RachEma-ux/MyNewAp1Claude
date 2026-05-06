/**
 * AI Agent Studio — Chat Service
 *
 * Phase 19 follow-up: dedicated multi-turn chat interface for Agent
 * Studio agents. Like OpenCode's chat view but scoped to the Studio
 * module's agents (ags_*).
 *
 * Architecture:
 *   - Sessions persist in ags_chat_sessions (one per conversation)
 *   - Messages persist in ags_chat_messages (user, assistant, tool)
 *   - Each sendMessage call:
 *       1. Persists the user message
 *       2. Loads the full message history (for context)
 *       3. Builds the LLM request: system prompt from draft.system
 *          Instructions + draft.roleInstructions, then all past
 *          messages, then the new user message
 *       4. Calls runViaOpenAIDirect (same adapter the simulation
 *          engine uses) — no openllm-agent2 required
 *       5. Persists the assistant response + updates session totals
 *       6. Returns the assistant message to the client
 *
 * Key differences from simulation:
 *   - Multi-turn (message history accumulates across calls)
 *   - No step timeline (chat is just user/assistant message pairs)
 *   - No governance dispatcher (for MVP — can layer it in later
 *     by routing tool calls through dispatchMcpToolCall)
 *   - Persistent (chat survives page reloads via asdb storage)
 *
 * MVP scope: text-only, no tool calls, no streaming. Tool calls and
 * streaming are both additive follow-ups that don't change the data
 * model — tool calls become role="tool" messages, streaming wraps
 * the same runViaOpenAIDirect call with an onToken callback.
 */

// Phase 27.5 — `openai` SDK + `resolveProviderApiKey` + `Message` from
// the legacy provider-types are no longer imported here. Direction A is
// now exclusive on this file: the binding-aware paths are the only ones,
// and both go through `gatewayCall("openRouter.modelAccess.execute")`.
import * as repo from "../repository";
import { dispatchMcpToolCall } from "./mcp/dispatcher";
import { getSnapshot } from "./mcp/registry";
import { getAgentProviderBinding } from "../bindings";
import { gatewayCall } from "../../platform/modules/module-gateway";
import type {
  ModelAccessExecuteInput,
  ModelAccessMessage,
  ModelAccessResult,
  ModelAccessToolCall,
} from "../../openrouter/model-access/types";
import { evaluateProviderUsePolicy } from "./provider-use-governance";
import { resolveCagPack } from "./cag";
import {
  composeSystemPrompt,
  CagRequiredError,
  type ComposerMode,
} from "./runtime/system-prompt-composer";

export interface SendChatMessageInput {
  sessionId: number;
  userMessage: string;
}

export interface SendChatMessageResult {
  ok: boolean;
  assistantMessage?: {
    id: number;
    content: string;
    inputTokens: number;
    outputTokens: number;
    costMicrocents: number;
    durationMs: number;
    model: string;
  };
  error?: string;
  /**
   * Phase 27.5 — structured error code for the binding-required
   * degraded state. UIs key off this to render an inline link to the
   * Phase 14 picker rather than just the human-readable error string.
   */
  code?: "binding_required" | "binding_missing_model" | string;
}

// ── Tool-call helpers (Phase 19 follow-up Task #5) ───────────────────────────

/**
 * OpenAI function tool names must match ^[a-zA-Z0-9_-]{1,64}$. MCP tool
 * names routinely contain dots (e.g. `studio.echo`, `fs.read_file`) and
 * our dispatcher key format `mcp__server__tool` contains double-
 * underscores. We build a Map from OpenAI-safe name → dispatch key so
 * we don't have to reverse-parse on callback.
 */
function sanitizeOpenAIToolName(raw: string): string {
  // Allowed: a-z A-Z 0-9 _ -
  // Replace anything else with _. If the result starts with a digit,
  // prepend `t_`. Clamp to 64 chars.
  let out = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (/^[0-9]/.test(out)) out = "t_" + out;
  if (out.length > 64) out = out.slice(0, 64);
  return out;
}

interface ChatToolSpec {
  /** Name passed to OpenAI */
  openaiName: string;
  /** Dispatcher key `mcp__<serverName>__<remoteToolName>` */
  dispatchKey: string;
  /** OpenAI tool schema */
  schema: {
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  };
}

/**
 * Build OpenAI function tool schemas from every MCP server attached to
 * the draft, gated by the registry (only CONNECTED servers publish
 * snapshots). Returns an empty array when no tools are available; the
 * caller then runs a no-tools completion.
 */
async function buildToolsForDraft(draftId: number): Promise<ChatToolSpec[]> {
  const servers = await repo.listMcpServers(draftId);
  const specs: ChatToolSpec[] = [];
  const takenNames = new Set<string>();
  for (const server of servers) {
    if (!server.enabled) continue;
    const snap = getSnapshot(server.id);
    if (!snap) continue; // server not connected yet
    for (const tool of snap.tools) {
      const dispatchKey = `mcp__${server.name}__${tool.name}`;
      let openaiName = sanitizeOpenAIToolName(`${server.name}__${tool.name}`);
      // Handle collisions on the sanitized name
      let suffix = 1;
      const base = openaiName;
      while (takenNames.has(openaiName)) {
        openaiName = `${base}_${suffix++}`.slice(0, 64);
      }
      takenNames.add(openaiName);
      // Default parameters schema if the tool doesn't publish one
      const parameters =
        (tool.inputSchema && typeof tool.inputSchema === "object")
          ? (tool.inputSchema as Record<string, unknown>)
          : { type: "object", properties: {} };
      specs.push({
        openaiName,
        dispatchKey,
        schema: {
          type: "function",
          function: {
            name: openaiName,
            description: tool.description,
            parameters,
          },
        },
      });
    }
  }
  return specs;
}

/**
 * Maximum number of tool-call turns before we force-stop the loop and
 * ask the model to finalize. Prevents infinite loops when the model
 * keeps calling tools instead of answering.
 */
const MAX_TOOL_TURNS = 6;


/**
 * Start a new chat session attached to an agent, with an optional
 * initial user message. Returns the created session id.
 */
export async function startChatSession(input: {
  agentId: number;
  title?: string;
}): Promise<{ sessionId: number }> {
  // Resolve the agent's current draft so we can snapshot the provider
  // config at session start (reproducibility: if the user later edits
  // the draft, existing sessions still show the model they were run
  // against).
  const draft = await repo.getCurrentDraft(input.agentId);
  const providerSnapshot = (draft?.providerConfig ?? {}) as Record<string, unknown>;
  const session = await repo.createChatSession({
    agentId: input.agentId,
    title: input.title,
    providerSnapshot,
  });
  return { sessionId: session.id };
}

/**
 * Plan v3 Phase 18 — binding-driven tool-call loop.
 *
 * Mirrors the legacy `runChatWithTools` but routes each turn through
 * `openRouter.modelAccess.execute` via the platform gateway instead
 * of `new OpenAI({apiKey})`. Closes LR-01 for tool-equipped chats:
 * Agent Studio never holds a raw key; Model Access pulls credentials
 * inside its D2 boundary.
 *
 * Exit conditions are identical to the legacy loop:
 *   - Final assistant message with no further tool_calls → return.
 *   - MAX_TOOL_TURNS reached → write a synthetic "(loop stopped…)"
 *     assistant message and return.
 *
 * The dispatcher (`dispatchMcpToolCall`) is unchanged — Phase 18 is
 * about the model-call boundary, not the MCP tool side.
 */
async function runChatWithToolsViaBinding(input: {
  sessionId: number;
  draftId: number;
  providerConnectionId: number;
  modelRef: string;
  systemPrompt: string;
  tools: ChatToolSpec[];
  workspaceId: number;
  actorId: number;
  temperature: number;
  maxTokens?: number;
  /** Plan v3 Phase 21 — passed through so the policy gate has refs. */
  binding: import("../bindings").AgentProviderBindingPublic;
}) {
  const dispatchKeyByOpenaiName = new Map<string, string>(
    input.tools.map((t) => [t.openaiName, t.dispatchKey]),
  );
  const toolSchemas = input.tools.map((t) => t.schema);

  // Plan v3 Phase 21 — provider-use governance. Scan the static
  // history once at loop entry; subsequent turns only add server-
  // controlled tool outputs, so a re-scan would be redundant.
  {
    const initialHistory = await repo.listChatMessages(input.sessionId);
    const initialMessages = [
      { role: "system", content: input.systemPrompt },
      ...initialHistory.map((m: any) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : "",
      })),
    ];
    const policy = await evaluateProviderUsePolicy({
      binding: input.binding,
      messages: initialMessages,
    });
    if (policy.ok === false) {
      throw new Error(`${policy.reason}: ${policy.detail}`);
    }
  }

  const startMs = Date.now();
  let cumulativeInputTokens = 0;
  let cumulativeOutputTokens = 0;
  let cumulativeCostMicrocents = 0;
  // Cost is not surfaced by Model Access in Phase 4 / 18 — leave at 0
  // and let Phase 20+ pricing rollup populate it.

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const history = await repo.listChatMessages(input.sessionId);
    const messages: ModelAccessMessage[] = [
      { role: "system", content: input.systemPrompt },
    ];
    for (const m of history) {
      if (m.role === "user") {
        messages.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        const tp = (m.toolPayload ?? null) as any;
        // toolPayload here may be either:
        //   - {toolCalls: [...]} (new Phase 18 binding path) where each
        //     call is already in {id, name, arguments} shape, OR
        //   - {toolCalls: [...]} (legacy OpenAI shape) with
        //     {id, type:"function", function:{name, arguments}} entries.
        // We accept both: normalize to the Phase 18 shape.
        if (tp?.toolCalls && Array.isArray(tp.toolCalls)) {
          const normalized: ModelAccessToolCall[] = tp.toolCalls.map((c: any) => {
            if (c?.function?.name) {
              return {
                id: c.id ?? "",
                name: c.function.name,
                arguments:
                  typeof c.function.arguments === "string"
                    ? c.function.arguments
                    : JSON.stringify(c.function.arguments ?? {}),
              };
            }
            return {
              id: c?.id ?? "",
              name: c?.name ?? "",
              arguments:
                typeof c?.arguments === "string"
                  ? c.arguments
                  : JSON.stringify(c?.arguments ?? {}),
            };
          });
          messages.push({
            role: "assistant",
            content: m.content || "",
            toolCalls: normalized,
          });
        } else {
          messages.push({ role: "assistant", content: m.content });
        }
      } else if (m.role === "tool") {
        const tp = (m.toolPayload ?? null) as any;
        messages.push({
          role: "tool",
          content: m.content,
          toolCallId: tp?.toolCallId ?? "",
        });
      }
    }

    const executeInput: ModelAccessExecuteInput = {
      providerConnectionId: input.providerConnectionId,
      modelRef: input.modelRef,
      messages,
      tools: toolSchemas,
      intent: "chat",
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      temperature: input.temperature,
      tokenBudget: input.maxTokens,
    };

    const result: ModelAccessResult = await gatewayCall<
      ModelAccessExecuteInput,
      ModelAccessResult
    >({
      ctx: {
        sourceModule: "agentStudio",
        targetModule: "openRouter",
        actionKey: "openRouter.modelAccess.execute",
        actorId: input.actorId,
        workspaceId: input.workspaceId,
        // Plan v3 Phase 20 — see RECEIPT_POLICY.md. Per-turn receipt
        // id is fine for the tool-loop; Phase 21 will register a
        // single receipt for the whole loop.
        governanceReceiptId: `chat-tools-${input.sessionId}-t${turn}-${Date.now()}`,
      },
      input: executeInput,
    });

    if (result.status !== "ok") {
      throw new Error(result.error ?? "Model Access returned status=error");
    }

    cumulativeInputTokens += result.usage?.inputTokens ?? 0;
    cumulativeOutputTokens += result.usage?.outputTokens ?? 0;

    const toolCalls = result.toolCalls;
    if (toolCalls && toolCalls.length > 0) {
      // Persist the assistant turn carrying the tool_calls.
      await repo.appendChatMessage({
        sessionId: input.sessionId,
        role: "assistant",
        content: result.output ?? "",
        toolPayload: { toolCalls },
        model: input.modelRef,
      });

      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.arguments);
        } catch {
          args = {};
        }
        const dispatchKey = dispatchKeyByOpenaiName.get(call.name);
        if (!dispatchKey) {
          await repo.appendChatMessage({
            sessionId: input.sessionId,
            role: "tool",
            content: JSON.stringify({ error: `unknown tool: ${call.name}` }),
            toolPayload: { toolCallId: call.id, name: call.name },
          });
          continue;
        }
        const dispatchResult = await dispatchMcpToolCall({
          agentDraftId: input.draftId,
          toolName: dispatchKey,
          args,
          source: "live_runtime",
        });
        const toolContent = dispatchResult.ok
          ? JSON.stringify(dispatchResult.result ?? null)
          : JSON.stringify({
              error: dispatchResult.error?.message ?? "dispatch failed",
              code: dispatchResult.error?.code,
            });
        await repo.appendChatMessage({
          sessionId: input.sessionId,
          role: "tool",
          content: toolContent,
          toolPayload: { toolCallId: call.id, name: call.name },
        });
      }
      continue;
    }

    // No tool calls — final answer.
    const finalContent = result.output ?? "";
    const durationMs = Date.now() - startMs;
    const assistantRow = await repo.appendChatMessage({
      sessionId: input.sessionId,
      role: "assistant",
      content: finalContent,
      inputTokens: cumulativeInputTokens,
      outputTokens: cumulativeOutputTokens,
      costMicrocents: cumulativeCostMicrocents,
      model: input.modelRef,
      durationMs,
    });
    return {
      assistantRow,
      inputTokens: cumulativeInputTokens,
      outputTokens: cumulativeOutputTokens,
      costMicrocents: cumulativeCostMicrocents,
      durationMs,
      content: finalContent,
    };
  }

  // Max turns hit.
  const durationMs = Date.now() - startMs;
  const capMsg = `(Tool loop stopped after ${MAX_TOOL_TURNS} turns without a final answer.)`;
  const assistantRow = await repo.appendChatMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: capMsg,
    inputTokens: cumulativeInputTokens,
    outputTokens: cumulativeOutputTokens,
    costMicrocents: cumulativeCostMicrocents,
    model: input.modelRef,
    durationMs,
  });
  return {
    assistantRow,
    inputTokens: cumulativeInputTokens,
    outputTokens: cumulativeOutputTokens,
    costMicrocents: cumulativeCostMicrocents,
    durationMs,
    content: capMsg,
  };
}

/**
 * Plan v3 Phase 17 — binding-driven Expert chat path.
 *
 * Resolves the agent's provider/model binding, then sends the
 * conversation through `openRouter.modelAccess.execute` via the
 * platform gateway. Closes LR-01 for binding-equipped agents:
 * Agent Studio never sees a raw key — Model Access pulls the
 * credential through `withProviderCredential` inside the OpenRouter
 * boundary, and only the no-secret reference projection crosses the
 * module wire.
 *
 * Scope (intentional):
 *   - No-tools path only. Tool-call round-tripping requires Model
 *     Access to expose `toolCalls` on the result + a typed tool
 *     schema on the input, which is Phase 18 work (per
 *     `model-access/types.ts:35-44`). For agents with attached MCP
 *     tools, `sendChatMessage` keeps using the legacy tool-loop
 *     until that lands.
 *   - Hosted-provider bindings only. Local-provider bindings
 *     (`providerConnectionId=null`) still flow through the legacy
 *     path — Model Access has no local adapter yet.
 *
 * Returns the same SendChatMessageResult shape as the legacy path
 * so the caller (the tRPC mutation) doesn't need to branch on which
 * path served the request.
 */
async function sendChatMessageViaBinding(
  input: SendChatMessageInput,
  ctx: {
    sessionId: number;
    agentId: number;
    draftId: number;
    workspaceId: number;
    actorId: number;
    systemPrompt: string;
    sessionTitle: string | null;
  },
): Promise<SendChatMessageResult> {
  const binding = await getAgentProviderBinding(ctx.draftId, "primary");
  if (!binding) {
    return {
      ok: false,
      error: "No provider binding configured for this agent. Open the binding picker first.",
    };
  }
  if (binding.status !== "binding_v1") {
    return {
      ok: false,
      error: `Binding status is "${binding.status}" — resolve via the picker before chatting.`,
    };
  }
  if (binding.providerConnectionId === null) {
    return {
      ok: false,
      error:
        "Local-provider bindings can't yet route through Model Access. Use a hosted Provider Connection or wait for the Phase 18 chat upgrade.",
    };
  }

  const history = await repo.listChatMessages(input.sessionId);
  const messages: ModelAccessMessage[] = [
    { role: "system", content: ctx.systemPrompt },
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map<ModelAccessMessage>((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  ];

  // Plan v3 Phase 21 — provider-use governance.
  const policy = await evaluateProviderUsePolicy({
    binding,
    messages,
  });
  if (policy.ok === false) {
    return {
      ok: false,
      error: `${policy.reason}: ${policy.detail}`,
    };
  }

  const executeInput: ModelAccessExecuteInput = {
    providerConnectionId: binding.providerConnectionId,
    modelRef: binding.modelRef,
    messages,
    intent: "chat",
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
  };

  let result: ModelAccessResult;
  try {
    result = await gatewayCall<ModelAccessExecuteInput, ModelAccessResult>({
      ctx: {
        sourceModule: "agentStudio",
        targetModule: "openRouter",
        actionKey: "openRouter.modelAccess.execute",
        actorId: ctx.actorId,
        workspaceId: ctx.workspaceId,
        // Plan v3 Phase 20 — `intent="chat"` requires a governance
        // receipt per RECEIPT_POLICY.md. We mint a per-message
        // receipt id stitched from the session id + timestamp; the
        // full receipts pipeline (Phase 21) will replace this with
        // a registered receipt row, but the id-shape contract is
        // stable in the meantime.
        governanceReceiptId: `chat-${ctx.sessionId}-${Date.now()}`,
      },
      input: executeInput,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (result.status !== "ok" || result.output == null) {
    return {
      ok: false,
      error: result.error ?? "Model Access returned status=error",
    };
  }

  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;
  // Cost is not surfaced by Model Access in Phase 4 — leave as 0
  // (Phase 19+ feeds usage rollup into pricing). The session totals
  // will accumulate accurately for token counts even without cost.
  const costMicrocents = 0;
  const durationMs = result.latencyMs;

  const assistantRow = await repo.appendChatMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: result.output,
    inputTokens,
    outputTokens,
    costMicrocents,
    model: binding.modelRef,
    durationMs,
  });

  const autoTitle =
    !ctx.sessionTitle && input.userMessage
      ? input.userMessage.slice(0, 60).trim()
      : undefined;
  await repo.bumpChatSessionTotals({
    sessionId: input.sessionId,
    addInputTokens: inputTokens,
    addOutputTokens: outputTokens,
    addCostMicrocents: costMicrocents,
    addMessages: 2,
    title: autoTitle,
  });

  return {
    ok: true,
    assistantMessage: {
      id: assistantRow.id,
      content: result.output,
      inputTokens,
      outputTokens,
      costMicrocents,
      durationMs,
      model: binding.modelRef,
    },
  };
}

/**
 * Send a user message in an existing chat session, get the
 * assistant's response, persist both, and return the assistant
 * message. Errors are returned in the result shape rather than
 * thrown so the caller can surface them in the UI without a
 * separate error-handling code path.
 *
 * Plan v3 Phase 17 routing:
 *   - If the agent has a `binding_v1` binding to a hosted provider
 *     AND no MCP tools are attached, the call routes through
 *     `sendChatMessageViaBinding` (Model Access). NO raw key in
 *     Agent Studio.
 *   - Otherwise (no binding, local-provider binding, or tool-equipped
 *     agent), falls back to the legacy direct-OpenAI path. The
 *     LR-01 surface shrinks to those cases until Phase 18 lifts the
 *     tool-loop into Model Access.
 */
export async function sendChatMessage(
  input: SendChatMessageInput,
  options: { workspaceId?: number; actorId?: number } = {},
): Promise<SendChatMessageResult> {
  // 1. Load the session + its parent agent's draft
  const session = await repo.getChatSessionById(input.sessionId);
  if (!session) {
    return { ok: false, error: `Chat session ${input.sessionId} not found` };
  }
  const draft = await repo.getCurrentDraft(session.agentId);
  if (!draft) {
    return {
      ok: false,
      error: `Agent ${session.agentId} has no current draft`,
    };
  }

  // 2. Persist the user message FIRST so it's saved even if the LLM
  //    call fails afterward
  await repo.appendChatMessage({
    sessionId: input.sessionId,
    role: "user",
    content: input.userMessage,
  });

  // RAC P1C — single composer (D-PRM-1). Replaces the legacy
  // [systemInstructions + roleInstructions] concat. Mode=disabled
  // preserves byte-equivalent output (golden-tested).
  const cagMode = (process.env.CAG_MODE as ComposerMode) ?? "safe_degraded";
  let cagSection = null;
  let cagWarnings: string[] = [];
  try {
    const resolved = await resolveCagPack({
      workspaceId: options.workspaceId ?? 1,
      agentId: (draft as any).agentId ?? draft.id,
      agentDraftId: draft.id,
      actorId: options.actorId ?? 1,
      mode: cagMode,
    });
    cagSection = resolved.section;
    cagWarnings = resolved.warnings;
  } catch (err) {
    if (err instanceof CagRequiredError) {
      throw err; // caller maps to chat error response
    }
    throw err;
  }
  const composedForBinding = composeSystemPrompt({
    mode: cagMode,
    draft: {
      name: (draft as any).name ?? null,
      role: (draft as any).role ?? null,
      scope: (draft as any).scope ?? null,
      mission: (draft as any).mission ?? null,
      systemInstructions: draft.systemInstructions ?? null,
      roleInstructions: draft.roleInstructions ?? null,
      policyInstructions: (draft as any).policyInstructions ?? null,
      successCriteria: (draft as any).successCriteria ?? null,
      escalationRules: (draft as any).escalationRules ?? null,
    },
    capabilityPack: cagSection,
    retrievalEvidence: null,
  });
  for (const w of cagWarnings) console.info(`[chat/cag] ${w}`);
  for (const w of composedForBinding.warnings) console.info(`[chat/composer] ${w}`);
  const systemPromptForBinding = composedForBinding.text;

  // Plan v3 Phase 17/18: prefer the binding-driven Model Access path
  // whenever a binding_v1 row exists for this draft AND it points at
  // a hosted Provider Connection. The Phase 18 tool-call schema on
  // Model Access lets us route tool-equipped chats through the same
  // binding path — no special case for tools any more.
  //
  // Falls through to the legacy OpenAI-direct path only when:
  //   - no binding row exists,
  //   - the binding is not `binding_v1` (legacy_unresolved / disabled),
  //   - the binding is local-provider (providerConnectionId=null —
  //     Model Access has no local adapter yet).
  try {
    const candidateBinding = await getAgentProviderBinding(draft.id, "primary");
    const canUseBindingPath =
      candidateBinding !== null &&
      candidateBinding.status === "binding_v1" &&
      candidateBinding.providerConnectionId !== null;
    if (canUseBindingPath) {
      const toolSpecsForRouting = await buildToolsForDraft(draft.id);
      if (toolSpecsForRouting.length > 0) {
        // Phase 18: tool-equipped binding chat. Mirrors the legacy
        // tool-loop but each turn is a Model Access call.
        const wsId = options.workspaceId ?? 1;
        const actor = options.actorId ?? 1;
        const tempForLoop =
          typeof (draft.providerConfig as any)?.temperature === "number"
            ? (draft.providerConfig as any).temperature
            : 0.2;
        const maxTokensForLoop =
          typeof (draft.providerConfig as any)?.maxTokens === "number"
            ? (draft.providerConfig as any).maxTokens
            : undefined;
        const preLoopCount = (
          await repo.listChatMessages(input.sessionId)
        ).length;
        try {
          const loopResult = await runChatWithToolsViaBinding({
            sessionId: input.sessionId,
            draftId: draft.id,
            providerConnectionId: candidateBinding.providerConnectionId!,
            modelRef: candidateBinding.modelRef,
            systemPrompt: systemPromptForBinding,
            tools: toolSpecsForRouting,
            workspaceId: wsId,
            actorId: actor,
            temperature: tempForLoop,
            maxTokens: maxTokensForLoop,
            binding: candidateBinding,
          });
          const postCount = (await repo.listChatMessages(input.sessionId))
            .length;
          // user turn (already persisted, not yet bumped) + everything
          // the loop wrote. Same delta the legacy tool path computes.
          const addedMessages = 1 + (postCount - preLoopCount);
          const autoTitle =
            !session.title && input.userMessage
              ? input.userMessage.slice(0, 60).trim()
              : undefined;
          await repo.bumpChatSessionTotals({
            sessionId: input.sessionId,
            addInputTokens: loopResult.inputTokens,
            addOutputTokens: loopResult.outputTokens,
            addCostMicrocents: loopResult.costMicrocents,
            addMessages: addedMessages,
            title: autoTitle,
          });
          return {
            ok: true,
            assistantMessage: {
              id: loopResult.assistantRow.id,
              content: loopResult.content,
              inputTokens: loopResult.inputTokens,
              outputTokens: loopResult.outputTokens,
              costMicrocents: loopResult.costMicrocents,
              durationMs: loopResult.durationMs,
              model: candidateBinding.modelRef,
            },
          };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
      return sendChatMessageViaBinding(input, {
        sessionId: input.sessionId,
        agentId: session.agentId,
        draftId: draft.id,
        workspaceId: options.workspaceId ?? 1,
        actorId: options.actorId ?? 1,
        systemPrompt: systemPromptForBinding,
        sessionTitle: session.title ?? null,
      });
    }
  } catch {
    // Routing probe failed — fall through to the binding-required
    // error response below. Phase 27.5 closes the legacy raw-key
    // fallback that previously lived here.
  }

  // Phase 27.5 — binding-required path. The legacy fallback that
  // resolved a raw provider key from `providerConfig.apiKey` /
  // `apiKeyEnvVar` / `process.env` and called `new OpenAI({apiKey})`
  // (or `OpenAIProvider`) is removed. Non-binding agents now get a
  // structured `binding_required` error pointing them at the
  // Phase 14 picker UI.
  //
  // The Phase 27.5a migration helper at
  //   scripts/agent-studio/create-provider-bindings-for-legacy-agents.ts
  // exists to drain legacy fixtures into binding rows; deferred 27.5b
  // will delete the helper itself once no environment depends on it.
  return {
    ok: false,
    error:
      "No active provider binding configured for this agent. " +
      "Open the Provider Binding page in Agent Studio and bind a provider/model " +
      "from the AI Types catalog before sending a chat message.",
    code: "binding_required",
  } as SendChatMessageResult;
}
