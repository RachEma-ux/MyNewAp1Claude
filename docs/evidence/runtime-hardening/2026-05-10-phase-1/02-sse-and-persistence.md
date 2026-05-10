# Phase 1b — SSE / Persistence / Error-path audit

**Roadmap reference:** `docs/implementation/agent-studio-runtime-hardening-roadmap.md` Phase 1b
**Date:** 2026-05-10
**Branch baseline:** `main @ 3d12d03`
**Audit type:** Read-only. No runtime behavior changes.

---

## Scope

`server/agent-studio/chat-stream.ts`, `server/agent-studio/services/chat.ts`, `server/agent-studio/repository.ts`, `drizzle/tables/agent-studio.ts`, `services/rac/trace/store.ts`, `client/src/modules/agent-studio/components/AgentStudioChatWindow.tsx`, `client/src/modules/agent-studio/pages/AgentChatPage.tsx`. Route registered at `server/_core/index.ts:905` (`GET /api/agent-studio/chat/stream`).

All file paths are absolute. All findings labeled **Observed / Inferred / Unverified / Gap**.

---

## 1. SSE event matrix

The transport is `res.write(`data: ${JSON.stringify(data)}\n\n`)` (`chat-stream.ts:230-232`). Headers: `text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` (`:223-228`). **No SSE comment / heartbeat ever emitted; no `event:` field used; UI's only listener is `es.onmessage`** (`AgentStudioChatWindow.tsx:273`).

| Event | Emitted at (file:line) | Payload fields | Frequency | Persistence side-effect | UI handler (file:line) | Status |
|---|---|---|---|---|---|---|
| `token` (no-tools path) | `chat-stream.ts:1011` inside `for await chunk of chunks` | `type, content` | Per non-empty `chunk.delta` (true token-by-token) | None — content accumulated; persisted as one assistant row at stream end (`:1026-1035`) | `AgentStudioChatWindow.tsx:276-278`, `AgentChatPage.tsx:188-190` (append to `streamingText`) | Observed |
| `token` (tool-loop path) | `chat-stream.ts:532` after `gatewayCall(...modelAccess.execute, stream:false)` | `type, content` | **One per turn**, not per token (degraded — see :487-489 doc-block) | None at emit; assistant row written separately (`:556` for tool-call turns, `:896` for final) | Same handlers | Observed |
| `tool_start` | `chat-stream.ts:575-579` per tool call | `type, toolName, args` | Per tool call dispatched in loop iteration | None (audit/trace happen on `tool_end` path) | `AgentStudioChatWindow.tsx:278-282` adds `running` chip; `AgentChatPage.tsx:190-194` | Observed |
| `tool_end` (success) | `chat-stream.ts:879-886` | `type, toolName, ok, result, error?, durationMs` | One per tool call | `appendChatMessage(role:"tool", ...)` immediately before (`:853-858`); `persistRuntimeToolCallTrace(...)` (`:818-836`); dispatcher writes its own `agsRuntimePolicyEvents` audit row | `AgentStudioChatWindow.tsx:283-313` flips chip to `ok`/`error`; same in `AgentChatPage.tsx:195-208` | Observed |
| `tool_end` (loop-guard refusal) | `chat-stream.ts:623-628` | `type, toolName, ok:false, error` | When `dispatchCount > MAX_CALLS_PER_TOOL_PER_REQUEST` | Synthetic refusal `agsChatMessages` row (`:595`); best-effort `agsRuntimePolicyEvents` `tool_loop_guard` (`:606-617`) | Same | Observed |
| `tool_end` (unknown tool / spec_lookup_failed) | `chat-stream.ts:641-646`, `:671-676` | `type, toolName, ok:false, error` | When dispatchKey/spec lookup misses | `agsChatMessages` row only | Same | Observed |
| `tool_end` (validator/approval rejection) | `chat-stream.ts:780-785` | `type, toolName, ok:false, error` | When `runtimeVerdict.ok === false` | `persistRuntimeToolCallTrace` (`:751-762`); `agsChatMessages` role=tool error row (`:774-779`) | Same | Observed |
| `tool_end` (`status:"awaiting_approval"`) | `chat-stream.ts:733-743` (typed via `AwaitingApprovalEvent` interface `:124-135`) | `type:"tool_end", toolName, ok:false, status:"awaiting_approval", approvalRequestId, timeoutSec` | Once per pending approval inside `awaitApprovalDecision` callback | None on emit (resume path completes the trace + chat row after) | `AgentStudioChatWindow.tsx:298-304` flips chip to `awaiting_approval` (`AgentChatPage.tsx` does NOT discriminate — collapses to `error`, see `:195-208`) | Observed (UI parity gap) |
| `done` | `chat-stream.ts:1352-1362` | `type, assistantMessageId, usage:{promptTokens,completionTokens}, model, durationMs, costMicrocents` | Once per stream | Final assistant row already written (`:896-905` or `:1026-1035`); `bumpChatSessionTotals` (`:1266-1273`); fire-and-forget `writeTrace` + `writeContextBlocks` (`:1308-1349`, intentional no-await per M6-c8 doc) | `AgentStudioChatWindow.tsx:314-323`, `AgentChatPage.tsx:209-218` close ES + invalidate queries | Observed |
| `error` | `chat-stream.ts:1071, 1077-1082, 1100-1108, 1115-1119, 1193-1199, 1367` | `type, error`, optional `code` (only `"binding_required" \| "binding_missing_model" \| "cag_required" \| "retrieval_required"`) | Once per failure (single emission then `res.end()`) | None directly; user message may already be persisted at `:1136-1140` depending on which error fired | `AgentStudioChatWindow.tsx:324-336`, `AgentChatPage.tsx:219-229`: close ES, invalidate messages | Observed |
| `heartbeat` / SSE comment | **— (does not exist)** | — | — | — | — | **Gap (Phase 3.1 target)** |
| `awaiting_approval` (top-level type) | — (piggy-backs on `tool_end` per `:120-123`) | — | — | — | — | Observed (intentional — see doc block) |

**Phase 3.4 stable error codes — current implementation status:** the only `code` values populated today are the four binding/orchestrator cases above. There is **no** `stream_failed`, `model_failed`, `tool_failed`, `approval_blocked`, `trace_write_failed`, `audit_write_failed`, `client_disconnected`, `gateway_failed`, `retrieval_failed`, `idempotency_conflict`, or `dispatcher_failed` discriminator. The catch-all at `:1364-1377` emits `{type:"error", error: msg}` with no `code`. **All 11 Phase 3.4 codes are gap.**

---

## 2. Persistence matrix

Tables (all in `drizzle/tables/agent-studio.ts`):
- `agsChatSessions` (`:1207`), `agsChatMessages` (`:1240`)
- `agsRuntimeRuns` (`:439`), `agsRuntimeRunSteps`, `agsRuntimeToolCalls`, `agsRuntimeMemoryEvents`, `agsRuntimePolicyEvents` (`:530`)
- `agsToolCallTraces` (`:2234`)
- `agsRacRuntimeTraces` + `agsRacContextBlocks` + `agsRacFeedback` (referenced in `services/rac/trace/store.ts:23-29`; declarations near `:1799`)

| Stage | What is persisted | Table | When | On failure | Status |
|---|---|---|---|---|---|
| User message | `{sessionId, role:"user", content}` | `agsChatMessages` | **Before** any model call (`chat-stream.ts:1136-1140`; `services/chat.ts:1063-1067`) | Throws → caught at outer `try/catch` (`:1364`) → `error` event sent. **Row is committed already**; UI sees user bubble on next refetch. **No idempotency key — duplicate sends create duplicate rows.** | Observed |
| Context assembly (RAC/CAG) | No persistence at this stage; system prompt built in-memory (`buildRuntimeSystemPrompt`, `chat-stream.ts:1150-1172`) | — | Before model call | `OrchestrationError` caught at `:1190-1211`, emits `error` with `code` and `res.end()`. **User row already persisted** | Observed |
| Context truncation event (windowing) | `runId, policyKey:"context_truncation", decision:"warn", reason:"context_window_exceeded", payload` | `agsRuntimePolicyEvents` | Per turn when `windowed.truncated` (`chat-stream.ts:466-478`) | Try/catch logs + continues (`:479-484`) — best-effort | Observed |
| First model call | Nothing persisted at the call boundary itself; the call goes through `gatewayCall` (`:503` / `:983`) | — (Model Access internal receipt) | — | `result.status !== "ok"` throws (`:519-521`) → outer catch → `error` event. User row already persisted | Observed |
| Assistant turn carrying `tool_calls` | `{sessionId, role:"assistant", content, toolPayload:{toolCalls:[...]}, model}` | `agsChatMessages` | **After** model returns `tool_calls`, **before** any dispatch (`:556-562`) | Throws → outer catch → `error`; tool calls never run | Observed |
| Tool dispatch | `agsRuntimeToolCalls` is **not** written by chat-stream (legacy path); dispatcher writes its own audit row to `agsRuntimePolicyEvents` | `agsRuntimePolicyEvents` (dispatcher), `agsToolCallTraces` (this layer) | Inside `dispatchMcpToolCall` (`:798-815`) before result returns | Awaited; thrown errors bubble to outer catch | Inferred (audit row is dispatcher-internal — verified via threading of `runtimeRunId` per C1-c5 comment `:789-798`) |
| Tool result (assistant-visible) | `{role:"tool", content: JSON.stringify(result\|error), toolPayload:{toolCallId, name}}` | `agsChatMessages` | **Before** SSE `tool_end` (M5-c7 invariant `:843-852`) | If append throws, the SSE `tool_end` is never emitted; outer catch fires `error`. Trace row WAS written first at `:818-836` (potential split: trace exists, chat row missing) | Observed |
| Tool-call trace row | `agsToolCallTraces` row (validator verdict, approval row id, dispatch result, hashes) | `agsToolCallTraces` | After dispatch (success or rejection) (`:751-762` for rejection, `:818-836` for success) | Awaited; throw bubbles to outer catch — but the chat-row append is sequenced AFTER, so a partial trace-only state is possible on rare crashes | Observed |
| Continued model turns | History rebuilt by `repo.listChatMessages` each turn (`:404`); each turn is a fresh `gatewayCall` | — | — | Per-turn throw → outer catch | Observed |
| Final assistant message | `{role:"assistant", content, inputTokens, outputTokens, costMicrocents, model, durationMs}` | `agsChatMessages` | After tool loop terminates (`:896-905`) or pure stream end (`:1026-1035`) | Throw → outer catch → `error` with NO `done` event. **Tokens already streamed to client buffer but NOT persisted** | Observed |
| Session totals + auto-title | Update `totalInputTokens, totalOutputTokens, totalCostMicrocents, messageCount, title?` | `agsChatSessions` | After path completes, before `done` (`:1266-1273`) | Throw → outer catch → user sees `error`, but assistant row already persisted (potential double-submit risk on retry) | Observed |
| `agsRuntimeRuns` row | **NOT WRITTEN** by chat-stream — see comment `agent-studio.ts:870-911`: chat sessions intentionally use `sessionId` as the surrogate `runtimeRunId` | — | — | — | Observed (architectural exception; documented) |
| RAC trace (end-of-stream) | `agsRacRuntimeTraces` + `agsRacContextBlocks` rows | `agsRacRuntimeTraces`, `agsRacContextBlocks` | **After** `done` is constructed (`:1308-1349`); **fire-and-forget** by design (M6-c8 doc-block) | `.catch()` logs `[chat-stream/trace] write failed: ...` to stdout; user-facing turn unaffected | Observed |
| RAC feedback | `agsRacFeedback` (thumbs row) | `agsRacFeedback` | Out of band (separate UI mutation) | Out of scope of this stream | — |

---

## 3. Error-path matrix

`User row state` = whether `agsChatMessages role:user` was inserted; `Idempotency key` is **always "—"** (no key — see §4).

| Scenario | User row | Assistant row | Trace row | Audit row | SSE event emitted | Idempotency key | Status |
|---|---|---|---|---|---|---|---|
| Model fails on first turn (before any token) | persisted (`chat-stream.ts:1136`) | none | none | none beyond context-truncation if it fired | `{type:"error", error: msg}` (no `code`) at `:1367` | — | Observed |
| Model fails mid-turn (some tokens to client buffer, none in DB) | persisted | **none** — final assistant row only written after stream completes (`:1026`) | none | none | `error` after partial tokens | — | Observed (data loss — Phase 3 gap) |
| Tool dispatcher returns error (`dispatchResult.ok===false`) | persisted | `assistant` row with `toolCalls` payload persisted | `agsToolCallTraces` row written with `dispatchResult.ok=false` (`:826-833`) | dispatcher writes its own `agsRuntimePolicyEvents` row (per C1-c5 comment) | `tool_end` with `ok:false, error` (`:879-886`); loop continues; eventually `done` | — | Observed |
| Approval required (`approval_required` / `approval_pending`) | persisted | assistant `tool_calls` row persisted | trace row written on rejection (`:751`) | `agsPendingPermissionRequests` row created by gate | `tool_end` with `status:"awaiting_approval"` (`:733-743`) — UI handler at FAB only | — | Observed |
| Approval times out (`operator_wait_timeout`) | persisted | assistant `tool_calls` row persisted | trace row with `traceTimeoutReason="operator_wait_timeout"` (`agent-studio.ts:2271-2287`) | gate writes audit | `tool_end` ok:false with reason; loop continues (or terminates) | — | Inferred (helper internals) |
| Approval denied / expired (`validator_rejected` etc) | persisted | assistant `tool_calls` row | trace row (`:751-762`) | `agsPendingPermissionRequests` updated; gate writes policy event | role=tool error row + `tool_end` ok:false (`:780-785`) | — | Observed |
| Trace write fails (`writeTrace` / `writeContextBlocks` reject) | persisted | persisted | **partial / missing** | unaffected | **None** — fire-and-forget; only `console.warn` line at `:1346` | — | Observed (silent — Phase 3 needs `trace_write_failed` code) |
| Audit write fails (e.g. `appendRuntimePolicyEvent` for `context_truncation` / `tool_loop_guard`) | persisted | as above | as above | **dropped** | None — try/catch logs and continues (`:479-484`, `:618-622`) | — | Observed (silent — needs `audit_write_failed`) |
| Client disconnects mid-stream (`req.aborted` / `res.closed`) | persisted | none yet — server keeps running model + dispatching tools until `gatewayCall` returns | trace rows written as if stream live | audit rows written | None received by client; server's subsequent `res.write` calls fail silently | — | **Gap** — `grep` for `req.on("close"`, `req.aborted`, `res.on` returned **0 matches** in `chat-stream.ts` and `services/chat.ts`. Status: Observed (no disconnect handler exists). Needs `client_disconnected` code + AbortController plumbing. |
| Duplicate `clientMessageId` arrives (today: param does not exist) | duplicate `agsChatMessages` row inserted | duplicate full pipeline runs | duplicate trace/audit | duplicate audit | runs twice; possibly double tool dispatch | **— (no key)** | **Gap** — query handler at `:1052-1064` only reads `sessionId` + `message`. No idempotency. Needs `idempotency_conflict` code. |
| Gateway timeout from OpenRouter | persisted | none | none | none | `error` (no `code: gateway_failed`) | — | Observed (collapsed into generic error) |

---

## 4. Idempotency analysis

**No idempotency exists today.**

- Entry point reads only `sessionId` and `message` from query params (`chat-stream.ts:1052-1064`):
  ```ts
  const sessionIdRaw = req.query.sessionId as string | undefined;
  const userMessage = req.query.message as string | undefined;
  ```
  No `clientMessageId`, `requestId`, `idempotencyKey`, or hash parameter is read or honored anywhere.
- The user-message persist call (`:1136-1140`) is an unconditional `appendChatMessage`. The repository helper (`repository.ts:2831-2857`) is a plain `db().insert(agsChatMessages).values({...}).returning()` with no `onConflictDoNothing` / `onConflictDoUpdate` and no unique-constraint key.
- The `agsChatMessages` table definition (`agent-studio.ts:1240-1266`) has indexes only on `sessionId` and `createdAt` — no unique constraint on `(sessionId, clientMessageId)` or `(sessionId, contentHash, window)`.
- The non-streaming path (`services/chat.ts:1063-1067`) is the same shape — same gap.
- The client opens an `EventSource` with no retry suppression (`AgentStudioChatWindow.tsx:270`, `AgentChatPage.tsx:182`). On `es.onerror` the UI closes the ES (`:343-353`, `:235-245`) but a network blip + user re-send — or a refresh after the user typed once — will create a second `user` row, run the full pipeline a second time, and double-dispatch any tools.

**Consequence:** retries / double-submits / reconnects today produce **duplicate user messages, duplicate model spend, and duplicate tool dispatch.** This is the explicit Phase 3.2 work item.

---

## 5. Notable cross-cutting observations

- **Trace/audit asymmetry is intentional and documented:** the M6-c8 doc-block at `chat-stream.ts:1279-1304` explicitly forbids awaiting `writeTrace`. `chat.ts:692-706` documents the parallel-flow exception (the per-tool-call trace IS awaited in non-streaming because subsequent dispatches would race the row). Phase 3 must respect this when adding `trace_write_failed` codes — the failure surface here is observability-only, not user-blocking.
- **`agsRuntimeRuns` is intentionally NOT written for live chat sessions** (`agent-studio.ts:870-911` doc block). `sessionId` stands in as the surrogate `runtimeRunId` everywhere. Phase 1c's tool governance matrix should record this so `runId` joins are read consistently.
- **UI parity gap discovered during audit:** `AgentChatPage.tsx:195-208` does NOT handle `status:"awaiting_approval"` — it falls into `data.ok ? "ok" : "error"` and renders a red error chip. Only `AgentStudioChatWindow.tsx:298-313` (FAB) discriminates. **This is a UI bug discovered during the audit; flag for Phase 3.x or a separate fix PR.**
- **No `event:` field is ever set** on the SSE wire — every event flows through `es.onmessage` and is discriminated client-side by `data.type`. Adding heartbeat as a typed event vs. a `:` comment is therefore consistent with current consumer code only if it follows comment-line convention (and is filtered by EventSource — comments are not delivered to `onmessage`).
- **`code` field is sparsely populated.** The only error responses with a `code` are the four orchestrator/binding cases (`binding_required`, `binding_missing_model`, `cag_required`, `retrieval_required`). The catch-all `:1367` and the rejected-tool/dispatcher-failure paths do not carry codes. **Phase 3.4's full error-code matrix is currently 0% implemented on the wire.**
- **No `req.on("close")`, no AbortSignal threading.** The server has no notion of client disconnect; long-running tool loops will continue dispatching after the user closes the tab.

---

## 6. Phase-2 / Phase-3 implications

This audit confirms three Phase-3 sub-PRs are necessary as planned, plus surfaces three additional findings:

| Roadmap reference | Status from this audit |
|---|---|
| Phase 3.1 — SSE heartbeat | Necessary — 0 heartbeat / keepalive emission today |
| Phase 3.2 — `clientMessageId` idempotency | Necessary — 0 idempotency keying; duplicate user rows + duplicate tool dispatch confirmed |
| Phase 3.3 — Basic reconnect behavior | Necessary — UI closes ES on error but no idempotency means retries duplicate everything |
| Phase 3.4 — Stream error reconciliation | Necessary — 11 of 11 Phase-3.4 codes missing on the wire |
| **NEW — Client disconnect handling** | Not in V3 scope; recommend adding to Phase 3.4 or as Phase 3.5. Server has no `req.on("close")` / AbortSignal; tool loops continue after tab close, burning model spend |
| **NEW — UI parity for `awaiting_approval`** | `AgentChatPage.tsx:195-208` collapses to red error chip. Recommend a small standalone fix PR ahead of Phase 3.x |
| **NEW — Mid-stream model failure data loss** | Tokens streamed to client buffer are NOT persisted on mid-turn failure. Phase 3.4 should decide: persist-as-partial vs discard-consistently |

---

**End of Phase 1b audit.** Ready for Phase 1c / 1d / 1e synthesis.
