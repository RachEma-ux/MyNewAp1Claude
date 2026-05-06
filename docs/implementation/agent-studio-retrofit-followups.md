# Agent Studio Retrofit — Follow-up Task List

**Owner:** Agent Studio module + Governance
**Status:** Tracking — none blocking; retrofit closed at `55c8b6b` (P14, 2026-05-06).
**Source:** Recorded as work was deferred during the 14-phase retrofit; cross-references the closure doc at `docs/implementation/agent-studio-retrofit-acceptance.md`.

This document is the contract for what the retrofit deliberately did *not* do. Each item names the deferral reason, the locked decision it falls under, and a concrete acceptance test for closing it.

---

## A. Wiring (highest priority — services exist, call sites don't)

### A1 — Wire the ProposedToolCall validator into `chat-stream`

The Phase 8 validator is shipped as a pure function. Production traffic still goes through the dispatcher without this gate.

- **Files:** `server/agent-studio/chat-stream.ts` (or whichever path emits the model's tool-use response), `server/agent-studio/services/runtime/rac-orchestrator.ts`.
- **Behavior:** Before calling `dispatchMcpToolCall`, build a `ProposedToolCall` from the model's tool-use envelope and call `validateProposedToolCall(call, ctx)`. On `ok=false`, abort with the `code` / `message`; do not invoke the dispatcher.
- **Context construction:** `resolveTool` reads the live MCP registry; `resolveRiskClass` calls the existing `readRiskClass()` (D-TOOL-5); chunk/unit/cagBlock id sets come from this turn's RAC retrieval result; `sandboxHealthOk` from the existing sandbox health probe.
- **Acceptance:** A new e2e test under `tests/integration/agent-studio/` proves a forged ProposedToolCall (invented tool / fabricated evidence / mismatched risk level) is rejected before the dispatcher fires.

### A2 — Wire the approval gate into the dispatch path

P9 ships `evaluateApprovalGate` / `createApprovalRequest` / `decideApprovalRequest`. The dispatcher does not yet route high/critical-risk calls through them.

- **Files:** `server/agent-studio/services/mcp/dispatcher.ts` (the chokepoint).
- **Behavior:** After P8 validation passes, if `normalized.requiresApproval=true`, call `evaluateApprovalGate({agentDraftId, proposedToolCall})`. On `permit` → continue to the existing governance + MCP path. On `denied | expired` → reject. On `pending | approval_required` → call `createApprovalRequest(...)` and return without dispatching; the chat loop surfaces the approval prompt.
- **Acceptance:** A high-risk tool call queues an approval row with `(agentDraftId, proposedToolCallHash)` idempotency; re-running the agent with the same evidence + arguments hits the existing row; calling `decideApprovalRequest({status:"allowed"})` from the operator UI permits the next dispatch attempt; expiry naturally blocks subsequent attempts.

### A3 — Wire the trace writer

P10 ships `recordToolCallTrace` + `patchRacRuntimeTrace`. The dispatcher emits its existing audit row but doesn't write the per-ProposedToolCall trace yet.

- **Files:** `server/agent-studio/services/mcp/dispatcher.ts` (post-dispatch), `services/runtime/rac-orchestrator.ts` (before/after compose).
- **Behavior:** Per dispatch, build the row with `buildToolCallTraceRow({...})` and call `recordToolCallTrace(...)`. Per turn, after planner mode is derived and CAG is composed, call `patchRacRuntimeTrace(traceId, {plannerMode, plannerReason, cagCompiledHash})`.
- **Acceptance:** Open `/agent-studio/:agentId/runs/:runId` and see one `agsToolCallTraces` row per dispatch attempt with verdict + approval + governance + dispatch surfaces; the underlying `agsRacRuntimeTraces` row carries planner mode + CAG hash.

### A4 — Auto-trigger `syncToolKnowledge` on registry republish

P7 ships the sync service; P11 exposes it via `mcpSchemaSync.sync`. Today the only callers are operator-driven.

- **Files:** `server/agent-studio/services/mcp/registry.ts` (`publishSnapshot` callsite), `server/agent-studio/services/mcp/mcp-manager.ts`.
- **Behavior:** When the registry publishes a new snapshot for an `mcpServerId`, call `syncToolKnowledge` with the new tools list. Capture changed tool names; if any have a `tool_knowledge` knowledge unit referenced by a CAG pack, mark those packs for recompile (D-CAG-RECON-3 cache invalidation).
- **Acceptance:** Reconnect an MCP server with a tool whose description changed — a new run sees the updated description in retrieval, and the affected CAG pack carries a fresh `compiledHash`.

---

## B. Coverage (pure helpers tested; DB-touching paths need ASDB e2e)

### B1 — DB-backed e2e for `syncToolKnowledge`

- **What:** Exercise the full insert / update-on-hash-drift / mark-unavailable path against a live `asdb`.
- **Decision basis:** Acceptance §3.5 of the closure doc.
- **Acceptance:** Test asserts `agsMcpToolKnowledge` rows + the cascading `agsKnowledgeUnits` writes match the diff summary returned.

### B2 — DB-backed e2e for the approval gate

- **What:** Round-trip create → decide allowed → permit → expire → re-decide. Verify `agsRuntimePolicyEvents` rows for each transition (D-APP-EXT-6).
- **Acceptance:** Idempotency on `(agentDraftId, proposedToolCallHash)` proven against a real unique-ish lookup; `lastUsedAt` bumps only on permit.

### B3 — DB-backed e2e for the trace writers

- **What:** Insert a runtime trace, patch it with planner-mode + CAG hash, attach a tool-call trace; verify FK-correct join.
- **Acceptance:** Reading from the runs page surfaces the joined view; rejection traces show null in approval/governance/dispatch.

### B4 — Operator visual review of `RetrofitPage`

- **What:** `client/src/**` is excluded from `tsc` per `tsconfig.json`; only the build job validates JSX. Operator should walk the 5 tabs against a seeded ASDB.
- **Acceptance:** All 5 tabs render without console errors; allow/deny on the Approvals tab writes through and refreshes the list.

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
