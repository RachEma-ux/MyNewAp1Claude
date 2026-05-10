# Phase 1e — Synthesis: proven-vs-unverified matrix + severity-ranked gaps + PR-sized Phase 2+ sequence

**Roadmap reference:** `docs/implementation/agent-studio-runtime-hardening-roadmap.md` Phase 1e
**Date:** 2026-05-10
**Branch baseline:** `main @ 3d12d03`
**Inputs:** `01-wiring-and-boundary-integrity.md` (1a), `02-sse-and-persistence.md` (1b), `03-governance-and-trace.md` (1c), `04-test-and-ci-coverage.md` (1d)
**Audit type:** Synthesis — derives from 1a–1d. No new code reads.

---

## 1. Executive verdict

**Gate 1 (Runtime Contract Evidence Gate) is closeable on this audit set with three caveats:**
- 0 safety-critical paths remain `Unverified` after this synthesis. Every chat-lane scenario in §2 has at least an Observed or Inferred classification.
- 2 architectural exceptions surface that are not in the V3 plan and need follow-up issues filed: **simulation lane bypass** (HIGH) and **no client-disconnect handling** (HIGH).
- 1 finding falsifies a V1 audit assumption: **retrofit acceptance IS in default CI today** (`run-tests.yml` Layer 6). Phase 2's scope shifts from "wire retrofit acceptance" to "wire the safety-critical unit subset."

The runtime architecture is structurally sound. The cycle-5/6/7/8 work has produced strong inline doc-blocks, parallel-flow lockstep between chat-stream.ts and chat.ts, and a fatal-audit / best-effort-trace asymmetry that is internally consistent. The closure work is genuinely **enforcement gaps**, not architectural drift.

---

## 2. Existing-proven vs still-unverified matrix

For each safety-critical path, classify based on 1a–1d findings.

### 2.1 Chat-stream lane (governed runtime path)

| Safety path | Status | Evidence (file:line / report ref) |
|---|---|---|
| User message persisted before model call | **Observed** | 1b §2; chat-stream.ts:1136 |
| RAC/CAG context built via single composer | **Observed** | 1a §1.1; rac-orchestrator.ts:485 → system-prompt-composer.ts |
| Model execution through OpenRouter Model Access only | **Observed** | 1a §3 row 1; chat-stream.ts:503,983; chat.ts:511,953; zero raw SDK imports in `server/agent-studio/**` |
| ProposedToolCall validator runs before every dispatch | **Observed** | 1c §1; chat-stream.ts:682, chat.ts:626 |
| Approval gate honored (required/pending/denied/expired/permitted) | **Observed** (5/5 transitions, 1 timing-edge **Inferred**) | 1c §2; approval-gate.ts state machine |
| MCP dispatcher chokepoint | **Observed** | 1a §3 row 2; 5 callers enumerated, 3 governed, 2 deliberately bypass-by-design |
| Tool-call trace written (best-effort) | **Observed** | 1c §1; persistRuntimeToolCallTrace at proposed-tool-call-runtime.ts:527 |
| Audit row written (FATAL) | **Observed** | 1c §1; dispatcher.ts:850 writeAuditRow |
| RAC end-of-stream trace (fire-and-forget) | **Observed** | 1b §2; chat-stream.ts:1308 |
| Tool result persisted BEFORE SSE emission (M5-c7) | **Observed** | 1b §2; chat-stream.ts:843-852 |
| User message has idempotency key | **Observed gap** | 1b §4 — **0 idempotency** today, no `clientMessageId` read anywhere |
| SSE heartbeat emitted | **Observed gap** | 1b §1 — **0 heartbeat** today |
| Stable error codes on `error` events | **Observed gap** | 1b §1 — only 4 of 11 codes populated; catch-all has no `code` field |
| Client-disconnect handling | **Observed gap (NEW)** | 1b §3 — **0 matches** for `req.on("close")` / `req.aborted` |
| `awaiting_approval` UI parity (FAB + main page) | **Observed gap (NEW)** | 1b §5 — `AgentChatPage.tsx:195-208` doesn't discriminate; falls to red error chip |

### 2.2 Blocking-chat lane (chat.ts)

| Safety path | Status | Evidence |
|---|---|---|
| User message persisted before model call | **Observed** | 1b §2; chat.ts:1063 |
| Validator + approval + dispatcher chain matches chat-stream (lockstep) | **Observed** | 1c §1; cycle-6 C1-c6 |
| End-of-stream RAC trace written | **Observed gap (asymmetry)** | 1a §5 finding #2; chat.ts has no `writeTrace` call. Documented as intentional in chat.ts:692-706, but revisit candidate |
| Tool-call trace + audit write | **Observed** | 1c §1; same code path as chat-stream |

### 2.3 Test-run-binding lane

| Safety path | Status | Evidence |
|---|---|---|
| Tools-less by design (no validator/gate/dispatcher chain needed) | **Observed (vacuously)** | 1c §4; test-run-binding.ts:220-230 |
| Provider-use governance (Phase 21) | **Observed** | test-run-binding.ts:207 |
| CAG/RAC system prompt composer | **Observed** | test-run-binding.ts:171 → buildRuntimeSystemPrompt |
| Model Access boundary | **Observed** | test-run-binding.ts:234 gatewayCall |

### 2.4 Simulation lane

| Safety path | Status | Evidence |
|---|---|---|
| Validator before dispatch | **Observed bypass — HIGH severity** | 1a §5 #1, 1c §5; simulation.ts:439 calls dispatcher directly |
| Approval gate | **Observed bypass — HIGH severity** | 1c §5; no `agsPendingPermissionRequests` row created |
| Dispatcher's internal allowedTools + preInvoke + sandbox routing | **Observed** | dispatcher.ts:421-443 still fires |
| Audit row written | **Observed** | dispatcher.ts:850 still fires (runtimeRunId is non-null) |
| Per-PTC tool-call trace (`agsToolCallTraces`) | **Observed gap** | 1a §5 #1 — `persistRuntimeToolCallTrace` not called in simulation |

### 2.5 Static enforcement (Gate 6)

| Boundary | Static rule exists? | Evidence |
|---|---|---|
| CAG boundary (services/cag/** import restrictions) | **Observed** | `scripts/check-cag-boundary.ts` Rules A/B/C |
| Provider credential resolver boundary | **Observed** | `scripts/check-provider-credential-resolver-boundary.ts` |
| Raw env-var key boundary | **Observed** | `scripts/check-provider-key-env-boundary.ts` |
| **Raw provider SDK absence in `server/agent-studio/**`** | **Gap** | 1a §3 row 8 — no script greps for `import openai\|@anthropic-ai/sdk\|google-genai` |
| **`validateRuntimeToolCall` precedes every `dispatchMcpToolCall`** | **Gap** | 1a §3 row 8 — asserted by tests, not lint |
| **Direct `conn.callTool` forbidden outside dispatcher.ts** | **Gap** | 1a §3 row 8 — asserted by doc-block (dispatcher.ts:6) and tests |
| **Approval gate must precede dispatch on approval-required calls** | **Gap** | 1a §3 row 8 — asserted by tests |

### 2.6 Test + CI coverage

| Phase-2 category | Has test? | In default CI? | Evidence |
|---|---|---|---|
| Retrofit acceptance | Yes | **Yes** | 1d §2 Layer 6 — falsifies V1 hypothesis |
| Chat-stream contract (SSE event shape, persistence) | Partial (DB-gated) | No | 1d §3 — net gap is pure-surface SSE shape test |
| MCP dispatcher boundary | Yes (10 files, 1,800+ lines) | No | 1d §1c |
| ProposedToolCall validation | Yes (4 files, 1,227 lines) | Yes (via retrofit-acceptance §D-PTC-2) | 1d §3 |
| Approval gate state machine | Yes (9 files, ~1,568 lines) | Yes (via retrofit-acceptance §D-APP-EXT-2) | 1d §3 |
| Permission default behavior (no rules → ?) | **No** | No | 1d §3 — **single authorship gap** |
| OpenRouter Model Access boundary | Yes | Partial (3/4 in Layer 5; `execute.test.ts` not wired) | 1d §3 |
| RAC/CAG trace contract | Yes (8 files) | Yes (partial via retrofit-acceptance) | 1d §3 |
| Provider credential boundary | Yes | Yes (D1+D2 scripts + Layer 7) | 1d §3 |

---

## 3. Severity-ranked gap list

### HIGH — block Gate 1 closure or block Phase 2 progress

**H1. Simulation lane bypass of ProposedToolCall validator + approval gate.** `simulation.ts:439` dispatches without Gates 1/2/7/8 of the validator and creates no `agsPendingPermissionRequests` row for approval-required tools. Dispatcher's internal allowedTools + preInvoke still fire, but a tool with `riskClass: governance_sensitive` would be dispatched in simulation without operator approval. **Action:** add validator + gate wiring to simulation.ts mirroring chat-stream.ts:682/691. Or document as explicit deferred exception with ADR. **Phase: 5b extension or new Phase 5c.**

**H2. No client-disconnect handling.** `req.on("close")` returns 0 matches; long-running tool loops continue dispatching after the user closes the tab, burning model spend. **Action:** thread an `AbortController` from req-close → gatewayCall → dispatchMcpToolCall. Add `client_disconnected` SSE error code (already in Phase 3.4 list). **Phase: new Phase 3.5 or fold into 3.4 — recommend the latter to keep sprint count stable.**

### MEDIUM — close before Gate 6 (boundary integrity static enforcement)

**M1. Boundary-lint gaps for Gate 6.** Four required static rules don't exist: (a) raw provider SDK in `server/agent-studio/**`, (b) `validateRuntimeToolCall` precedence, (c) approval-gate precedence on approval-required, (d) `conn.callTool` outside dispatcher. **Action:** author 4 lint rules. Repo is currently clean by inspection so the lint adds zero failures today; pure-regression-prevention. **Phase: insert as Phase 4.5 (boundary-lint hardening) between governance E2E (Phase 4) and permission impact (Phase 5a).**

**M2. `chat.ts` (blocking) doesn't write end-of-stream RAC trace.** Asymmetry vs chat-stream.ts. Documented intentional in chat.ts:692-706. **Action:** revisit during Phase 11a observability data model design — if blocking-chat sessions need to appear in operator dashboards, add the write; otherwise codify the asymmetry as permanent. **Phase: 11a.**

**M3. UI parity for `awaiting_approval` status.** `AgentChatPage.tsx:195-208` doesn't discriminate; falls to red error chip. Only `AgentStudioChatWindow.tsx:298-313` (FAB) handles it. **Action:** small standalone fix PR before Phase 3.x (since Phase 3 will surface more SSE event variants). **Phase: pre-3.1 fix PR — recommend opening immediately.**

**M4. Permission default test missing.** `tests/agent-studio/permission-default.test.ts` does not exist. The only true authorship gap surfaced by Phase 1d. **Action:** author the test as part of Phase 2's Layer 8 — needs to assert today's "no rules → permitted" behavior so Phase 5b's flip to "no rules → deny for published" is detectable. **Phase: 2 (bundle with Layer 8 wiring).**

### LOW — track but don't block

**L1. SSE event types not centrally typed.** Only `AwaitingApprovalEvent` is exported (`chat-stream.ts:124`). Token/tool_start/tool_end/done/error are inline literals. **Action:** export discriminated union covering all variants. **Phase: 3.4 (when adding stable error codes anyway).**

**L2. `tool_knowledge_retrieval` mode end-to-end untested.** No production caller emits `toolKnowledgeIds` (proposed-tool-call.ts:127, C3-c6 doc). Wiring exists, no callers. **Action:** add wiring test if the mode is actually used; otherwise dead-code-remove. **Phase: 7 (RAC adapter reality matrix).**

**L3. Per-chunk RAC rejection-reason audit row.** Filter rejection counts persist on the trace row; per-chunk reasons don't. **Action:** decide if forensic value justifies the row. **Phase: 11a (observability data model).**

---

## 4. PR-sized implementation sequence for Phase 2+

This sequence consumes the V3 sprint plan §6, applies the Phase 1 findings, and produces concrete PR-sized work units for Phase 2 through 5b. Each unit is sized for one PR.

### Track A — production readiness

| # | Unit | Phase | Estimated PR size | Depends on |
|---|---|---|---|---|
| 1 | Bundle Phase 1a–1d audit matrices (this PR) | 1a–1d | 4 files / ~700 lines | doc-only |
| 2 | Phase 1e synthesis (this file) | 1e | 1 file / ~250 lines | 1a–1d |
| 3 | **UI fix: `awaiting_approval` parity in AgentChatPage** | M3 fix | ~30 lines client | none — can land before/parallel to 4 |
| 4 | **CI Layer 8 — Runtime Hardening Safety Subset** (14 existing tests + 1 new permission-default test) | 2 | ~80 lines workflow + ~150 lines new test | 1d (bundle approved) |
| 5 | Phase 3.1 — SSE heartbeat | 3.1 | ~40 lines server + 1 test | 4 |
| 6 | Phase 3.2 — `clientMessageId` idempotency | 3.2 | ~120 lines server (entry param + repo lookup + UNIQUE INDEX) + ~40 lines client + 2 tests | 5 (chat-stream.ts touched) |
| 7 | Phase 3.3 — Basic reconnect | 3.3 | ~60 lines client + 1 test | 6 |
| 8 | Phase 3.4 — Stream error reconciliation + **client-disconnect handling (H2)** | 3.4 + new | ~200 lines server (codes + AbortController plumbing) + ~30 lines client | 7 |
| 9 | Phase 4.5 (NEW) — Boundary-lint hardening (M1) | 4.5 | 4 lint scripts + workflow wire-up + smoke tests | 4 (CI subset stable) |
| 10 | Phase 4 — Runtime governance E2E paths A–D | 4 | ~400 lines integration tests | 4, 8 (SSE robustness in place) |
| 11 | Phase 5a — Permission default impact + published signal definition | 5a | doc + impact-scan script + ~60 lines runtime context plumbing | 4 |
| 12 | Phase 5b — Published-agent fail-closed permission defaults | 5b | ~150 lines server (enforcement) + ~40 lines UI warning + 2 tests | 11 |
| 13 | Phase 5c (NEW) — Simulation lane validator + gate wiring (H1) | 5c | ~80 lines simulation.ts + 2 tests OR ADR-only deferral | 12 (decision-level alignment with 5b) |

### Track B — runtime maturity (post-MVP)

| # | Unit | Phase | Estimated PR size | Depends on |
|---|---|---|---|---|
| 14 | Phase 6 — Runtime config schemaVersion | 6 | ~100 lines schema + validators + tests | 13 |
| 15 | Phase 7 — RAC adapter reality matrix | 7 | doc + minimal wiring tests | 13 |
| 16 | Phase 7.5 (conditional) — Model Access streaming primitive | 7.5 | only if Model Access doesn't already expose it; Phase 1 didn't conclusively check this | 15 |
| 17 | Phase 8 — True tool-mode streaming | 8 | ~250 lines chat-stream.ts + ~50 lines client | 16 |
| 18 | Phase 9 — Optional tool output streaming | 9 | ~120 lines server + ~30 lines client | 17 |
| 19 | Phase 10 — Advanced reconnect (stretch) | 10 | conditional on telemetry | 17 |
| 20 | Phase 11a — Observability data model | 11a | doc + schema migration | 13 |
| 21 | Phase 11b — Observability UI | 11b | ~400 lines UI | 20 |
| 22 | Phase 11c — Alerts + SLOs | 11c | doc + alert-config table + threshold UI | 20 |
| 23 | Phase 12 — Load certification | 12 | scripts + report | 22 |

**Effective Phase 2–5b sprint length:** 5 sequential slots due to chat-stream.ts serialization on units 5/6/7/8; units 3, 9, 10, 11 can parallelize.

---

## 5. Recommended roadmap revisions

These deltas should be applied to `docs/implementation/agent-studio-runtime-hardening-roadmap.md` in a follow-up doc PR, after this audit lands:

| # | Revision | Why |
|---|---|---|
| R1 | **Add Phase 4.5 — Boundary-lint hardening** between Phase 4 and Phase 5a | Closes M1; required for Gate 6 static enforcement. Out-of-scope of any V3 phase as written. |
| R2 | **Add Phase 5c — Simulation lane governance** (or fold into 5b with explicit ADR deferral) | Closes H1. Pre-flight #6 covered test-run-binding but not simulation. |
| R3 | **Fold client-disconnect handling into Phase 3.4** (don't create a separate phase) | Closes H2. Already in scope of the Phase 3.4 stable-error-codes list (`client_disconnected`); just needs the `AbortController` plumbing called out. |
| R4 | **Add `M3` UI parity fix as a pre-Phase-3.1 standalone PR** in §6 sprint plan | Closes M3. Independent of the Phase 3 SSE work; can land in parallel. |
| R5 | **Update §6 sprint plan parallelism markers** to reflect actual unit dependencies surfaced here | Original §6 listed 1a/1b/1c/1d as 4 PRs; this audit bundled them into 1 PR for review efficiency. Sprint plan should say "decomposed by file but bundled by PR for doc-only work; code-touching phases serialize on chat-stream.ts." |
| R6 | **Update Phase 2 scope** from "wire retrofit acceptance" to "wire safety-critical unit subset" | Phase 1d falsified the V1 assumption that retrofit acceptance wasn't in default CI. Phase 2's actual work is the Layer 8 add. |
| R7 | **Phase 7.5 condition resolution** — Phase 1 did not conclusively check whether OpenRouter Model Access exposes `text_delta` + `tool_call_delta` streaming primitives | Add a Phase 7.5 pre-flight audit (small) before deciding whether 7.5 is needed. Could happen at Phase 7 entry. |

---

## 6. Gate status update

| Gate | Phase 1 status | Closure path |
|---|---|---|
| Gate 1 — Runtime Contract Evidence | **Closeable on this audit set** with H1, H2, M1–M4 acknowledged via follow-up issues | Merge this PR + open 6 follow-up issues |
| Gate 2 — CI Enforcement | Pending — Phase 2 scope clarified (Layer 8 add, not retrofit-acceptance) | Phase 2 PR (unit #4 above) |
| Gate 3 — Runtime Governance E2E | Pending — needs Phase 4 paths A–D | Phase 4 PR (unit #10) |
| Gate 4 — SSE Robustness | Pending — Phase 3.1–3.4 all confirmed necessary | Phase 3 PR sequence (units #5–#8) |
| Gate 5 — Published Fail-Closed | Pending — Phase 5a/5b scope clarified by 5a's published-signal work | Phase 5 PR sequence (units #11–#13) |
| Gate 6 — Boundary Integrity (static) | **Pending — Phase 4.5 added** (NEW) | Phase 4.5 PR (unit #9) |
| Gate 7 — Observability + Load | Pending (Track B) | Phase 11–12 PR sequence |

---

## 7. Action items (to be filed as GitHub issues after merge)

1. **H1 — Simulation lane bypass:** decide validator-wire-in vs ADR deferral for Phase 5c
2. **H2 — Client-disconnect handling:** fold into Phase 3.4 with `AbortController` plumbing
3. **M1 — Boundary-lint hardening:** Phase 4.5 (4 lint rules + workflow)
4. **M2 — chat.ts RAC trace asymmetry:** revisit during Phase 11a; codify as permanent if not closed
5. **M3 — `awaiting_approval` UI parity:** standalone fix PR before Phase 3.1
6. **M4 — Permission default test:** bundle into Phase 2 Layer 8 add
7. **Roadmap revisions R1–R7:** doc PR after this audit merges

---

**End of Phase 1e synthesis.** All four 1a–1d matrices + this synthesis ship together as one Phase 1 closure PR.
