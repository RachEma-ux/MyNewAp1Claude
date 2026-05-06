# Agent Studio Retrofit — Follow-up Task List

**Owner:** Agent Studio module + Governance
**Status:** Tracking — none blocking; retrofit closed at `55c8b6b` (P14, 2026-05-06).
**Source:** Recorded as work was deferred during the 14-phase retrofit; cross-references the closure doc at `docs/implementation/agent-studio-retrofit-acceptance.md`.

This document is the contract for what the retrofit deliberately did *not* do. Each item names the deferral reason, the locked decision it falls under, and a concrete acceptance test for closing it.

---

## A. Wiring (highest priority — services exist, call sites don't)

### A1 — Wire the ProposedToolCall validator into `chat-stream` ✅

**Status:** CLOSED. Merged at `fea62fc` (PR #198, 2026-05-06).

Wired the Phase 8 validator into both runtime tool-call paths (`chat-stream.ts` SSE + `services/chat.ts` blocking) via a new helper at `services/runtime/proposed-tool-call-runtime.ts`. Production tool-use envelopes don't yet carry rationale + evidence; the helper builds a manifest-derived envelope so gates 5/6 are tautological. **Active gates with this envelope shape:** `invented_tool`, `missing_parameter`, `invented_parameter`, `quarantined_tool`, `sandbox_required`. When tool-use envelopes evolve to carry rationale + evidence, gates 3/4 will fire automatically — the helper accepts those fields when present.

On rejection: tool-role message persisted with `{error, code, gate:"proposed_tool_call_validator"}`; chat-stream also emits a `tool_end` SSE event. Dispatcher is **never** invoked for a rejected call.

9 unit tests cover every active gate + manifest-derived risk + manifest-derived approval. Full retrofit suite (90 tests across 5 files) still green. Helper returns a flattened `RuntimeValidationResult` so callers branch on `ok` cleanly under `strictNullChecks:false`.

### A2 — Wire the approval gate into the dispatch path ✅

**Status:** CLOSED. Merged at `23a7bf2` (PR #200, 2026-05-06).

`gateRuntimeDispatch` composes the validator + approval gate into a single runtime verdict. Decision tree: validator-rejected → reason=`validator_rejected`; `requiresApproval=false` → ok=true (gate not invoked); gate `permit` → ok=true; gate `denied`/`expired`/`pending` → matching reason; gate `approval_required` → `createApprovalRequest`, then reason=`approval_required`. Wired into both `chat-stream.ts` and `services/chat.ts`. Live chat has no formal runtime-run row — `sessionId` stands in as the surrogate `runtimeRunId` on freshly-created approval rows. 8 unit tests with injected fakes for `evaluateApprovalGate` / `createApprovalRequest`.

### A3 — Wire the trace writer ✅

**Status:** CLOSED. Merged at `c49b83f` (PR #201, 2026-05-06).

`persistRuntimeToolCallTrace` writes one `agsToolCallTraces` row per runtime tool-call attempt — rejected by validator, rejected by approval gate, dispatched ok, dispatched error. `dispatchResult` becomes `"ok" | "error" | "blocked"`; `errorMessage` and `durationMs` from the dispatcher; `approvalDecision` derived from the verdict. Best-effort writer — failures are swallowed so trace persistence never blocks the chat loop. `agentId` threaded through the inner runtime loops in both `chat-stream.ts` and `services/chat.ts`. Latent narrowing bug in `trace-writer.ts(48)` fixed in-flight (same `Extract<...>` cast pattern as the original P11 fix). 14 unit tests cover every dispatch shape and verdict-to-decision mapping.

### A4 — Auto-trigger `syncToolKnowledge` on registry republish ✅

**Status:** CLOSED. Merged at `fed8969` (PR #202, 2026-05-06).

Two new surfaces: `services/mcp/registry.ts` gains `subscribeSnapshots(listener)` (returns unsubscribe). `publishSnapshot` fires every listener with `{current, previous}` after the snapshot is committed. Listener exceptions and async rejections swallowed so a buggy subscriber never breaks the connect flow. `services/mcp/auto-sync.ts` wraps `syncToolKnowledge` as a registry subscriber via `installAutoSync({resolveContext})`. The resolver translates the registry's per-process `serverId` into the workspace + canonical-server-id + knowledge-source-id triple `syncToolKnowledge` needs; returning `null` skips the publish (opt-in path). Sync failures fire `onError` but never throw. Subscriber is **not auto-mounted yet** — operators explicitly call `installAutoSync` after they have a `tool_knowledge` `agsRacSources` row. 10 unit tests cover the listener API + orchestration.

---

## B. Coverage (pure helpers tested; DB-touching paths need ASDB e2e)

### B1 — DB-backed e2e for `syncToolKnowledge` ✅

**Status:** CLOSED. Merged at `05f5e75` (PR #204, 2026-05-06).

`tests/integration/agent-studio/sync-tool-knowledge.integration.test.ts` exercises the full Phase 7 round-trip against a live ASDB: insert path (mirror + `tool_knowledge` units materialize per D-NKU-6), hash-drift path (description change updates row + writes new unit; disappeared tool flips `available=false`), idempotent path (zero updates on re-sync). Auto-skips when DB env unset.

### B2 — DB-backed e2e for the approval gate ✅

**Status:** CLOSED. Merged at `05f5e75` (PR #204, 2026-05-06).

`tests/integration/agent-studio/approval-gate.integration.test.ts` covers the full lifecycle: create + idempotency on `(agentDraftId, proposedToolCallHash)`, evaluate-pending, decide-allowed (expiresAt set + audit row in `agsRuntimePolicyEvents` per D-APP-EXT-6 + lastUsedAt bumped + gate flips to permit), forced expiry → expired, denied stays denied, decide-on-decided returns terminal state without a second audit row.

### B3 — DB-backed e2e for the trace writers ✅

**Status:** CLOSED. Merged at `05f5e75` (PR #204, 2026-05-06).

`tests/integration/agent-studio/trace-writer.integration.test.ts` covers `recordToolCallTrace` happy path / rejection-nulls-downstream / ok+permit-surfaces-approval, plus `patchRacRuntimeTrace` for `plannerMode` + `plannerReason` + `cagCompiledHash`.

### B4 — Operator visual review of `RetrofitPage` ✅

**Status:** CLOSED (procedure documented). Merged at `05f5e75` (PR #204, 2026-05-06).

Procedure recorded at `docs/implementation/agent-studio-retrofit-page-smoke.md` — per-tab checklist (Ingestion / Knowledge Units / Provenance / Tool Knowledge / Approvals) + cross-cutting checks + failure recording protocol. Operators run the procedure after any PR that touches `RetrofitPage.tsx` or the four P11 routers.

---

## C. Latent cleanup surfaced during P11

These were fixed in PR #193 but are worth recording as follow-up considerations for the broader codebase.

### C1 — `tsconfig.json` exclude policy is fragile

The project excludes `**/agent*`, but `api/router.ts` (entry point) transitively pulls in much of `services/agent-studio/**` once a new chain forms (e.g., P11's router → approval gate → proposed-tool-call). This is *why* the three latent typecheck issues only surfaced at P11. Two clean alternatives:

- (a) Tighten the include surface to `server/_core/**` + transitive (today's effective scope) and accept that latent errors will keep appearing.
- (b) Drop the `**/agent*` exclude entirely so all of `server/agent-studio/**` is type-checked. Pay the one-time cost of fixing whatever it surfaces.

Recommendation: (b). The retrofit's pure-helper code paid the cost gracefully; the rest of agent-studio likely has a similar cleanup density.

### C2 — `pdf-parse` import shape

The runtime check `typeof pdfParseModule === "function"` works against both CJS and ESM bundles. If pdf-parse upgrades and changes its export shape again, the test surface in P3 (`tests/agent-studio/ingestion-parsers.test.ts` PDF case) catches it.

### C3 — zod arity drift

`z.record(z.unknown())` worked in older zod and fails in current. If the project upgrades zod again, search for `z.record(z\.[a-z]+)\)` and confirm each call passes both key + value type.

---

## D. Deferred (per closure doc §3.5)

These are tracked here for completeness and were marked *not blocking* at retrofit close.

### D1 — pgvector migration

- **Doc:** `docs/architecture/agent-studio-pgvector-future-migration.md`
- **Trigger:** When KB volume crosses the threshold where the existing per-source embedding binding in `agsRacSources` becomes a bottleneck. The migration plan adds a `vector(N)` column to `agsKnowledgeChunks` and rewires the retrieval planner; no changes required to the RAC source registry.
- **Acceptance:** Latency p95 on a workload that includes vector retrieval drops below the documented target.

### D2 — Multi-region deployment

- **Status:** Single-region remains the operational baseline.
- **Trigger:** When operations team formally requests it. The retrofit's row keys (workspaceId-scoped) are already amenable to per-region sharding.

### D3 — In-process synthesizers (legacy carryover)

- **Source types:** `memory`, `workspace_context`, `project_context`, `tool_result_context`, `manual_context` — all flagged `in_process_synthesizer_pending` from the prior RAC arc (pre-retrofit).
- **Why carried over:** The retrofit deliberately did not touch these. They produce content at planner-build time rather than via the four-layer ingestion pipeline.
- **Acceptance:** Each synthesizer either lands as a real `Parser`/`Normalizer` pair under `services/ingestion/parsers/` or is removed from the source-type enum.

### D4 — Additional MVP parsers

The retrofit shipped 6 parsers (`text`, `markdown`, `html-snapshot`, `json`, `basic-pdf`, `basic-code`). Common follow-ups:

- Spreadsheet parser (Excel / CSV with header inference + `table_row` units per D-NKU-2).
- Image OCR parser (writes `extracted_artifact` units).
- Audio transcription parser.
- Video keyframe + transcript parser.

Each should slot into the existing registry without changes to `runIngestion`.

### D5 — Pre-existing 10 `ai-types/integration` test failures

- **Files:** `tests/integration/ai-types/execution*.test.ts`, `tests/integration/ai-types/scenario-*.test.ts`.
- **Status:** These were red on `main` *before* the retrofit and remained red throughout (the documented CI fingerprint). Orthogonal — none of them touch retrofit code paths.
- **Acceptance:** Diagnose root cause (likely DB seed state mismatch or a timing dependency) and either fix or formally retire the affected scenarios.

---

## E. Follow-up shape

When picking up any item:

1. Cite the **D-** decision IDs that bound the work (don't reinvent boundaries).
2. Extend `tests/agent-studio/retrofit-acceptance.test.ts` if your work introduces new modes / risk classes / approval states / source types — that file is the contract.
3. Land as a single PR off `main` with the existing CI fingerprint contract (4/5 green + the 10 ai-types reds tracked in D5).
4. Keep the closure doc accurate: when an item closes here, link the merge SHA back into the table.

— Recorded 2026-05-06 immediately after retrofit closure.
