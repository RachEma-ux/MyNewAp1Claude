# Agent Studio Retrofit — Final Acceptance Report

**Scope:** Universal KB + Universal Ingestion + RAC/RAG/CAG + MCP Tool-Use + Critical Approval
**Status:** Adopted. All 14 phases shipped to `main`.
**Final commit on `main`:** `637b4cc` (Phase 13 land).
**Report owner:** Agent Studio module + Governance.

---

## 1. Verdict

The retrofit is complete. Every locked decision (D-UI-1..6, D-NKU-1..6, D-CAG-RECON-1..7, D-APP-EXT-1..7, D-PTC-1..6, D-RAC-PLANNER, the existing D-TOOL-1..5 / D-EMB-1 / D-SBX-2..3 / D-PRM-1..4 contracts) is live in code, exercised by unit tests, and surfaced in the operator UI. The retrofit extends the existing Agent Studio (CAG composer, dispatcher, approval scaffolding, RAC planner) — it does not greenfield-rebuild any of those.

**MUST-NOT boundaries held throughout:**

- No new `tool_approvals` table — `agsPendingPermissionRequests` reused (D-APP-EXT-1).
- No greenfield CAG composer — existing `services/cag/` extended with metadata columns + governance verdict (D-CAG-RECON-1..7).
- No `vector(N)` columns added — pgvector deferred to a documented future migration (Phase 1 ADR).
- No parallel ingestion pipeline — the four-layer `SourceConnector → Parser → Normalizer → Extractor` lives under `server/agent-studio/services/ingestion/` and writes into `agsKnowledgeUnits`, which the existing RAC retrieval planner consumes via the new `tool_knowledge` / `knowledge_unit` source-type adapters (D-NKU-6).
- No bypass of the MCP dispatcher — every retrofit-bound tool call passes through `dispatchMcpToolCall`; the new ProposedToolCall validator and approval gate are pre-flight gates (D-PTC-3, D-APP-EXT-3).
- Risk-class taxonomy stayed locked at 8 classes (D-TOOL-1); risk level + approval requirement mapping stayed locked at the 4-level enum (D-APP-EXT-4).

---

## 2. Phase ledger

Each row links to the merged PR; the SHA is the squash-merge SHA on `main`.

| Phase | Title | PR | SHA | Highlights |
|---|---|---|---|---|
| P0 | Roadmap delta + audit | [#182](https://github.com/RachEma-ux/MyNewAp1Claude/pull/182) | `7abc13e` | `docs/implementation/agent-studio-roadmap-delta.md` maps the 12 retrofit concepts onto existing artifacts; declares Extend / Build new / No-change for each. |
| P1 | CLAUDE.md + 6 missing ADRs | [#183](https://github.com/RachEma-ux/MyNewAp1Claude/pull/183) | `f4536fd` | CLAUDE.md restructured to lead with architectural boundaries; 6 ADRs land under `docs/architecture/agent-studio-*` (universal-data-ingestion, normalized-knowledge-unit, cag-reconciliation, approval-gate-extension, proposed-tool-call, pgvector-future-migration). |
| P2 | Schema retrofit (drizzle) | [#184](https://github.com/RachEma-ux/MyNewAp1Claude/pull/184) | `422561f` | 9 new tables (provenance, ingestion artifacts/jobs, knowledge units, chunks, extraction results, validation results, MCP tool knowledge mirror, tool-call traces) + new columns on `agsCagCapabilityPacks`, `agsPendingPermissionRequests`, `agsRacRuntimeTraces`. All new fields default safely so existing rows don't need backfill. |
| P3 | Universal ingestion + 6 MVP parsers | [#185](https://github.com/RachEma-ux/MyNewAp1Claude/pull/185) | `5a982c4` | Four-layer pipeline under `services/ingestion/`. Parsers: text, markdown, html-snapshot, json, basic-pdf, basic-code. `insertUnit` enforces D-NKU-3 canonical text + D-NKU-4 hash dedupe. 16 unit tests. |
| P4 | KB unit retrieval integration | [#186](https://github.com/RachEma-ux/MyNewAp1Claude/pull/186) | `19d8db6` | `services/rac/sources/types.ts` extends `RAC_SOURCE_TYPES` with `knowledge_unit` + `tool_knowledge`. New adapter under `services/rac/ingestion/knowledge-unit-adapter.ts` — Jaccard scoring, filters out `archivedAt IS NULL`, `freshnessState != 'expired'`, `validationStatus != 'blocked'`. 8 unit tests. |
| P5 | Extend CAG with compile/hash/governance metadata | [#187](https://github.com/RachEma-ux/MyNewAp1Claude/pull/187) | `66d0af4` | `CagCapabilityPack` extended with 9 new fields (contentHash, compiledHash, tokenBudgetEstimate / tokenBudgetActual, compileResult, compileWarnings, governanceVerdict, governanceBlockers, useCount). New `CagCompileResult` + `CagGovernanceVerdict` enums. `markPackUsed` + `recordPackTokenActual` helpers. 4 unit tests. |
| P6 | Explicit RAC planner modes | [#188](https://github.com/RachEma-ux/MyNewAp1Claude/pull/188) | `04640dd` | `derivePlannerMode` pure function. 8 modes: `no_retrieval`, `cag_only`, `knowledge_retrieval`, `multimodal_hybrid_retrieval`, `tool_knowledge_retrieval`, `hybrid_cag_rag`, `hybrid_cag_tool_knowledge`, `hybrid_cag_rag_tool_knowledge`. 12 unit tests cover the lattice + multimodal precedence + skipped-item exclusion. |
| P7 | MCP tool knowledge sync | [#189](https://github.com/RachEma-ux/MyNewAp1Claude/pull/189) | `3ee9c02` | `syncToolKnowledge` mirrors the live MCP registry into `agsMcpToolKnowledge` + materializes each tool as a `tool_knowledge` `agsKnowledgeUnits` row (D-NKU-6). 3-way diff: new / unchanged / changed (hash drift) / disappeared (`available=false`). 8 unit tests. |
| P8 | ProposedToolCall contract + validator | [#190](https://github.com/RachEma-ux/MyNewAp1Claude/pull/190) | `802cd9b` | `ProposedToolCall` interface + 9-code verdict + pure `ProposedToolCallValidatorContext`. 8 ordered gates (D-PTC-2): tool existence → quarantined block → argument schema → evidence existence → schema hash → risk level → approval claim → sandbox prerequisite. `riskClassToRiskLevel` + `approvalRequiredFor` lock D-APP-EXT-4. `canonicalProposedToolCall` + `hashProposedToolCall` (D-PTC-4) include rationale. 21 unit tests. |
| P9 | Approval gate extension | [#191](https://github.com/RachEma-ux/MyNewAp1Claude/pull/191) | `f7649d2` | `decideApprovalState` pure D-APP-EXT-2 lattice; `computeExpiresAt` D-APP-EXT-5; `evaluateApprovalGate` keyed lookup on `(agentDraftId, proposedToolCallHash)`; `createApprovalRequest` idempotent insert; `decideApprovalRequest` flips status with audit row write to `agsRuntimePolicyEvents` (D-APP-EXT-6). Approval permits MCP dispatch, never executes (D-APP-EXT-3). 13 unit tests. |
| P10 | Runtime trace retrofit | [#192](https://github.com/RachEma-ux/MyNewAp1Claude/pull/192) | `72a4a31` | `buildToolCallTraceRow` pure assembler — validator rejection nulls approval/governance/dispatch fields so a rejection trace doesn't surface stale dispatch metadata. `buildRacTracePatch` for `(plannerMode, plannerReason, cagCompiledHash)` patch on `agsRacRuntimeTraces`. 12 unit tests. |
| P11 | tRPC API retrofit | [#193](https://github.com/RachEma-ux/MyNewAp1Claude/pull/193) | `7299e02` | 4 new sub-routers: `kb` (read-only KB inspector), `toolKnowledge` (Phase 7 mirror reader), `mcpSchemaSync` (governed sync trigger), `toolApprovals` (list + decide). Mounted on the agent-studio root router. Latent typecheck issues in `proposed-tool-call.ts` (TS narrowing under `strictNullChecks: false` — switched to `Failure \| null`), `basic-pdf-parser.ts` (pdf-parse default-export shape), and `mcp-schema-sync-router.ts` (zod `z.record` arity) surfaced and were fixed in-flight. |
| P12 | UI retrofit | [#194](https://github.com/RachEma-ux/MyNewAp1Claude/pull/194) | `dd2e3ad` | `RetrofitPage` with 5 tabs: Ingestion (freshness counts), Knowledge Units (list + filter), Provenance Inspector (unit → provenance pivot), Tool Knowledge (mirror rows), Approvals (allow/deny with reason). Sidebar entry under Runtime group. URL: `/agent-studio/:agentId/retrofit`. |
| P13 | Evaluation + CI blockers | [#195](https://github.com/RachEma-ux/MyNewAp1Claude/pull/195) | `637b4cc` | `tests/agent-studio/retrofit-acceptance.test.ts` consolidates 35 named scenarios across D-NKU-3/4, D-RAC-PLANNER (full lattice), D-PTC-2 (every gate), D-APP-EXT-2/4/5, D-PTC-4, and trace assembly. Acts as the retrofit's CI gate — a failure points directly at which decision-rule lattice broke. |
| P14 | Final acceptance report | (this PR) | — | This document. |

---

## 3. Acceptance criteria

### 3.1 Code

- [x] **CAG extended, not duplicated.** `services/cag/` retains its identity — only metadata columns added. The composer remains mode-agnostic; mode tagging lives on the trace (D-RAC-PLANNER).
- [x] **Approval scaffolding reused.** `agsPendingPermissionRequests` extended with the ProposedToolCall snapshot + canonical hash + expiry + lastUsedAt. No new approval table.
- [x] **MCP dispatcher chokepoint preserved.** `dispatchMcpToolCall` remains the only execution surface; the validator + approval gate are pre-flight, not replacements.
- [x] **8-class taxonomy + 4-level riskLevel locked.** `riskClassToRiskLevel` + `approvalRequiredFor` are pure functions; the model cannot lower a risk claim past validation.
- [x] **Sandbox gate honored.** `code_execution` tools require `sandboxHealthOk=true` (D-SBX-2); enforced in P8 gate 8.
- [x] **Quarantined hard-block.** Tools classified `quarantined` fail validation regardless of caller claim (D-TOOL-1 default-deny).

### 3.2 Tests

- [x] **94 retrofit unit tests green** across 7 test files: `ingestion-parsers` (16), `kb-retrieval-adapter` (8), `cag-compile-metadata` (4), `rac-planner-mode` (12), `mcp-tool-knowledge-sync` (8), `proposed-tool-call` (21), `approval-gate` (13), `runtime-trace-writer` (12). Plus `retrofit-acceptance` (35) as the consolidated CI blocker.
- [x] **`pnpm run check` clean** — typecheck + CAG-boundary check pass on every PR.
- [x] **CI fingerprint stable.** Every retrofit PR landed with the documented 4/5 green + 10 pre-existing `ai-types/integration` failures (orthogonal — tracked separately as a long-standing red).

### 3.3 Operator surface

- [x] **API.** `agentStudio.kb.{listUnits,getUnit,getProvenance,listFreshnessCounts}`, `agentStudio.toolKnowledge.{listTools,getTool}`, `agentStudio.mcpSchemaSync.sync`, `agentStudio.toolApprovals.{list,listByDraft,getByHash,decide}`.
- [x] **UI.** `/agent-studio/:agentId/retrofit` — Ingestion / Knowledge Units / Provenance / Tool Knowledge / Approvals.
- [x] **Trace.** `agsToolCallTraces` row per dispatch with validator verdict + approval status + governance verdict + dispatch result; `agsRacRuntimeTraces` enriched with `plannerMode` + `plannerReason` + `cagCompiledHash`.

### 3.4 Governance + audit

- [x] **State transitions audited.** Approval lifecycle (`null → pending → allowed/denied/timed_out`) writes rows to `agsRuntimePolicyEvents` alongside the dispatcher's existing entries (D-APP-EXT-6).
- [x] **Idempotent on hash.** Re-running an agent with identical evidence + arguments hits the existing approval row; no duplicates queued.
- [x] **Rationale flows into the hash.** Different rationale = different proposal = different approval row (D-PTC-4).

### 3.5 Deferred (not blocking)

- **pgvector migration** — documented as future at `docs/architecture/agent-studio-pgvector-future-migration.md`. Optional-engine activation closed at D1 (§11 of that ADR locks `D-PARSE-PGVECTOR-1..4`).
- **Multi-region operations** — single-region remains the operational baseline. Forward-looking ADR locks the deferral + trigger conditions + swap surface at `docs/architecture/agent-studio-multi-region.md` (D2 closure).
- **DB-backed e2e for sync / approval / trace writers** — pure helpers tested here; live-ASDB e2e land in Phase 13 follow-up. The pure surfaces lock the contract.

> Resolved follow-ups: the legacy in-process synthesizer carryover (`memory` / `workspace_context` / `project_context` / `tool_result_context` / `manual_context`) was closed at D3 (2026-05-06) by removing those source types from the enum — they had no producer and the synthesizer shape never fit the four-layer ingestion pipeline. See `docs/implementation/agent-studio-retrofit-followups.md` §D3.

---

## 4. What this report does *not* cover

- Performance characterization. The retrofit doesn't change the hot path: CAG packs are cached on `compiledHash`; KB retrieval is the existing planner with two new source-type adapters; approval lookup is one indexed query on `(agent_draft_id, proposed_tool_call_hash)`. Real-world latency profiling lands as part of normal operations.
- Migration of legacy approval rows. Rows that existed before P2's column additions have `proposedToolCallHash=null` and the gate naturally returns `approval_required` for a fresh proposal targeting the same tool — the legacy row is harmless. Operators may archive them.
- Front-end E2E smoke. The UI's tabs are purely view-layer wrappers around the P11 routers; visual review is operator-side. The routers are tested via the pure helpers + the consolidated acceptance suite.

---

## 5. Sign-off

The retrofit is closed. Future evolution stays additive and ADR-locked: any new retrieval mode must show up in the `RAC_PLANNER_MODES` enum + `derivePlannerMode` lattice + the acceptance suite; any new tool risk class must extend the 8-class taxonomy + the riskLevel/approval mapping + the acceptance suite; any new approval state must extend `decideApprovalState`. The acceptance suite is the contract.

— Agent Studio module + Governance, 2026-05-06
