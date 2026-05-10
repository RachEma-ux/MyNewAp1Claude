# Phase 1c — Tool governance matrix + RAC/CAG trace matrix

**Roadmap reference:** `docs/implementation/agent-studio-runtime-hardening-roadmap.md` Phase 1c
**Date:** 2026-05-10
**Branch baseline:** `main @ 3d12d03`
**Audit type:** Read-only. No runtime behavior changes.

**Note on prior-audit consumption:** memory references cycle-5/6/7/8 closure reports under `docs/evidence/agent-studio-rac/`, but only `RAC_REPO_REALITY_MAP.md` and `GRAPHRAG_CONTRACT_GAP_REPORT.md` exist there. Cycle markers are inlined as doc-blocks in the source (e.g. `L4-c5`, `C1-c6`, `H1-c7`, `M7-c8`); these inline source markers are cited as the primary evidence trail.

---

## 1. Tool governance matrix

The runtime governance chain in **chat-stream.ts and chat.ts** is identical (cross-flow lockstep, cycle-6 C1-c6):

```
modelAccess.execute → toolCalls[] → for each call:
  spec lookup (chat-stream.ts:658, chat.ts:609)  ← spec_lookup_failed = fail-closed
  validateRuntimeToolCall(...)                    ← Phase 8 validator (proposed-tool-call.ts)
  gateRuntimeDispatch(...)                        ← Phase 9 approval gate (approval-gate.ts)
  awaitApprovalDecision(...) [if approval_required|pending]   ← C1-c6 D-RESUME
  dispatchMcpToolCall(...)                        ← single chokepoint (dispatcher.ts:490)
  persistRuntimeToolCallTrace(...)                ← agsToolCallTraces (best-effort, L4-c5)
  appendChatMessage(role:"tool", ...)             ← canonical conversation row
  sendEvent(tool_end)                             ← SSE (chat-stream only)
```

| Scenario | Validator decision | Approval state | Dispatcher action | Tool-call trace? | Audit row (`agsRuntimePolicyEvents`)? | SSE event | Persistence | Status |
|---|---|---|---|---|---|---|---|---|
| Valid read-only (no approval) | `ok`, `requiresApproval=false` derived from `riskClassToRiskLevel` (proposed-tool-call.ts:159) | gate skipped (proposed-tool-call-runtime.ts:226) | dispatched; pre-invoke=allow; `conn.callTool` w/ 30 s timeout (dispatcher.ts:746-751) | YES, `validationVerdict=ok`, `dispatchResult=ok` | YES, `decision=allow`, `policyKey=mcp_dispatch` (dispatcher.ts:850) | `tool_start` then `tool_end` ok=true | assistant row + tool row appended (chat-stream.ts:556, 853) | **Observed** |
| Valid write, approval permitted | `ok`, `requiresApproval=true` | gate `permit` (decideApprovalState `allowed AND expiresAt>now`, approval-gate.ts:163-164) | dispatched; `approvalRequestId` threaded into audit payload (M4-c5; dispatcher-types.ts:88, dispatcher.ts:516) | YES, `approvalStatus=allowed` | YES, `decision=allow\|warn`, payload carries `approvalRequestId` | `tool_start` then `tool_end` ok=true | assistant + tool rows | **Observed** |
| Valid write, approval pending | `ok`, `requiresApproval=true` | gate `pending` (approval-gate.ts:169-170) → `awaitApprovalDecision` blocks up to `APPROVAL_RESUME_TIMEOUT_SEC` (300 s default; chat-stream.ts:716, chat.ts:659) | NOT dispatched until resumed; resumes on bus event (approval-event-bus.ts) → re-evaluates gate | YES on rejection-side persist (chat-stream.ts:751, chat.ts:707); fields populated when timeout/decision returns | YES if `createApprovalRequest` ran (approval-gate.ts:418 `null→pending` row) | `tool_end` ok=false `status=awaiting_approval` (chat-stream.ts:733); chat.ts has no SSE, captures into return shape (H5-c7) | tool row written with `reason=approval_pending`; assistant row already persisted | **Observed** |
| Valid write, approval denied | `ok`, `requiresApproval=true` | gate `denied` (approval-gate.ts:166) | NOT dispatched | YES, `validationVerdict=ok`, `approvalStatus=denied`, `dispatchResult=blocked` (proposed-tool-call-runtime.ts:533-537) | YES, `decision=denied` row written by `decideApprovalRequest` (approval-gate.ts:523) | `tool_end` ok=false carrying `error: "approval_denied: ..."` (chat-stream.ts:780) | tool row with JSON error body (chat-stream.ts:774) | **Observed** |
| Valid write, approval expired | `ok`, `requiresApproval=true` | gate `expired` (approval-gate.ts:163-164 OR `timed_out`); distinguished by `traceTimeoutReason` (H5-c6: `approval_ttl_elapsed` vs `operator_wait_timeout`) | NOT dispatched | YES, `approvalStatus=expired`, `traceTimeoutReason` set (trace-writer.ts:198-204) | YES if state-transition row written when sweep flips `timed_out` (M3-c6 sweep is operator-applied) | `tool_end` ok=false | tool row with `reason=approval_expired` | **Observed** (TTL boundary) / **Inferred** (sweep cadence) |
| Invalid tool call (validator rejects) | `ok=false`, code ∈ {`invented_tool`, `invented_parameter`, `missing_parameter`, `fabricated_evidence`, `schema_mismatch`, `risk_level_mismatch`, `approval_claim_mismatch`, `quarantined_tool`, `sandbox_required`} (proposed-tool-call.ts:59-68) | gate skipped — `verdict.reason=validator_rejected` (proposed-tool-call-runtime.ts:217) | NOT dispatched; dispatcher never called | YES, `validationVerdict=rejected`, approval/dispatch fields null (trace-writer.ts:191-235; "rejection drops downstream metadata") | NO `mcp_dispatch` row (dispatcher not invoked) | `tool_end` ok=false `error: "validator_rejected: ..."` | tool row with JSON error body | **Observed** |
| Dispatcher fails after permit | `ok` | `permit` | dispatched; `conn.callTool` throws or returns error; mapped through `mapSandboxCodeToDispatchCode` / `mapTransportCodeToDispatchCode` / `tool_call_timeout` (dispatcher.ts:806-820) | YES, `dispatchResult=error`, `errorMessage` populated | YES, `decision=deny`, `errorCode` + `errorMessage` (raw, forensic; sanitized in returned result) (dispatcher.ts:539-569; C1-c7) | `tool_end` ok=false carrying sanitized `error.message` | assistant + tool error rows | **Observed** |
| Tool returns error result | `ok` | `permit` | dispatched; `result` returned w/ outputSchema mismatch handled by `validateMcpToolResponse` → `schema_mismatch_on_output` (H2-c7; dispatcher.ts:829) | YES, `dispatchResult=error` | YES, `decision=deny` | `tool_end` ok=false | rows written | **Observed** |
| Tool times out | `ok` | `permit` | `withTimeout` race rejects after `MCP_TOOL_CALL_TIMEOUT_MS` (default 30 s; H1-c7; dispatcher.ts:166-208); error tagged with `TIMEOUT_SENTINEL` → `tool_call_timeout` distinct from `tool_execution_failed` | YES, `dispatchResult=error`, `errorMessage` "exceeded ... timeout" | YES, `decision=deny`, `errorCode=tool_call_timeout` | `tool_end` ok=false | rows written | **Observed** |

**Audit-vs-trace asymmetry (L4-c5, doc-block in proposed-tool-call-runtime.ts:372-419):** dispatcher's `writeAuditRow` is FATAL (throws → `internal_error` result); `persistRuntimeToolCallTrace` is BEST-EFFORT (catch + rate-limited `console.warn` per H9-c7, 1 warn/(workspace,agent)/60 s). Cross-DB (ASDB vs MAIN) symmetry is unenforceable, so the asymmetry is intentional.

---

## 2. Approval state-machine map

Approval lifecycle (`agsPendingPermissionRequests.status`):

```
(no row)  -- createApprovalRequest -->  pending
pending   -- decideApprovalRequest({status:"allowed"})  -->  allowed (with expiresAt = now + ttl)
pending   -- decideApprovalRequest({status:"denied"})   -->  denied
pending   -- decideApprovalRequest({status:"timed_out"}) | M3-c6 sweep -->  timed_out
allowed   -- expiresAt elapsed (no row mutation)        -->  effectively expired (decideApprovalState reads expiresAt as source of truth)
```

| Transition | Enforcement file:line | Audit row written? | Notes |
|---|---|---|---|
| `(absent) → pending` | `approval-gate.ts:355-432` (createApprovalRequest) | YES — `policyKey="approval_gate"`, `decision="pending"`, `reason="approval_request_created"` (line 418) | Idempotent on `(agentDraftId, hash)` UNIQUE INDEX (M2-c6); duplicate INSERT raises 23505 → re-SELECT returns existing |
| `pending → allowed` | `approval-gate.ts:467-482` (decideApprovalRequest) | YES — `decision="allowed"`, payload includes `expiresAt` (line 523-535) | `computeExpiresAt` adds TTL (default 3600 s, D-APP-EXT-5; line 180-191); `getApprovalEventBus().emit` fires AFTER row write (C2-c4 D-RESUME-1; line 542) |
| `pending → denied` | same path, status="denied" | YES — `decision="denied"` | |
| `pending → timed_out` | same path, status="timed_out" (operator UI) **or** `scripts/migrations/manual/ags-pending-perm-expiry-sweep.sql` (M3-c6) | YES (operator path) / NO (sweep is SQL-only — operator-applied, not gate-driven) | M3-c6 doc: `expiresAt` is source of truth; status lags until sweep runs |
| Re-decide on terminal row | rejected path at `approval-gate.ts:484-521` (M5-c4) | YES — `decision="rejected_already_decided"`, `reason=attempted_redecide_to_<status>` | Forensic record of concurrent-operator race; row state NOT mutated |
| `allowed → effectively expired` | pure decision in `decideApprovalState` (`approval-gate.ts:163-164`); `expiresAt.getTime() <= now.getTime()` | NO state-transition row at the moment of expiry; **inferred**: any next dispatch attempt's `mcp_dispatch` audit row carries `errorCode` reflecting the gate verdict via downstream rejection trace | M3-c6 documented: operators query `agsPendingPermissionRequests` filtered by `expiresAt`, not `status` |
| Permit re-use bumps `lastUsedAt` | `approval-gate.ts:279-302` (M1-c6) | NO new row; UPDATE only when stale (≥60 s) | Reduces audit-log noise on tight loops |

**State-machine gate boundaries (cycle-4 doc-blocks):**
- **No `dual_control` at MCP layer** (H1-c4, lines 19-42) — empty `MCP_APPROVAL_GATE_ACTION_KEYS` set guards a future regression
- **No `GOVERNANCE_ENFORCE_APPROVALS` env flag** (H2-c4, lines 44-61) — this gate is always-enforcing
- **No admin fast-path** (M4-c4, lines 65-89) — admin must approve via UI like any operator

**Ungoverned state:** `allowed AND expiresAt=null` returns `permit` (legacy row without expiry; `approval-gate.ts:163`). **Observed.**

---

## 3. RAC/CAG trace matrix

Trace surfaces:
- **`agsRacRuntimeTraces`** — one row per turn; written by `writeTrace` (rac/trace/store.ts:137) carrying RuntimeTraceMetrics from `resolveAndAssembleContext` (rac-orchestrator.ts:311)
- **`agsRacContextBlocks`** — one row per included chunk; written by `writeContextBlocks` (rac/trace/store.ts:181)
- **`agsToolCallTraces`** — one row per tool-call attempt; written by `recordToolCallTrace` (trace-writer.ts:292)

| Runtime event | Trace written | Fields captured | Source/citation evidence | Status |
|---|---|---|---|---|
| Successful retrieval with citation | `agsRacRuntimeTraces` + N `agsRacContextBlocks` | `mode`, `cagPackId/Version`, `retrievalEnabled=true`, `retrievalLatencyMs`, `chunksReturned/Filtered/Included`, `truncatedByBudget`, `citationCoverage`, `groundednessScore`, `perSourceLatencyJson` (L2-c8 unbounded by design); per-block `citation`, `contentHash`, `score`, `rank`, `sourceLatencyMs` | included chunks pass through `assembleRetrievalEvidence`; `chunkSourceMap` ties each `sourceChunkId` → `(sourceId, sourceType)` (rac-orchestrator.ts:218-224) | **Observed** |
| Empty retrieval | trace row only; 0 context-block rows | `chunksIncluded=0`, `primaryFallbackReason ∈ {no_query, no_profile}`, `fallbackReasons[]` cascade (M3-c8), `primaryFallbackDetail` (M9-c8); `recordFallback` emits warning + records reason (rac-orchestrator.ts:253-265) | M2-c8 closes silent-disable: every fallback path now emits a warning | **Observed** |
| Retrieval failure | trace row | `primaryFallbackReason="retrieval_error"`, `fallbackReasons` cascades (CAG fail + retrieval fail both recorded, M3-c8), `primaryFallbackDetail=err.message`. In `strict` mode throws `RetrievalRequiredError` (rac-orchestrator.ts:459-463) instead of silent fallback. SSE mapper at chat-stream.ts:1197 emits `error code:"retrieval_required"` | L4-c8 doc: orchestration codes live in distinct namespace from MCP `DispatchErrorCode` | **Observed** |
| CAG capability pack inclusion | trace row | `cagPackId`, `cagPackVersion`, `tokenBudgetUsed/Truncated`; `cagCompiledHash` patched in via `patchRacRuntimeTrace` + `buildRacTracePatch` (H4-c7 distinguishes "absent" from "explicit null" for concurrent-write safety) | `resolveCagPack` returns the `SystemPromptSection` (rac-orchestrator.ts:340-353) | **Observed** |
| Context block pruned / not included | counts only on trace row; pruned blocks NOT written as rows | `chunksFiltered` aggregated; `piiBlockedCount`, `licenseBlockedCount` (U5-b.3); rejection breakdown captured from `filterRetrieval.rejectionCounts` (rac-orchestrator.ts:436-445) but only counts persist | dropped chunks not stored | **Observed** (counts) / **Unverified** (per-chunk rejection-reason audit row — none exists) |
| Tool-knowledge retrieval | same `agsRacRuntimeTraces` + `agsRacContextBlocks` if a `tool_knowledge_retrieval` profile is registered | `mode="tool_knowledge_retrieval"` or `hybrid_cag_tool_knowledge` (rac/planner-mode.ts:18, 84) | **No production caller emits `toolKnowledgeIds` today** (proposed-tool-call.ts:127, 339-345 C3-c6 doc — set was misdirected pre-cycle-6, latent bug closed) | **Inferred** wiring exists; **needs-test** for end-to-end |
| Hybrid CAG+RAG mode | trace row | `mode="hybrid_cag_rag"`; both CAG section + retrieval evidence non-null | rac-orchestrator.ts:496-509 composes both into systemPrompt; planner-mode.ts:87 derivation rule | **Observed** |
| Multimodal hybrid retrieval | trace row | `mode="multimodal_hybrid_retrieval"` | planner-mode.ts:36, 80 (multimodal hint detection) | **Inferred** — adapter readiness for non-text source types is the Phase 7 RAC Adapter Reality Matrix scope |

**RAC trace warn rate-limit (H9-c7 + L1-c7):** trace-write failure breadcrumb is rate-limited 1/(workspaceId, agentId)/60 s and includes `approvalRequestId` for forensic single-grep (proposed-tool-call-runtime.ts:519-590).

---

## 4. Test-run-binding lane analysis

**Entry point:** `server/agent-studio/services/test-run-binding.ts:128` (`runTestWithBinding`); router at `server/agent-studio/api/provider-bindings-router.ts:208`.

**Walk-through:**
1. `resolveForRun` → binding policy check (Phase 12)
2. `evaluateProviderUsePolicy` → Phase 21 provider-use governance gate (test-run-binding.ts:207)
3. `buildRuntimeSystemPrompt` → CAG + RAC composer (test-run-binding.ts:171)
4. `gatewayCall(openRouter.modelAccess.execute)` with `messages` and **NO `tools` field** (test-run-binding.ts:220-230)
5. Returns `output: modelAccessResult.output` directly

**Finding (Observed):** test-run-binding **does not emit tool calls**. The `executeInput` carries no `tools` array, so Model Access cannot return `toolCalls`. Therefore the validator/approval/dispatcher chain is structurally inapplicable rather than bypassed. The lane DOES participate in:
- CAG + RAC trace path (via `buildRuntimeSystemPrompt`)
- Phase 21 provider-use governance
- Model Access OpenRouter chokepoint

**Pre-flight #6 hypothetical** (test-run-binding of a published agent emitting tools) **does not arise today** because the lane is single-turn no-tools. If tools are ever wired into this lane, the same `validateRuntimeToolCall → gateRuntimeDispatch → dispatchMcpToolCall` chain MUST be added; today the lockstep is "test-run-binding has no tool loop." Phase 5b's published-agent fail-closed work would inherit this lane automatically when tools are added.

---

## 5. Boundary asymmetry surface — direct `dispatchMcpToolCall` callers

`grep -rn "dispatchMcpToolCall" server/` enumerated **5 production callers**:

| Caller | File:line | Validator before dispatch? | Approval gate before dispatch? | Status |
|---|---|---|---|---|
| `chat-stream.ts` | `:798` | YES — `validateRuntimeToolCall` at `:682` | YES — `gateRuntimeDispatch` + `awaitApprovalDecision` at `:691, :716` | **Observed** governed |
| `services/chat.ts` | `:745` | YES — `:626` | YES — `:635, :659` | **Observed** governed |
| `services/simulation.ts` | `:439` | **NO** — call goes straight to `dispatchMcpToolCall({source:"simulation"})` | **NO** — relies on dispatcher's internal `checkAllowedTools` + `evaluateMcpPreInvoke` only | **Observed bypass** of ProposedToolCall envelope; Phase 8/9 gates absent |
| `services/mcp/mcp-manager.ts` | `:799-805` (lazy import shim) | **NO** — `agentDraftId=-1` (SYSTEM_DRAFT_ID) bypasses allowedTools (dispatcher.ts:421-423); pre-invoke still runs | NO approval gate | **Observed bypass** by design (mcp-manager.ts:759-770 doc); legacy compat shim |
| `boot.ts` (only doc-comment ref, line 734) | not a caller | n/a | n/a | doc only |

**Asymmetry findings:**

1. **Simulation does NOT exercise ProposedToolCall validator (Phase 8) or approval gate (Phase 9).** Dispatcher's internal `checkAllowedTools` (rule-table) + `evaluateMcpPreInvoke` (governance adapter) still fire, and the audit row is written when `runtimeRunId` is present (simulation.ts:441 passes `runtimeRun.id`). Effect: a simulated "ask" rule is treated as deny in the dispatcher (decision #3a, dispatcher.ts:441-443), but a tool that requires `requiresApproval=true` per riskClass mapping (e.g., `governance_sensitive`) will be **dispatched without an `agsPendingPermissionRequests` row**, since the gate that creates that row lives outside the dispatcher. The argument-shape validation, evidence-chunk fabrication check, and quarantined-tool hard-block (Gate 7) are also not enforced.

   This is **the largest governance gap surfaced by this audit**. Pre-flight #6 in the roadmap covers test-run-binding of a published agent; simulation of a published agent is not explicitly covered. Recommend Phase 5b scope-check.

2. **`mcpManager.callMcpTool` shim (legacy)** uses `SYSTEM_DRAFT_ID=-1`, intentionally bypassing per-agent allowedTools. Doc-block (mcp-manager.ts:753-770) documents the trade-off; new callers should use `dispatchMcpToolCall` directly.

3. **No raw `conn.callTool(...)` callers outside dispatcher.ts** (per cycle-5 L5-c5 doc-block, dispatcher.ts:36-89); dispatcher remains the chokepoint for actual MCP transport invocation. Sandbox-routed `code_execution` tools take the `getToolSandbox().execute()` branch (dispatcher.ts:708-740) — also inside dispatcher, so chokepoint invariant holds.

**Recommendation:** add validator + gate wiring to `simulation.ts:439` (mirror of the chat-stream/chat patterns) OR document the simulation-bypass as an explicit deferred exception in the roadmap §5 boundary integrity section (today it is implicitly assumed governed because dispatcher writes audit rows, but the Phase 8/9 envelopes are not enforced).

---

## Status summary

- **Tool governance matrix:** 9/9 scenarios Observed end-to-end for chat-stream + chat lanes
- **Approval state machine:** 6/7 transitions Observed; expiry-by-time-only is Inferred (no row-mutation event at the timestamp boundary)
- **RAC/CAG traces:** 6/8 events Observed; `tool_knowledge_retrieval` end-to-end Inferred (no production caller emits `toolKnowledgeIds`); `multimodal_hybrid_retrieval` adapter readiness Inferred (Phase 7 scope)
- **Test-run-binding:** governed in CAG+RAC+Provider-use layers; tool-dispatch chain structurally inapplicable (no `tools` field in `executeInput`)
- **Boundary asymmetry:** 1 production lane (`simulation.ts`) bypasses the ProposedToolCall envelope + approval gate — recommend Phase 5b/§5 follow-up
