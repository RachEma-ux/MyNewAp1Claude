# Agent Studio Runtime Hardening Roadmap (V3)

**Status:** Active
**Owner:** Agent Studio runtime team
**Branch baseline:** `main @ 1a6dfe2`
**Last updated:** 2026-05-10

This document is the **living progress reference** for the Agent Studio runtime + chat-stream hardening effort. It supersedes the V1 roadmap and the V2 corrected plan; all execution work must reference this file. Progress tables (§7) are updated as PRs land.

---

## 0. Executive summary

Agent Studio's runtime layer is architecturally coherent. The boundaries are clean:

```
UI → tRPC session/message lifecycle
   → SSE chat-stream delivery
   → OpenRouter Model Access  (only model execution path)
   → RAC/CAG context assembly
   → ProposedToolCall validation
   → Approval gate
   → MCP dispatcher  (only tool execution chokepoint)
   → Runtime + tool-call trace writers
   → ASDB persistence
```

The closure work is **certification, hardening, and maturity** — not a rewrite. The remaining risks are:

- Audit + CI enforcement gaps
- Degraded tool-mode streaming (UX)
- Default-open `allowedTools` behavior for published agents (safety)
- SSE robustness gaps (heartbeat, idempotency, reconnect, error reconciliation)
- Runtime config schema drift
- Unverified RAC adapter readiness
- Missing operational alerting + load certification

The plan executes in two tracks: **Track A — Immediate Production Readiness** (audit, CI, SSE robustness, governance E2E, fail-closed permissions); **Track B — Runtime Maturity / Post-MVP** (config schema, RAC adapter matrix, true tool-mode streaming, observability, load certification).

---

## 1. Definition of Done

The runtime is **production-ready** when **Gates 1–5 + 6** close. It reaches **reference-grade** when **Gate 7** also closes.

### Gate 1 — Runtime Contract Evidence Gate
The Phase 1 certification audit has classified every safety-critical path as **Observed / Inferred / Unverified / Not applicable**. No safety-critical path remains `Unverified` without an explicit follow-up issue.

### Gate 2 — CI Enforcement Gate
Default CI runs the lightweight safety-critical runtime subset on every PR:
- Retrofit acceptance suite
- Chat-stream contract tests
- MCP dispatcher boundary tests
- ProposedToolCall validation tests
- Approval gate tests
- Permission default tests
- OpenRouter Model Access boundary tests
- RAC/CAG trace contract tests
- Provider credential boundary tests

Heavy integration / load tests run nightly or manually but are **classified** (no test in the "exists but never runs" state).

### Gate 3 — Runtime Governance E2E Gate
E2E paths A–D are green and run on every PR:
- **A** — valid read-only tool call
- **B** — invalid tool call (validator rejection)
- **C** — approval-required tool call (required / pending / denied / expired / permitted)
- **D** — dispatcher failure

Each path proves: validator, approval, dispatcher, audit, trace, UI event, persistence behavior.

### Gate 4 — SSE Robustness Gate
SSE runtime supports:
- Heartbeat (keepalive comments at 15–30s intervals)
- `clientMessageId` idempotency
- Safe retry / safe MVP reconnect
- Stable error codes (see Phase 3.4)
- No duplicate user messages
- No accidental duplicate tool dispatch

### Gate 5 — Published Agent Fail-Closed Gate
For published agents (`agent.lifecycle.state === "published"`):
- No explicit enabled tool permission rules → **deny tool dispatch**
- Denial writes trace + audit evidence
- UI surfaces actionable remediation warning

For draft/design/simulation agents:
- No rules → warn; preserve developer-friendly behavior if feature flag allows

### Gate 6 — Boundary Integrity Gate (statically enforced)
The `boundary-lint` allowlist (existing infra from cycle-5/6) proves at lint time:
- 0 raw provider SDK calls inside Agent Studio runtime (`server/agent-studio/**`)
- 100% model calls go through OpenRouter Model Access
- 100% permitted tool calls go through MCP dispatcher
- 100% model-emitted tool calls validated before dispatch
- 100% approval-required calls blocked until approved

Tests + audit evidence prove the runtime invariants; lint proves the static boundaries cannot regress.

### Gate 7 — Observability + Load Baseline Gate
- Runtime health metrics exist and are queryable (Phase 11a data model)
- Trace + audit failures are visible in operator UI (Phase 11b)
- SLOs documented with thresholds (Phase 11c) — see Phase 12 for numeric baselines:
  - ≥ **25 concurrent SSE no-tool streams** stable, p95 first-token latency < **5 s**
  - ≥ **10 concurrent tool streams** stable
  - ≥ **100 trace writes/min** without back-pressure starving chat execution
  - 0 unbounded memory growth across a 2-minute long-running stream
  - Degradation curve documented through to overload

---

## 2. Pre-flight clarifications (must be fixed before Phase 1 starts)

These seven items are recorded here so they cannot be lost between the V2 plan and execution.

| # | Clarification | Resolution |
|---|---|---|
| 1 | Phase 1 is too big as a single PR | **Pre-decomposed into 1a–1e sub-PRs** (see §3 Phase 1) |
| 2 | Gate 6 needs static-enforcement mechanism | **Boundary-lint allowlist** (existing infra; cycle-5/6) is the canonical enforcer |
| 3 | Gate 7 is too vague | **Quantified** above (25/10/100/0 / curve documented) |
| 4 | `runtimeContext.agentLifecycleState` derivation unspecified | **Derived from `agent.lifecycle.state` column at runtime context construction in `chat-stream.ts`**; never from request headers or env vars |
| 5 | Phase 5b's `warn_allow` scope ambiguous | **Triggers only when zero enabled rules exist for the agent.** When ≥1 rule exists but does not cover a given tool, fall through to `evaluateExplicitRules` (per-tool deny) |
| 6 | Test-run-binding lane under published unhandled | **Published-ness is an agent-level property, regardless of execution lane.** Test-run-binding of a published agent enforces fail-closed |
| 7 | Sprint plan parallelism not flagged | **Marked in §6 sprint plan** — PRs that share `chat-stream.ts` serialize; PRs touching disjoint files run in parallel |

---

## 3. Track A — Immediate Production Readiness

### Phase 1 — Runtime Certification Audit + Critical Test Coverage Audit

**Goal:** Certify current runtime behavior before changing it. Audit-only; produces docs, no runtime code edits.

**Sub-PR decomposition (per pre-flight #1):**

| Sub-PR | Deliverable | File scope |
|---|---|---|
| **1a** | Runtime wiring map + sequence diagram + boundary integrity matrix | `server/agent-studio/chat-stream.ts`, `services/chat.ts`, `services/runtime/*`, `api/router.ts`, `client/src/modules/agent-studio/pages/AgentChatPage.tsx` |
| **1b** | SSE event matrix + persistence matrix + error-path matrix | chat-stream.ts SSE events; `agsMessages` / `agsPendingPermissionRequests` / `agsRuntimeRuns` write paths |
| **1c** | Tool governance matrix + RAC/CAG trace matrix | `services/mcp/dispatcher.ts`, `services/mcp/proposed-tool-call.ts`, `services/approval/approval-gate.ts`, `services/runtime/trace-writer.ts`, `services/rac/trace/store.ts` |
| **1d** | Test coverage matrix + CI coverage matrix | `tests/agent-studio/**`, `tests/integration/agent-studio/**`, `.github/workflows/run-tests.yml` |
| **1e** | Existing-proven vs still-unverified matrix + severity-ranked gaps + PR-sized implementation sequence | Synthesizes 1a–1d outputs; consumes cycle-5/6/7/8 closure reports |

**Inputs (must be referenced before any new conclusion):**
- Existing 3,181-unit-test baseline + retrofit acceptance suite
- `docs/evidence/agent-studio-rac/` cycle-5/6/7/8 closure reports
- `docs/architecture/PORT_REGISTRY.md` and runtime architecture docs
- Existing RAC orchestrator + post-dispatch outcome chain implementations

**44 certification questions** (grouped):
- Chat streaming (Q1–Q5): token-by-token streaming verification; tool-mode degradation
- SSE robustness (Q6–Q11): heartbeat, reconnect, idempotency
- Persistence (Q12–Q18): user/assistant/tool message lifecycle, retry semantics
- Tool governance (Q19–Q25): validator → approval → dispatcher → audit chain
- RAC/CAG (Q26–Q32): trace writers, context blocks, retrieval evidence
- Boundary integrity (Q33–Q37): OpenRouter Model Access enforcement, raw-credential absence, alternate-lane bypass detection
- Test + CI coverage (Q38–Q44): which tests prove what; which run in default CI

**Acceptance criteria:**
- Audit-first; no runtime behavior changes
- Prior evidence consumed; existing audits referenced before new conclusions
- Findings labeled **Observed / Inferred / Unverified**
- Test audit completes **before** CI changes (Phase 2)
- All runtime lanes covered: chat-stream, blocking chat, test-run-binding, simulation, published runtime

**Output location:** `docs/evidence/runtime-hardening/2026-05-10-phase-1/`

---

### Phase 2 — CI Contract Closure

**Goal:** Add the safety-critical runtime unit subset to default CI as a new **Layer 8**.

**Scope clarification (R6, post Phase 1d):** Phase 1d falsified the V1 hypothesis that retrofit acceptance was outside default CI. `tests/agent-studio/retrofit-acceptance.test.ts` already runs on every PR via `run-tests.yml` Layer 6. Phase 2's actual work is **wiring the safety-critical unit subset** (14 existing tests + 1 new `permission-default.test.ts`) as a new **Layer 8**, not the retrofit acceptance suite.

**Input:** Phase 1d's CI coverage matrix + Phase 1e §4 PR-required classification (units #4 + #14).

**Layer 8 contents** (per Phase 1e §4 unit #4):
1. `tests/agent-studio/proposed-tool-call.test.ts`
2. `tests/agent-studio/approval-gate.test.ts`
3. `tests/agent-studio/sandbox-gate.test.ts`
4. `tests/agent-studio/dispatcher-tool-call-timeout.test.ts`
5. `tests/agent-studio/dispatcher-error-sanitization.test.ts` + `sanitize-mcp-error-message.test.ts`
6. `tests/agent-studio/dispatcher-output-schema-validation.test.ts`
7. `tests/agent-studio/dispatcher-sandbox-error-mapping.test.ts`
8. `tests/agent-studio/runtime-trace-writer.test.ts` + `rac-trace.test.ts`
9. `tests/agent-studio/cag-boundaries.test.ts`
10. `tests/agent-studio/canonical-determinism.test.ts`
11. `tests/agent-studio/h6-c7-client-awaiting-handler.test.ts` + `h7-c7-loop-reentrancy-guard.test.ts`
12. `server/agent-studio/services/mcp/__tests__/dispatcher.test.ts`
13. `server/openrouter/model-access/execute.test.ts`
14. **NEW (to author)** `tests/agent-studio/permission-default.test.ts` — closes the single authorship gap from Phase 1d §3 (M4)

**Constraint — OOM-safe:**
- Layer 8 runs with `--pool=forks --poolOptions.forks.singleFork` (matches existing Layer 5/6/7)
- No broad test-glob expansion
- Heavy DB/integration suites scheduled or manually triggered

**Target file:** `.github/workflows/run-tests.yml`. Placement: after Layer 7 (PMB invariants), before static governance scan.

**Acceptance criteria:** Layer 8 runs on push + PR; failure blocks merge; CI cost documented; the new `permission-default.test.ts` asserts current "no rules → permitted" behavior so Phase 5b's flip is detectable.

---

### Phase 3 — SSE Robustness Baseline

Phase 3 hardens the existing SSE model. **Does not implement true tool-mode streaming** — that's Phase 8. Split into four sub-phases (per pre-flight #1); each is its own PR.

#### Phase 3.1 — SSE heartbeat
Emit `: heartbeat\n\n` SSE comment every 15–30 s. Heartbeat is **never persisted** as a chat message. Interval clears on stream close + error. Long-running stream test proves no indefinite silence.

#### Phase 3.2 — `clientMessageId` idempotency
Add client-generated `clientMessageId` to the stream URL. Backend idempotency key: `(sessionId, clientMessageId)`. Fallback only if needed: `(sessionId, userMessageHash, createdWithinWindow)`. Same `clientMessageId` cannot create duplicate user messages or re-dispatch tools; distinct messages with identical text but different IDs remain allowed.

#### Phase 3.3 — Basic reconnect behavior (MVP)
- Reconnect does not resume partial stream
- Backend idempotency prevents duplicate user messages
- UI clears or marks-failed partial streaming text
- Persisted messages are source of truth
- Already-dispatched tools are not re-dispatched

#### Phase 3.4 — Stream error reconciliation + client-disconnect handling

**Scope expansion (R3, from Phase 1e H2):** Phase 1b confirmed `req.on("close")` returns 0 matches in chat-stream.ts. Long-running tool loops continue dispatching after the user closes the tab, burning model spend. Folding the `AbortController` plumbing into Phase 3.4 since `client_disconnected` is already in the error-code list — same surface, same PR.

Stable error codes:
```
stream_failed
model_failed
tool_failed
approval_blocked
trace_write_failed
audit_write_failed
client_disconnected      ← thread AbortController from req.on("close") → gatewayCall → dispatchMcpToolCall
gateway_failed
retrieval_failed
idempotency_conflict
dispatcher_failed
```

Persistence policy:
- User message: always persisted before model execution
- Assistant partial: persisted-as-partial with status, **or** discarded — consistently
- Tool failure: persisted in trace + audit; visible in runtime diagnostics
- Trace failure: surfaced as `trace_write_failed`; never silently treated as full success
- Audit failure: defined fail-open / fail-closed behavior depending on risk
- Client disconnect: emit `client_disconnected` audit row; abort outstanding gatewayCall + dispatcher; do NOT re-dispatch tools on retry (idempotency-keyed via Phase 3.2)

---

### Phase 4 — Runtime Governance E2E Tests

Prove the full tool-call governance loop end-to-end (Gate 3).

**Path A — valid read-only tool call:** model → validator (permit) → no approval needed → MCP dispatch → tool-call trace + audit row → tool result persisted → assistant continues → final response persisted → UI receives `token`/`tool_start`/`tool_end`/`done`.

**Path B — invalid tool call:** model emits invalid call → validator rejects → no MCP dispatch → rejection trace written → UI receives safe error event → persisted messages remain coherent.

**Path C — approval-required tool call:** request created; **pending** blocks dispatch; **denied** blocks dispatch; **expired** blocks dispatch; **permitted** allows dispatch. Every outcome writes audit + trace evidence.

**Path D — dispatcher failure:** validator + approval permit; dispatcher fails; failure persisted; tool-call trace written; UI receives `tool_end` error; assistant + chat state remain coherent.

---

### Phase 4.5 — Boundary-lint hardening (NEW, R1)

**Goal:** Close Gate 6 static enforcement gaps surfaced by Phase 1a.

Phase 1a §3 row 8 found that current boundary-lint coverage is partial. Existing static rules: CAG boundary, provider-credential-resolver boundary, raw-env-var-key boundary. **Missing rules** (all required for Gate 6):

1. **No raw provider SDK in `server/agent-studio/**`** — grep for `import openai`, `import @anthropic-ai/sdk`, `import google-genai`. Repo is currently clean by inspection but a future regression isn't lint-caught.
2. **`validateRuntimeToolCall` precedes every `dispatchMcpToolCall`** on the chat lanes — currently asserted by `dispatcher-audit-coverage.test.ts` (test, not lint).
3. **Direct `conn.callTool` forbidden outside `dispatcher.ts`** — currently asserted by doc-block (`dispatcher.ts:6`) and tests, not lint.
4. **Approval gate must precede dispatch on approval-required calls** — currently asserted by tests.

**Implementation:** add 4 new scripts under `scripts/check-runtime-boundary-*.ts`, wire into `npm run check` and `.github/workflows/run-tests.yml` boundary-scan steps.

**Acceptance:** all 4 lint rules pass on current main with zero failures (proves they're correctly scoped); seed-failure smoke test confirms each rule actually catches its violation; CI step added.

---

### Phase 5a — Permission Default Impact Analysis + Published Signal Definition

**Goal:** Prepare for Phase 5b without breaking existing agents.

**Published signal definition** (per pre-flight #4):
- Source of truth: `agent.lifecycle.state === "published"` column on the agent row
- Runtime exposure: `runtimeContext.agentLifecycleState`, derived at runtime context construction in `chat-stream.ts`
- Allowed values: `draft | design | simulation | staging | published | archived`
- Fail-closed target: `runtimeContext.agentLifecycleState === "published"` — agent-level, regardless of execution lane (chat, test-run-binding, simulation invoking a published agent — all fail-closed) per pre-flight #6

**Impact scan:** all published / production agents categorized by tool-risk:
- agents with connected MCP tools
- agents with no enabled permission rules
- agents with read_only tools only
- agents with write / destructive / code / external-side-effect tools
- agents with unknown-risk tools
- agents likely to break under fail-closed behavior

**Remediation model (no silent allow-all):**
- `read_only` tools → suggest explicit allowlist
- `write / destructive / code / external-side-effect` → require manual review
- unknown risk → block until classified

**Rollout:** impact report → UI warnings → optional remediation → feature flag → staging/dev → production → rollback path documented.

---

### Phase 5b — Published-Agent Fail-Closed Permission Defaults — **CLOSED**

**Status:** Shipped. `dispatchMcpToolCall` now threads `runtimeContext` through `checkAllowedTools`; when zero enabled rules exist on the draft AND `runtimeContext.agentLifecycleState === "published"` AND the env flag `RUNTIME_FAIL_CLOSED_PUBLISHED_ENABLED=true`, the verdict flips to `deny` with stable audit reason `deny_missing_rules_for_published_agent`. Default-off so the operator first runs `scripts/scan-published-agents-no-rules.ts`, remediates the listed agents, then enables the flag. Closes Gate 5.

**Enforcement logic** (per pre-flight #5):

```ts
function checkAllowedTools(agentDraftId, fullToolName, runtimeContext) {
  const enabledRules = findEnabledPermissionRules(agentDraftId);

  if (enabledRules.length === 0) {
    if (runtimeContext.agentLifecycleState === "published") {
      return { decision: "deny", reason: "deny_missing_rules_for_published_agent" };
    }
    return { decision: "warn_allow", reason: "missing_rules_in_non_published_runtime" };
  }

  // ≥1 rule exists; per-tool evaluation. Tool not covered by any rule = deny.
  return evaluateExplicitRules(enabledRules, fullToolName, runtimeContext);
}
```

**Required denial trace:** agent id, runtime state, tool name, decision, reason, timestamp, request/session/run id, policy version (if available).

**Acceptance:** drafts retain dev-friendly behavior; published deny when no rules; denial writes audit + trace; UI warns before publish; existing agents have remediation path; feature flag can disable enforcement during rollout; tests cover both lifecycle states.

---

### Phase 5c — Simulation lane governance (NEW, R2) — **CLOSED**

**Status:** Shipped via Option A. `simulation.ts` now mirrors the chat-stream lane: `validateRuntimeToolCall` → `gateRuntimeDispatch` → `dispatchMcpToolCall`, with `persistRuntimeToolCallTrace` on both rejection and post-dispatch paths. Simulation does NOT await approval (dry-run surfaces approval-required as a `warning` step verdict; operators see which tools would have required approval without simulation blocking on operator action). `runtimeContext` is forwarded so Phase 5b's published-fail-closed default applies uniformly across lanes (per pre-flight #6). The Phase 4.5 boundary scanner's R2/R4 rules now treat `simulation.ts` as a peer of the chat lanes (`TOOL_DISPATCH_LANE_FILES`).

**Goal:** Close H1 surfaced by Phase 1a/1c — `simulation.ts:439` calls `dispatchMcpToolCall` without ProposedToolCall validator or approval gate.

**Two options** (decision deferred to phase entry):

**Option A — wire validator + gate into simulation.ts** (mirror chat-stream.ts:682/691). Same audit + trace evidence as production lanes; `agsPendingPermissionRequests` rows created for approval-required tools.

**Option B — ADR-deferred exception.** Document simulation as a permanent dispatcher-only-governance lane (only `allowedTools` + `evaluateMcpPreInvoke` enforced) with a clear ADR explaining why ProposedToolCall envelope is intentionally unused for simulation. Risk: simulation of a published agent dispatches governance-sensitive tools without operator approval.

**Recommendation:** Option A. The asymmetry isn't load-bearing and Phase 5b's published-fail-closed behavior should apply uniformly to all lanes (per pre-flight #6). Choose Option B only if Phase 5a impact analysis shows simulation behavior is intentionally permissive.

**Acceptance (Option A):** simulation.ts:439 wraps `dispatchMcpToolCall` with `validateRuntimeToolCall` + `gateRuntimeDispatch` mirroring chat-stream's pattern; `persistRuntimeToolCallTrace` called; tests prove parity with chat-stream governance.

---

## 4. Track B — Runtime Maturity / Post-MVP

### Phase 6 — Lightweight Runtime Config Schema Governance

Add `schemaVersion` to runtime config blocks: `runtimeConfig`, `providerConfig`, `governancePolicy`, `simulationDefaults`, `memoryConfig`, `knowledgeConfig`, `workflowConfig`, `scheduleConfig`, `statusLineConfig`. Initially support only `"1.0.0"`; reject unsupported versions; **no migration engine** until schema drift actually surfaces.

```json
{ "schemaVersion": "1.0.0", "data": { ... } }
```

### Phase 7 — RAC Adapter Reality Matrix + Prior Audit Reconciliation

**Scope discipline** (per Principle 5): consume cycle-5/6/7/8 RAC audits + Phase 1 boundary integrity matrix; **deep-audit only adapter-level gaps** for the seven source types.

| Source type | Adapter | Implemented | Tested | Runtime wired | Citation support | Permission filtering | Production-ready | Gaps |
|---|---|---|---|---|---|---|---|---|
| `document_collection` | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| `vector_index` | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| `graph_index` | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| `knowledge_unit` | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| `tool_knowledge` | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| `external_connector` | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| `cag_pack` | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

(Initial classifications come from Phase 1's boundary integrity matrix; Phase 7 only deep-audits items still labeled `Unverified`.)

### Phase 7.5 — OpenRouter Model Access Streaming Primitive (conditional)

**Required only if** OpenRouter Model Access does not already expose streaming primitives for text deltas + tool-call deltas. Phase 1 audit did **not** conclusively determine this (out of scope for Phase 1a–1d). **R7 — add a Phase 7.5 pre-flight micro-audit** at Phase 7 entry: read `server/openrouter/model-access/execute.ts` + `stream.ts` (if exists), grep for `text_delta` / `tool_call_delta` / `tool_call_complete`, verify whether the normalized stream-event shape below already exists. If yes, skip Phase 7.5 entirely; if no, scope 7.5 work then.

If needed, Model Access must support normalized stream events:

```ts
type ModelAccessStreamEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_call_start"; id: string; name?: string }
  | { type: "tool_call_argument_delta"; id: string; argumentsDelta: string }
  | { type: "tool_call_complete"; id: string; name: string; arguments: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done"; finishReason: string }
  | { type: "error"; code: string; message: string };
```

**Boundary rule (forbidden):** Agent Studio runtime calling raw OpenRouter SDK or raw provider SDK for streaming. Streaming primitives live **inside Model Access**, not in `chat-stream.ts`.

### Phase 8 — True Tool-Mode Streaming via OpenRouter Model Access

Replace the degraded `execute(stream=false)` tool-mode path with:

```
modelAccess.stream(...)
  text_delta              → SSE token
  tool_call_start         → internal accumulation start
  tool_call_argument_delta → internal accumulation only
  tool_call_complete      → validate ProposedToolCall → approval gate → MCP dispatch (if permitted)
                            → SSE tool_start
  MCP dispatch result     → SSE tool_end
  done                    → SSE done
  error                   → SSE error
```

**Fallback rule:** if Model Access streaming is not yet certified, keep degraded mode + UI indicator (`"Streaming is limited while tools are enabled."`). Do **not** introduce raw provider SDK as a workaround.

### Phase 9 — Optional Tool Output Streaming
Add `tool_delta` SSE event for long-running tools. Optional + protocol-versioned. Existing request/response tools unchanged. Tool output remains audited + redacted.

### Phase 10 — Advanced Reconnect / Resume Strategy
**Stretch goal.** Implement only if production telemetry shows frequent disconnects. MVP reconnect (Phase 3.3) is sufficient otherwise. Advanced fields: `streamId`, `lastEventSeq`, `lastPersistedMessageId`, `lastToolCallHash`, `runtimeTraceId`, `Last-Event-ID` resume.

### Phase 11a — Runtime Observability Data Model
Define + capture metrics: stream id, session id, agent id, runtime state, SSE duration, first-token latency, token latency, tool-call count, tool dispatch latency, approval wait time, RAC retrieval latency, context blocks included, trace/audit write status, error reason, client disconnects, model gateway errors, dispatcher failures, validation rejection count, idempotency conflict count.

**Storage decision:** reuse existing trace/audit tables (`agsRuntimeRuns`, `agsRacTraces`, `agsToolCallTraces`, `agsApprovalAudit`) where columns suffice. New columns or tables only when reuse is impossible. Phase 11a freezes schema **before** 11b builds UI.

### Phase 11b — Runtime Observability UI
Add focused observability surfaces on Runtime / RAC / Governance pages + trace detail + chat diagnostics panel. Reuses Phase 11a data; no external APM clone.

### Phase 11c — Runtime Alerts + SLOs
Document SLOs with thresholds (Gate 7 numerics). Alert routing: dashboard banner, admin notification, audit/event log. External integrations (Slack, PagerDuty) optional.

### Phase 12 — Runtime Load Certification
Baseline scenarios: 10 / 25 concurrent no-tool streams; 10 concurrent tool streams; 50 simultaneous RAC retrievals; 100 trace writes/min; 50 pending approvals; long-running stream > 2 min; client disconnect storm; **approval expiry under load** (denials/expirations cascading); MAX_TOOL_TURNS under load.

---

## 5. Boundary integrity (always-on rules)

**Forbidden in `server/agent-studio/**`:**
- Raw provider SDK imports (`openai`, `@anthropic-ai/sdk`, etc.)
- Direct MCP tool execution outside `dispatchMcpToolCall`
- Direct raw-credential access
- Unvalidated tool dispatch (bypassing ProposedToolCall)
- Unaudited tool result writes
- RAC/CAG context construction without traceability

**Required:**
- Model execution → OpenRouter Model Access only
- Tool execution → ProposedToolCall validation → approval gate (if needed) → MCP dispatcher → audit + trace
- Context execution → RAC/CAG orchestrator → prompt composer → context block trace → retrieval/source evidence

The `boundary-lint` allowlist (cycle-5/6) enforces these statically.

---

## 6. Sprint plan (with parallelism markers)

PRs marked `[parallel]` may run concurrently with prior PRs. PRs marked `[serial]` must wait for the prior PR.

**Updated post Phase 1 (R5):** units 1–6 actually shipped as 2 PRs (V3 doc + Phase 1a–1e bundle) since the 4 audit matrices are doc-only and don't conflict. Phase 4.5 (R1) and Phase 5c (R2) inserted; M3 standalone fix (R4) added as unit 0.5; H2 folded into Phase 3.4 (R3).

| Order | PR | Phase | Parallelism | Touches |
|---|---|---|---|---|
| 1 | `docs(runtime): runtime hardening roadmap V3` | (this doc) | — | docs only |
| 2 | `audit(runtime/1a-1e): Phase 1 closure (5 files bundled)` | 1a–1e | [parallel sub-agents → bundled PR] | docs only |
| 2.5 | `fix(agent-studio): AgentChatPage awaiting_approval parity` | M3 standalone | [parallel — disjoint file] | client only |
| 3 | `docs(runtime): roadmap V3 R1–R7 revisions` | (this PR) | [parallel with 2.5] | docs only |
| 4 | `ci(runtime): Layer 8 — safety-critical unit subset + new permission-default test` | 2 | [serial — needs Phase 1d findings] | `.github/workflows/run-tests.yml` + 1 new test |
| 5 | `feat(runtime): SSE heartbeat (Phase 3.1)` | 3.1 | [serial — `chat-stream.ts`] | server + tests |
| 6 | `feat(runtime): clientMessageId idempotency (Phase 3.2)` | 3.2 | [serial — `chat-stream.ts`] | server + client + tests |
| 7 | `feat(runtime): basic reconnect (Phase 3.3)` | 3.3 | [serial — `chat-stream.ts`] | client + tests |
| 8 | `feat(runtime): error reconciliation + client-disconnect (Phase 3.4)` | 3.4 + H2 | [serial — `chat-stream.ts`] | server + client + tests |
| 9 | `test(runtime): governance E2E paths A–D` | 4 | [parallel — different files] | tests only |
| 10 | `feat(runtime): boundary-lint hardening (Phase 4.5)` | 4.5 | [parallel with 9] | scripts + workflow |
| 11 | `audit(runtime/5a): permission impact + published signal` | 5a | [parallel with 9/10] | docs + minor schema |
| 12 | `feat(runtime): fail-closed published permission defaults` | 5b | [serial — needs 5a] | server + client + tests |
| 13 | `feat(runtime): simulation lane governance (Phase 5c, Option A or B)` | 5c | [serial — decision deps on 5a impact] | simulation.ts + tests OR ADR-only |
| 14+ | Track B phases 6 → 12 | various | as scoped | — |

**Effective sprint length:** ~5 sequential slots for Track A (vs 13 if fully serialized) due to parallelism in 2.5+3, 9+10+11.

---

## 7. Progress tracking

### Phase status

| Phase | Status | Branch / PR | Closure |
|---|---|---|---|
| Plan doc V3 | **Done** | PR #383 | merged @ `3d12d03` |
| 1a–1e | **Done** | PR #384 (bundled) | merged @ `0977186` |
| M3 standalone fix | **In-Progress** | PR #385 | — |
| Roadmap R1–R7 revisions | **In-Progress** | (this PR) | — |
| 2 | Pending | — | — |
| 3.1 | Pending | — | — |
| 3.2 | Pending | — | — |
| 3.3 | Pending | — | — |
| 3.4 (incl. H2 client-disconnect) | Pending | — | — |
| 4 | Pending | — | — |
| 4.5 (NEW — boundary-lint) | Pending | — | — |
| 5a | Pending | — | — |
| 5b | Pending | — | — |
| 5c (NEW — simulation governance) | Pending — Option A/B decision deferred | — | — |
| 6 | Pending | — | — |
| 7 | Pending | — | — |
| 7.5 | Conditional (R7 pre-flight at Phase 7 entry) | — | — |
| 8 | Pending | — | — |
| 9 | Pending | — | — |
| 10 | Pending (stretch) | — | — |
| 11a | Pending | — | — |
| 11b | Pending | — | — |
| 11c | Pending | — | — |
| 12 | Pending | — | — |

### PR ledger

| # | PR | Title | Status |
|---|---|---|---|
| 1 | #383 | docs(runtime): Agent Studio Runtime Hardening Roadmap V3 | merged `3d12d03` |
| 2 | #384 | audit(runtime/1a-1e): Phase 1 closure — wiring, SSE, governance, tests, synthesis | merged `0977186` |
| 3 | #385 | fix(agent-studio): AgentChatPage handles awaiting_approval SSE event (Phase 1e M3) | open |
| 4 | (this PR) | docs(runtime): Roadmap V3 R1–R7 revisions post-Phase 1 | open |

### Definition-of-Done gate status

| Gate | Status |
|---|---|
| Gate 1 — Runtime Contract Evidence | CLOSED (Phase 1a–1e shipped #384/#386 + Phase 1e remediation #387) |
| Gate 2 — CI Enforcement | CLOSED (Layer 8 wired #388 — runs on push + PR) |
| Gate 3 — Runtime Governance E2E | Pending (closes after Phase 4) |
| Gate 4 — SSE Robustness | CLOSED (Phase 3.4 #391) |
| Gate 5 — Published Fail-Closed | CLOSED (Phase 5a #393 + Phase 5b — gated on `RUNTIME_FAIL_CLOSED_PUBLISHED_ENABLED=true`) |
| Gate 6 — Boundary Integrity (static) | CLOSED (Phase 4.5 #392 — 4 static rules wired into CI) |
| Gate 7 — Observability + Load | Pending (closes after Phase 12) |

**Production-ready** when Gates 1–6 close. **Reference-grade** when Gate 7 also closes.

**Production-ready as of Phase 5b: 5 of 6 gates closed.** Gate 3 (Runtime Governance E2E) is the last remaining production-readiness gate; closes after Phase 4.

---

## 8. Final target architecture

```
Agent Studio Runtime
├── Chat Transport
│   ├── tRPC session/message CRUD
│   ├── SSE token stream
│   ├── heartbeat (Phase 3.1)
│   ├── clientMessageId idempotency (Phase 3.2)
│   ├── MVP reconnect (Phase 3.3)
│   ├── optional advanced resume (Phase 10)
│   └── stable error reconciliation (Phase 3.4)
│
├── Stream Protocol
│   ├── versioned event contract
│   ├── token / tool_start / tool_delta? / tool_end / heartbeat / done / error
│
├── Model Execution
│   ├── OpenRouter Model Access only
│   ├── streaming no-tools path
│   ├── streaming tool-call path (Phase 8, depends on 7.5)
│   └── degraded fallback when tool streaming unavailable
│
├── Runtime Context
│   ├── CAG capability pack
│   ├── RAC retrieval evidence
│   ├── prompt composer
│   ├── context budget enforcement
│   ├── citation/source references
│   └── trace context blocks
│
├── Tool Governance
│   ├── MCP registry snapshots
│   ├── ProposedToolCall validation
│   ├── approval gate
│   ├── MCP dispatcher (single chokepoint)
│   ├── sandbox routing
│   ├── audit rows + tool-call traces
│   └── published-agent fail-closed defaults (Phase 5b)
│
├── Persistence
│   ├── user / assistant / tool messages
│   ├── clientMessageId records
│   ├── stream state, runtime/tool traces, approval+audit events
│
├── Runtime Config Governance
│   └── schemaVersion + write validation (Phase 6)
│
├── RAC Adapter Governance (Phase 7)
│   └── seven source types with explicit production status
│
└── Observability (Phase 11a/b/c + 12)
    ├── runtime metrics + dashboard
    ├── SLOs + alerts
    └── load certification evidence
```

---

## 9. Execution model

This roadmap is executed under **autonomous continuous-phase execution authority** (per `feedback_continuous_phase_execution.md` + `feedback_full_autonomous_execution.md`). After each phase's closure report merges, the next phase starts immediately. The user can override mid-stream.

**Multi-agent parallelism:** Phase 1 audit sub-PRs (1a–1d) run as parallel general-purpose subagents; their outputs are synthesized by 1e. Subsequent phases that share `chat-stream.ts` serialize; phases on disjoint files (e.g., Phase 4 tests vs Phase 5a impact scan) parallelize.

**Multi-session continuation:** when a phase's local validation exceeds device capacity (Termux SIGKILL on heavy `pnpm` runs), CI is the canonical validator. ScheduleWakeup is used to resume work after long-running CI completes.

**Closure reports:** every phase produces a closure report under `docs/evidence/runtime-hardening/phase-{N}/` mirroring the cycle-5/6/7/8 pattern. Reports are referenced from §7 progress tracking.
