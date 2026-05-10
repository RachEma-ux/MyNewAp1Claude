# Phase 1a — Runtime wiring map, sequence diagram, and boundary integrity matrix

**Roadmap reference:** `docs/implementation/agent-studio-runtime-hardening-roadmap.md` Phase 1a
**Date:** 2026-05-10
**Branch baseline:** `main @ 3d12d03`
**Audit type:** Read-only. No runtime behavior changes.

Read-only audit. Files cited use absolute repo paths. Cycle-5/6/7/8 closure facts referenced rather than re-derived.

---

## 1. Runtime wiring map

### 1.1 No-tool path (chat-stream SSE)

```
[User clicks Send in AgentStudioChatWindow / AgentChatPage]
  AgentStudioChatWindow.tsx:270 / AgentChatPage.tsx:182
    new EventSource("/api/agent-studio/chat/stream?sessionId=N&message=...")
      │
      ▼  HTTP GET (SSE)
[Express route]
  server/_core/index.ts:905
    app.get("/api/agent-studio/chat/stream", handleAgentStudioChatStream)
      │
      ▼
[Stream handler]
  chat-stream.ts:1051  handleAgentStudioChatStream
    ├─ chat-stream.ts:1066  setupSse(res)                               (SSE headers + flushHeaders)
    ├─ chat-stream.ts:1069  repo.getChatSessionById(sessionId)
    ├─ chat-stream.ts:1075  repo.getCurrentDraft(session.agentId)
    ├─ chat-stream.ts:1095  getAgentProviderBinding(draft.id, "primary")  (binding-required, fail-fast)
    ├─ chat-stream.ts:1136  repo.appendChatMessage(role:"user")           (persist user FIRST)
    ├─ chat-stream.ts:1150  buildRuntimeSystemPrompt(...)                 (RAC orchestrator entry)
    │     │
    │     ▼  rac-orchestrator.ts:485 buildRuntimeSystemPrompt
    │       ├─ rac-orchestrator.ts:311 resolveAndAssembleContext
    │       │     ├─ resolveCagPack()                  (services/cag — P1C)
    │       │     ├─ listProfilesForDraft / planRetrieval / executeRetrieval
    │       │     │   filterRetrieval / assembleRetrievalEvidence       (services/rac/* — P4/P5)
    │       │     └─ trace + sourceTrace populated
    │       └─ system-prompt-composer.ts:composeSystemPrompt(mode, draft, capabilityPack, retrievalEvidence)
    │           (D-PRM-1 single writer; throws CagRequiredError in strict)
    ├─ chat-stream.ts:1216  buildToolsForDraft(draft.id)                  (registry snapshot)
    │
    ├─ chat-stream.ts:1233  runPureStream(...)        ← 0 tools
    │     ├─ gatewayCall("openRouter.modelAccess.stream")
    │     │      → AsyncIterable<ModelAccessStreamChunk>
    │     ├─ for-await: sendEvent({type:"token"})
    │     └─ repo.appendChatMessage(role:"assistant")
    │
    ├─ chat-stream.ts:1305  writeTrace(...).then(writeContextBlocks).catch(...)
    │     services/rac/trace/store.ts:137  agsRacTraces / context blocks (FIRE-AND-FORGET; M6-c8)
    │
    └─ chat-stream.ts:1352  sendEvent({type:"done", assistantMessageId, usage, ...})
```

### 1.2 Tool-mode path

Same prelude as 1.1 through `buildToolsForDraft`; then:

```
chat-stream.ts:1219  runStreamingToolLoop(...)
  for turn in 0..MAX_TOOL_TURNS=6:                      chat-stream.ts:400
    ├─ repo.listChatMessages(sessionId)                 (rebuild history)
    ├─ chat-history-shape.ts: reconstructToolHistoryMessageOrLog (H5-c8 strict)
    ├─ context-window.ts: windowChatHistory(MAX_CONTEXT_TOKENS=32k)  (H8-c7)
    ├─ gatewayCall("openRouter.modelAccess.execute", stream:false)   chat-stream.ts:503
    │       (returns content + finishReason + toolCalls)
    ├─ sendEvent({type:"token", content})                            (degraded; one token/turn)
    │
    if toolCalls.length > 0:
      ├─ repo.appendChatMessage(role:"assistant", toolPayload:{toolCalls})  chat-stream.ts:556
      └─ for each toolCall:
            ├─ sendEvent({type:"tool_start", toolName, args})
            ├─ H7-c7 per-tool dispatch counter (MAX_CALLS_PER_TOOL_PER_REQUEST=3)
            ├─ proposed-tool-call-runtime.ts:97  validateRuntimeToolCall(...)   (Phase 8 validator)
            ├─ proposed-tool-call-runtime.ts:211 gateRuntimeDispatch(...)        (approval gate)
            │     └─ if approval_required/pending → approval-resume-loop.ts: awaitApprovalDecision(...)
            │           with onAwaiting:  sendEvent(AwaitingApprovalEvent)        (H4-c6)
            ├─ if !verdict.ok: persistRuntimeToolCallTrace + role="tool" reject row + tool_end ok:false
            │
            ├─ services/mcp/dispatcher.ts: dispatchMcpToolCall(runtimeRunId, approvalRequestId, caller)
            │     ├─ allowedTools auth         (dispatcher.ts:645)
            │     ├─ evaluateMcpPreInvoke      (governance-adapter)
            │     ├─ if riskClass=="code_execution" → sandbox.execute()  (D-SBX-3)
            │     │  else → conn.callTool(...)
            │     ├─ evaluateMcpPostInvoke
            │     └─ writeAuditRow → agsRuntimePolicyEvents (FATAL on null runtimeRunId per L5-c5)
            │
            ├─ persistRuntimeToolCallTrace → agsToolCallTraces       (BEST-EFFORT, L4-c5)
            ├─ repo.appendChatMessage(role:"tool", toolPayload)       (M5-c7 ordering: persist BEFORE SSE)
            └─ sendEvent({type:"tool_end", ok, result, durationMs})

  on max-turns: synthetic "(loop stopped after N turns)" assistant message
  on final assistant: appendChatMessage + writeTrace fire-and-forget + sendEvent({type:"done"})
```

### 1.3 Blocking-chat path (tRPC)

Mirrors the streaming path but synchronous:

```
client → trpc.agentStudio.chat.sendMessage.useMutation
  api/router.ts:2042  sendMessage protectedProcedure
    services/chat.ts:1044  sendChatMessage(input, {workspaceId, actorId})
      ├─ persist user (chat.ts:1063)
      ├─ buildRuntimeSystemPrompt (chat.ts:1084)        ← same orchestrator
      ├─ if binding_v1 + hosted + tools: runChatWithToolsViaBinding (chat.ts:338)
      │     └─ same gatewayCall + validator + gate + awaitApproval + dispatchMcpToolCall + traces
      ├─ else if binding_v1 + hosted + no-tools: sendChatMessageViaBinding (chat.ts:886)
      │     └─ single gatewayCall("openRouter.modelAccess.execute")
      └─ else: { ok:false, code:"binding_required" }    (chat.ts:1258, Phase 27.5)
```

### 1.4 Test-run-binding lane

`server/agent-studio/services/test-run-binding.ts:234` — single `gatewayCall("openRouter.modelAccess.execute")` only. **No tool wiring** (no `buildToolsForDraft`, no `dispatchMcpToolCall`, no validator/gate). System prompt comes from `buildRuntimeSystemPrompt` (services/test-run-binding.ts:47). Lane is intentionally tools-less per the file header comment.

### 1.5 Simulation lane

`server/agent-studio/services/simulation.ts:439` calls `dispatchMcpToolCall` directly with `source:"simulation"`. **Does NOT call `validateRuntimeToolCall` or `gateRuntimeDispatch`** — relies entirely on the dispatcher's internal `allowedTools` + `evaluateMcpPreInvoke` for governance; ProposedToolCall validator gates 1/2/7/8 are not run.

---

## 2. Sequence diagram — single tool-call turn (Path C, approval permitted)

```
UI                 chat-stream.ts          rac-orch  validator  gate  approval-loop  dispatcher  ASDB/MAIN
 │                       │                    │         │        │         │            │           │
 │  EventSource open ─►  │                    │         │        │         │            │           │
 │                       │ setupSse           │         │        │         │            │           │
 │                       │ getChatSessionById ├─────────────────────────────────────────────────────►│
 │                       │ getCurrentDraft    │         │        │         │            │           │
 │                       │ binding lookup     │         │        │         │            │           │
 │                       │ append user msg ───┼───────────────────────────────────────────────────► │
 │                       │ buildRuntime SysP ►│ resolveCagPack/RAC → composer            │           │
 │                       │ buildToolsForDraft │ (registry.getSnapshot)                    │           │
 │  ◄── (none yet)       │ runStreamingToolLoop()                                          │           │
 │                       │   gatewayCall(modelAccess.execute, stream:false) ──► (OpenRouter Model Access D2)
 │  ◄── token (turn out) │ ◄ result {output, toolCalls=[X]}                                │           │
 │                       │ append assistant(toolPayload) ────────────────────────────────────────────►│
 │  ◄── tool_start       │                                                                 │           │
 │                       │ H7-c7 counter inc                                                │           │
 │                       │ validateRuntimeToolCall ─► gates 1/2/7/8 + sandboxHealth         │           │
 │                       │ gateRuntimeDispatch ────────────────────────────► evaluateApprovalGate
 │                       │      verdict: approval_required (creates row)                                │
 │  ◄── awaiting_approval│ awaitApprovalDecision (300s window, AbortSignal C4-c6)                       │
 │  (operator approves out-of-band → approval-event-bus emits)                                          │
 │                       │ revalidate → gate=permit                                                     │
 │                       │ dispatchMcpToolCall(runtimeRunId=sessionId, approvalRequestId, caller) ──► [allowedTools→preInvoke→callTool|sandbox→postInvoke→writeAuditRow agsRuntimePolicyEvents (FATAL)]
 │                       │ persistRuntimeToolCallTrace ────────────────────────► agsToolCallTraces (BEST-EFFORT, L4-c5)
 │                       │ append role="tool" (M5-c7 BEFORE sendEvent) ──────────────────────────────►│
 │  ◄── tool_end ok=true │                                                                              │
 │                       │ (next turn — final assistant)                                                │
 │                       │ append assistant(content) ────────────────────────────────────────────────►│
 │                       │ writeTrace(...).then(writeContextBlocks).catch(...)  ◄ fire-and-forget M6-c8 │
 │  ◄── done             │                                                                              │
```

---

## 3. Boundary integrity matrix

| Boundary | Required behavior | Where enforced (file:line) | Status | Notes |
|---|---|---|---|---|
| **Model execution → OpenRouter Model Access only** (no raw provider SDKs in `server/agent-studio/**`) | Every model call goes through `gatewayCall({actionKey:"openRouter.modelAccess.execute"\|".stream"})` | chat-stream.ts:503, chat-stream.ts:983; chat.ts:511, chat.ts:953; test-run-binding.ts:234; simulation.ts:893 | **Observed** | Repo grep (`grep -rn "from ['openai']" server/agent-studio/`) returns zero hits. Only `server/providers/openai.ts` imports `openai` (legacy provider registry, outside Agent Studio). chat.ts:36 doc-block records Phase 29.0a deletion of `runViaOpenAIDirect`. |
| **Tool execution → MCP dispatcher chokepoint** (no path bypasses `dispatchMcpToolCall`) | All tool invocations call `dispatchMcpToolCall` | chat-stream.ts:798; chat.ts:745; simulation.ts:439; dispatcher.ts:6 doc-block | **Observed** for live runtime + simulation; **Inferred** for studio-mcp-server.ts (separate JSON-RPC server, not part of chat path) | Cycle-5 closure (`project_cycle_5_complete.md`) confirms dispatcher chokepoint locked; `mcpManager.callMcpTool` shim delegates here. |
| **ProposedToolCall validation before dispatch** | `validateRuntimeToolCall` runs before every `dispatchMcpToolCall` on chat paths | chat-stream.ts:682; chat.ts:626 | **Observed** for chat-stream + chat.ts; **NOT enforced** for simulation lane | simulation.ts:439 calls `dispatchMcpToolCall` with no preceding `validateRuntimeToolCall` / `gateRuntimeDispatch`. Validator gates 1/2/7/8 are only run on live chat — simulation relies on dispatcher's `allowedTools` + `evaluateMcpPreInvoke`. Gate 8 (sandbox prereq) is enforced inside the dispatcher itself (dispatcher.ts:708) so code-execution simulation still routes to sandbox; but invented-tool / argument-schema / quarantined-hard-block gates are **bypassed** in simulation. |
| **Approval gate honored when required** | `gateRuntimeDispatch` runs after validator; `approval_required`/`approval_pending` paths await operator decision via `awaitApprovalDecision` before dispatch | chat-stream.ts:691 + 716; chat.ts:635 + 659 | **Observed** for chat paths; **NOT enforced** for simulation + test-run-binding | Cycle-6 C1-c6 closure brought parallel-flow lockstep between chat-stream.ts and chat.ts. Simulation has no approval gate; test-run-binding has no tool path at all. |
| **Trace + audit writes always occur** | Every dispatch produces (a) `agsRuntimePolicyEvents` audit row (FATAL), and (b) `agsToolCallTraces` row (BEST-EFFORT) | dispatcher.ts:850 `writeAuditRow`; proposed-tool-call-runtime.ts:527 `persistRuntimeToolCallTrace`; rac/trace/store.ts:137 `writeTrace` (RAC end-of-stream) | **Observed** for chat paths under cycle-5 C1-c5 fix (runtimeRunId threaded). L4-c5 + C2-c7 + M6-c8 doc-blocks codify the fatal-audit / best-effort-trace asymmetry. M6-c8 fire-and-forget contract on RAC trace is intentional. **Inferred** for simulation: `dispatchMcpToolCall` runs with `runtimeRunId=runtimeRun.id` (simulation.ts:441), so audit row writes; but per-ProposedToolCall trace row (`agsToolCallTraces`) is **not** written in simulation. | One known absence: simulation lane skips `persistRuntimeToolCallTrace`, so per-PTC forensic surface is empty for simulation runs. End-of-stream RAC trace (`writeTrace` for `agsRacTraces`) only fires on chat-stream.ts:1308 — chat.ts (blocking) does NOT call `writeTrace` (cross-flow asymmetry, documented in chat.ts:692-706). |
| **Test-run-binding lane symmetry** | If lane runs tools, must use validator + gate + dispatcher | test-run-binding.ts (full file) | **Observed (vacuously)** | Lane is by-design tools-less — no `buildToolsForDraft`, no `dispatchMcpToolCall`. System prompt path uses the same `buildRuntimeSystemPrompt`. No bypass possible because no tool path exists. |
| **Simulation lane symmetry** | Should use validator + gate (parallel-flow lockstep) | simulation.ts:433-453 | **Observed bypass — Unverified whether intentional** | Simulation invokes the dispatcher directly without validator/gate. The dispatcher itself enforces `allowedTools` and `evaluateMcpPreInvoke`, so this is not a "tool dispatch with zero governance"; but ProposedToolCall validator gates and approval-gate codepaths are not exercised. The roadmap pre-flight #6 says "Test-run-binding of a published agent enforces fail-closed" — simulation isn't called out and currently has no `agentLifecycleState` plumbing. **Gap candidate for Phase 5b.** |
| **Static enforcement: boundary-lint exists?** | A `boundary-lint` script proves the boundaries cannot regress | scripts/check-cag-boundary.ts; scripts/check-provider-credential-resolver-boundary.ts; scripts/check-provider-key-env-boundary.ts; package.json:10 (`"check"`) and :40-45 (per-rule scripts) | **Observed (partial coverage); Unverified for some required rules** | What exists: (a) **CAG boundary** — Rules A/B/C in `check-cag-boundary.ts` enforce `services/cag/**` cannot import dispatcher/credential-resolver/encryption/RAG/vectordb (Rule A) and `services/rac/context-assembler` is only importable by `services/runtime/rac-orchestrator.ts` (Rule C). (b) **Provider credential boundary** — `check-provider-credential-resolver-boundary.ts` enforces only `server/openrouter/model-access/**` may import the resolver. (c) **Raw env-var key boundary** — `check-provider-key-env-boundary.ts` enforces dynamic `process.env[key]` reads. **Missing static rules called out in roadmap §1 Gate 6:** (1) "0 raw provider SDK calls inside Agent Studio runtime (`server/agent-studio/**`)" — no script greps `server/agent-studio/**` for `import openai \| @anthropic-ai/sdk \| google-genai`. Repo is currently clean by inspection but a future regression would not be lint-caught. (2) "100% permitted tool calls go through MCP dispatcher" — no script forbids direct `conn.callTool` outside `dispatcher.ts` (the constraint is doc-block-asserted in dispatcher.ts:6 but not lint-asserted). (3) "100% model-emitted tool calls validated before dispatch" — no script asserts `validateRuntimeToolCall` precedes every `dispatchMcpToolCall`. Same for "100% approval-required calls blocked until approved." Currently asserted by tests (`tests/agent-studio/dispatcher-audit-coverage.test.ts`, cycle-5/6/7/8 closure tests) rather than static lint. |
| **Published-agent fail-closed** | When `agent.lifecycle.state==="published"` and zero enabled rules → deny | not yet implemented | **Unverified / Not Applicable (Phase 5b)** | No `runtimeContext.agentLifecycleState` plumbing in chat-stream.ts, chat.ts, test-run-binding.ts, or simulation.ts. Roadmap explicitly schedules this for Phase 5a/5b. |

---

## 4. Cycle-closure cross-references (consumed, not re-derived)

- **Cycle-5** (`project_cycle_5_complete.md`): MCP dispatcher chokepoint + `runtimeRunId` threading + L4-c5 trace-vs-audit asymmetry. Closes "audit row never silently skipped on production paths." (See `dispatcher.ts:36-64` doc-block.)
- **Cycle-6** (`project_cycle_6_complete.md`): D-RESUME loop extracted to `awaitApprovalDecision`; chat-stream.ts and chat.ts both delegate (parallel-flow lockstep). H4-c6 exports `AwaitingApprovalEvent` SSE contract. C3-c6 fixes Gate 3 tool-knowledge set. (Consumed by §1.2 + §3 row "approval gate honored.")
- **Cycle-7** (`project_cycle_7_complete.md`): C1-c7 dispatcher error sanitization; H1-c7 conn.callTool timeout race; H7-c7 MAX_CALLS_PER_TOOL_PER_REQUEST=3; H8-c7 MAX_CONTEXT_TOKENS=32k windowing; H9-c7 + L1-c7 trace-warn rate-limit; M5-c7 persistence-ordering invariant (append BEFORE sendEvent); C2-c7 message-vs-trace asymmetry doc.
- **Cycle-8** (`project_cycle_8_complete.md`): H1-c8 + M7-c8 OrchestrationError registry with discriminated-union switch; H4-c8 warning dedup; H5-c8 strict tool-row reconstructor; M3-c8/M9-c8 fallback cascade in `agsRacTraces`; M6-c8 fire-and-forget RAC trace contract; M8-c8 runtimeRunId in CAG resolver; L1–L4-c8 doc bundle (per-source unbounded latency map; orchestration vs dispatch error namespace). Closure runId b64b7b3 → 1a6dfe2.

---

## 5. Phase 1a key gaps surfaced (for Phase 1e)

1. **Simulation lane does not run ProposedToolCall validator + approval gate.** Dispatcher governance (allowedTools + preInvoke + sandbox) still runs; but gates 1/2/7/8 are not exercised, and `persistRuntimeToolCallTrace` is not written → operator UI has no per-PTC trace for simulation runs. **Severity: Medium** (governance is partial but not absent; no published-runtime exposure since simulation is dev-only).
2. **chat.ts (blocking) does not call `writeTrace` for end-of-stream RAC trace.** chat-stream.ts:1308 fire-and-forget; chat.ts has no equivalent. Operator-visible: blocking chat sessions produce no `agsRacTraces` rows. Documented in chat.ts:692-706 as intentional asymmetry but a Phase 1e candidate to revisit. **Severity: Low** (observability only; audit ledger unaffected).
3. **boundary-lint coverage gaps for Gate 6:** no static rule for (a) raw provider SDK absence in `server/agent-studio/**`, (b) `validateRuntimeToolCall` must precede `dispatchMcpToolCall`, (c) approval-gate must precede dispatch on approval-required calls, (d) direct `conn.callTool` outside dispatcher. Repo is currently clean by inspection (zero hits) but regression isn't lint-caught. **Severity: Medium** (Gate 6 explicit prerequisite).
4. **`runtimeContext.agentLifecycleState` not derived anywhere.** No file reads `agent.lifecycle.state` for runtime gating. Phase 5a/5b prerequisite — flagging early so Phase 1e plans the column-read insertion point in chat-stream.ts:1075 (after `getCurrentDraft`). **Severity: scheduled** (already on roadmap).
5. **SSE event types are not centrally typed.** Only `AwaitingApprovalEvent` (chat-stream.ts:124) is exported. Other events (`token`, `tool_start`, `tool_end`, `done`, `error`) are inline literals; client UI infers shape. Roadmap Phase 3.4 adds stable error codes; this audit recommends the same TS-export discipline for all event variants.
