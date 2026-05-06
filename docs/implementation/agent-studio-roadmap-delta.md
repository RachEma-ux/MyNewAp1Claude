# Agent Studio Universal KB + Ingestion + RAC/CAG + MCP Tool-Use + Approval — Roadmap Delta

**Owner:** Agent Studio module
**Phase:** 0 (Audit + reconcile with existing system)
**Status:** Adopted — drives Phases 1–14
**Authority:** Companion to the execution prompt; binding map between roadmap concepts and existing artifacts.

---

## 1. Why this document exists

The execution prompt (Universal KB + Universal Ingestion + RAC/RAG/CAG + MCP Tool-Use + Critical Approval) is written generically. The repository at `RachEma-ux/MyNewAp1Claude` is **not** greenfield — it already has a mature Agent Studio with CAG capability packs (RAC P1A–P11), an MCP dispatcher gating `code_execution` through a sandbox (P9), an export-readiness matrix (P10), and a configuration UI (P11). All shipped 2026-05-06.

This delta map is the contract between "what the roadmap asks for" and "what already exists in this repo". For every roadmap concept it answers three questions:

1. **What's already there?** Concrete file paths and table names.
2. **What is the action?** Extend, build new, or out of scope.
3. **What is the boundary?** What MUST NOT be duplicated, replaced, or weakened.

The map is the authoritative reference for Phases 1–14. When a phase says "implement X", check this map first. If X is "extend an existing artifact" — touch the existing artifact, not a parallel one. If X is "build new" — build it, but in the file/directory path indicated below so the existing module structure stays intact.

---

## 2. Roadmap concept → Existing artifact → Action

### 2.1 CAG Capability Packs

| | |
|---|---|
| **Roadmap concept** | "CAG = Cache-Augmented Generation, stable compiled runtime context" |
| **Existing artifact** | `server/agent-studio/services/cag/` — `builder.ts`, `validator.ts`, `renderer.ts`, `resolver.ts`, `risk-classifier.ts`, `composer.ts`, `types.ts`, `store.ts`, `events.ts`, `skill-tool-mapper.ts`, plus `agsCagCapabilityPacks` + `agsCagPackEvents` tables |
| **Action** | **Extend.** Phase 5 adds compile/hash/governance metadata fields to the existing schema and the existing types; reuses the existing builder/resolver/renderer chain |
| **MUST NOT** | Create a parallel CAG system. Any new "CAG" file outside `services/cag/` (or its sibling directories that already import from it) is a violation. Phase 5 **extends** `services/cag/types.ts` and `agsCagCapabilityPacks`; it does not introduce `services/cag2/` or `services/capability-packs/` |

### 2.2 RAC planner / composer

| | |
|---|---|
| **Roadmap concept** | "RAC = plans and assembles context with explicit modes" |
| **Existing artifact** | `server/agent-studio/services/rac/` — sources/, ingestion/, retrieval-{planner,executor,filter}.ts, context-assembler.ts; `services/runtime/rac-orchestrator.ts` (P6 single-call-site for chat-stream/chat/test-run-binding); `services/cag/composer.ts` (D-PRM-1 6-section composer) |
| **Action** | **Extend.** Phase 6 adds explicit planner-mode output (`no_retrieval`, `cag_only`, `knowledge_retrieval`, `multimodal_hybrid_retrieval`, `tool_knowledge_retrieval`, `hybrid_cag_rag`, `hybrid_cag_tool_knowledge`, `hybrid_cag_rag_tool_knowledge`) on the existing `RacRetrievalPlannerOutput`; composer consumes the mode tag; trace records the reason |
| **MUST NOT** | Replace the existing planner/executor/filter trio. Replace the orchestrator. Re-implement the composer. The 6-section order from D-PRM-1 stays |

### 2.3 MCP dispatcher

| | |
|---|---|
| **Roadmap concept** | "Existing MCP dispatcher = only tool execution path" |
| **Existing artifact** | `server/agent-studio/services/mcp/dispatcher.ts` — `dispatchMcpToolCall(input)` is the single chokepoint for all MCP invocations. Validates tool name (`mcp__server__tool`), reads `riskClass` via `readRiskClass(tool)` (D-TOOL-5 single source of truth), routes `code_execution` through the sandbox (P9 D-SBX-3), gates non-`code_execution` through the MCP transport. Pre/post-invoke governance via `evaluateMcpPreInvoke`/`evaluateMcpPostInvoke` |
| **Action** | **Extend.** Phase 8 inserts a `ProposedToolCall` validator BEFORE the existing dispatcher's connection check — so the dispatcher remains the chokepoint, but the validator rejects model-invented tools / parameters / missing evidence before the dispatcher even sees them. Phase 9 extends the existing approval gate (next row) to block dispatch on rejected/expired approvals |
| **MUST NOT** | Introduce a second dispatcher. Bypass `dispatchMcpToolCall`. Duplicate the `mcp__server__tool` parsing. Remove the existing governance pre/post-invoke calls |

### 2.4 Tool approval / pending permission requests

| | |
|---|---|
| **Roadmap concept** | "Approval permits dispatch; approval does not execute tools" |
| **Existing artifact** | `drizzle/tables/agent-studio.ts` — `agsApprovalSteps` (line ~568), `agsPublishRequests` (line ~548), `agsPendingPermissionRequests` (line ~866) with status `pending|allowed|denied|timed_out`. `services/governance-adapter.ts` — `evaluateGovernance()` returns `{verdict, reasons, policySummary{blockedActions, approvalRequired, budgetCeiling, auditRequired, killSwitchEnabled}}` |
| **Action** | **Extend.** Phase 9 wires `agsPendingPermissionRequests` to gate MCP dispatch on `riskLevel ∈ {high, critical}` ProposedToolCalls. Approve transitions `pending → allowed`; reject → `denied`; expiry → `timed_out`. Approved status PERMITS dispatch; approval itself never invokes a tool. The existing `evaluateGovernance` still runs after approval clears |
| **MUST NOT** | Create a new `tool_approvals` table when `agsPendingPermissionRequests` already exists. Wire approval to call the dispatcher (approval is pre-dispatch only). Skip `evaluateMcpPreInvoke` because the approval cleared (governance still runs) |

### 2.5 Risk classifier

| | |
|---|---|
| **Roadmap concept** | "ProposedToolCall riskLevel computed or verified" |
| **Existing artifact** | `server/agent-studio/services/cag/risk-classifier.ts` — `readRiskClass(tool)` returns `ToolRiskClass` (read-only; reads from manifest, falls back to `BUILTIN_RISK_CLASS` table, defaults to `quarantined` per D-TOOL-1 default-deny). The 8-class taxonomy `read_only | write | external_side_effect | destructive | credential_sensitive | code_execution | governance_sensitive | quarantined` is locked |
| **Action** | **Extend (mapping only).** Phase 8 maps the 8-class taxonomy onto the 4-level `ProposedToolCall.riskLevel` field (`low | medium | high | critical`):<br/>• `read_only` → `low`<br/>• `write`, `external_side_effect`, `governance_sensitive` → `medium`<br/>• `credential_sensitive`, `code_execution` → `high`<br/>• `destructive`, `quarantined` → `critical` |
| **MUST NOT** | Add a second risk classifier. Recompute `riskClass` outside `services/cag/risk-classifier.ts` (P1E boundary check enforces this). Bypass `readRiskClass()` |

### 2.6 KB / RAG retrieval

| | |
|---|---|
| **Roadmap concept** | "RAG = retrieves fresh evidence from KB/retrieval indexes" |
| **Existing artifact** | `services/rac/retrieval-{planner,executor,filter}.ts` (P4) + `services/rac/sources/` (P2 source registry). The RAC retrieval path is the platform's RAG today: the planner picks sources, the executor calls per-source adapters, the filter dedupes/scores, the assembler renders evidence. `drizzle/tables/documents.ts` — `documents` and `documentChunks` exist as a separate document store on the main DB; `vectorId` is a text cross-reference field, not an in-row vector |
| **Action** | **Extend.** Phase 4 wires `NormalizedKnowledgeUnit` (Phase 3 deliverable) into the existing retrieval path: a new `RacSourceType="knowledge_unit"` ingestion adapter feeds units through the planner/executor/filter trio. Permission filtering (Phase 4) and freshness filtering (Phase 4) extend the existing `RetrievalFilterConfig`. Trace fields for unit IDs + provenance + source location join the existing `RuntimeSourceTrace` |
| **MUST NOT** | Build a parallel "RAG service" outside `services/rac/`. Bypass the existing planner/executor/filter |

### 2.7 Embedding storage

| | |
|---|---|
| **Roadmap concept** | "Use existing embedding storage for MVP. Do not force pgvector migration in MVP" |
| **Existing artifact** | `ags_rac_sources` carries `embedding_provider_connection_id` + `embedding_model_ref` + `embedding_model_dim` (D-EMB-1 per-source binding). `documents.documentChunks.vectorId` is a text reference to an external store. `server/vectordb/` contains a Qdrant integration (`vectordb-router.ts`) but it is NOT wired to RAC sources today. **No `pgvector` extension is in use; no `vector(N)` columns exist anywhere in the Drizzle schema** |
| **Action** | **Extend.** Phase 4 stores embedded knowledge-unit chunks via the existing per-source binding (the Qdrant integration is the most natural fit; the local-pgvector adapter remains a stub at P3 of the RAC roadmap). pgvector becomes a documented future migration (Phase 1 ADR `agent-studio-pgvector-future-migration.md`) — not an MVP requirement |
| **MUST NOT** | Add a `vector(N)` column to any table in this scope. Block Phase 4 on a pgvector migration. Couple the chunk store to a single backend in code paths above the adapter layer (D-EMB-1 keeps this clean) |

### 2.8 pgvector future migration

| | |
|---|---|
| **Roadmap concept** | "pgvector may be documented as a future migration" |
| **Existing artifact** | None. No pgvector extension, no `vector` column anywhere |
| **Action** | **Build new (docs only).** Phase 1 deliverable: `docs/architecture/agent-studio-pgvector-future-migration.md` documenting the trigger conditions (when does a Qdrant or external-store cost cross the threshold for moving to in-database vectors), the swap surface (D-EMB-1 makes this a per-source flip), and the migration plan |
| **MUST NOT** | Land a pgvector migration in this retrofit. Make pgvector a Phase 4 prerequisite |

### 2.9 Universal Ingestion

| | |
|---|---|
| **Roadmap concept** | "Universal Ingestion = parses and normalizes supported data into NormalizedKnowledgeUnit" |
| **Existing artifact** | Partial. `services/rac/ingestion/` — `dispatcher.ts` + `graphrag-adapter.ts` + `local-pgvector-adapter.ts` (the latter two are stubs returning empty results). `server/catalog-import/file-parser.ts` — narrow parser for skill catalog import. `server/data-analysis/data-acquisition/pipelines/document/parserRouter.ts` — separate parser router for the data-acquisition pipeline. No unified `parsers/` module, no `NormalizedKnowledgeUnit`, no provenance/permission/freshness contract on units |
| **Action** | **Build new.** Phase 3 implements `UniversalIngestionService`, the four registries (Source Connector, Parser, Normalizer, Extractor), `KnowledgeUnitService`, `ProvenanceService`, `DataValidationService`, `IngestionJobService`, plus 6 MVP parsers (Text, Markdown, HTML snapshot, JSON, basic PDF text, basic code file). All under `server/agent-studio/services/ingestion/` (NEW directory). Schema for `agsKnowledgeUnits`, `agsProvenanceRecords`, `agsIngestionJobs`, `agsExtractionResults`, `agsDataValidationResults` lands in Phase 2 |
| **MUST NOT** | Inject raw artifacts into prompts (governance must explicitly allow it). Execute tools from the ingestion path. Skip provenance / permission / freshness on a unit. Re-implement the existing RAC ingestion adapter contract — Phase 3's services produce `NormalizedKnowledgeUnit` rows; an `agentStudio` adapter feeds those to RAC retrieval (Phase 4) |

### 2.10 MCP tool knowledge mirror

| | |
|---|---|
| **Roadmap concept** | "Mirror MCP tools into KB/tool knowledge without replacing MCP" |
| **Existing artifact** | None. The MCP registry (`services/mcp/registry.ts`) holds live snapshots; no persisted mirror with schema hash + change detection exists |
| **Action** | **Build new.** Phase 7 adds `agsMcpToolKnowledge` (schema in Phase 2): server id, tool name, version, schema snapshot (JSONB), schema hash (SHA-256), `last_seen_at`, `available` flag. Phase 7 service compares live registry against the mirror; on schema-hash drift, marks the row stale and invalidates schema-sensitive CAG packs. Tool knowledge retrieval surfaces via the new `RacSourceType="mcp_tool_knowledge"` adapter |
| **MUST NOT** | Replace the MCP registry — the registry is the source of truth at runtime. The mirror is a downstream cache. Use the mirror to dispatch a call (the dispatcher always re-validates against the live registry) |

### 2.11 Runtime trace

| | |
|---|---|
| **Roadmap concept** | "Trace must include planner decision, CAG IDs, retrieval chunks, ProposedToolCall, approval status, MCP dispatch result, etc." |
| **Existing artifact** | `agsRacRuntimeTraces` + `agsRacContextBlocks` + `agsRacFeedback` (P7). `RuntimeSourceTrace` carries chunks-returned/filtered/included; `RuntimeTraceMetrics` carries latency + token-budget. `RacTraceDrawer` MVP component. tRPC `agentStudio.racTrace.{getTrace,submitFeedback}` |
| **Action** | **Extend.** Phase 10 widens `agsRacRuntimeTraces` (or adds a sibling `agsToolCallTraces` table) with: planner mode, ProposedToolCall payload, approval status (and approval row id), governance result, MCP dispatch result, error/retry path. Phase 12 extends `RacTraceDrawer` to surface the new fields |
| **MUST NOT** | Create a third trace store. Drop existing trace fields. Surface the trace through a new tRPC namespace — keep `agentStudio.racTrace.*` |

### 2.12 OpenRouter model execution

| | |
|---|---|
| **Roadmap concept** | "OpenRouter = only model execution path" |
| **Existing artifact** | `server/openrouter/` — `service.ts`, `router.ts`, `schema.ts`, `routing-service.ts`, `model-access/`. Encrypted config storage; routing through `ModelAccessExecuteInput`. Wired to chat-stream as one of multiple model paths (others exist for legacy reasons) |
| **Action** | **Extend (boundary only).** Phase 13 adds a CI blocker that fails on model execution outside the OpenRouter path for RAC-enabled agents. No code changes to the OpenRouter integration itself in this retrofit |
| **MUST NOT** | Couple RAC-specific model logic into the OpenRouter integration. Build a parallel router. Remove the existing alternate model paths in this scope (legacy behaviour stays until a separate phase decommissions it) |

---

## 3. Mapping summary

| Concept | Action | Phase | Files (new or touched) |
|---|---|---|---|
| CAG packs | Extend | 5 | `services/cag/types.ts`, `agsCagCapabilityPacks` schema delta |
| RAC planner/composer | Extend | 6 | `services/rac/retrieval-planner.ts`, `services/runtime/rac-orchestrator.ts`, `services/cag/composer.ts` |
| MCP dispatcher | Extend (validator inserted) | 8, 9 | `services/mcp/dispatcher.ts`, new `services/mcp/proposed-tool-call.ts` |
| Tool approval | Extend | 9 | `agsPendingPermissionRequests` (existing), new `services/approval/tool-approval.ts` |
| Risk classifier | Extend (mapping only) | 8 | new `services/mcp/risk-level-mapper.ts` |
| KB/RAG | Extend | 4 | `services/rac/retrieval-executor.ts`, new `services/rac/ingestion/knowledge-unit-adapter.ts` |
| Embedding storage | Extend (config only) | 4 | `services/rac/ingestion/local-pgvector-adapter.ts` (or Qdrant), no new column |
| pgvector future migration | Build new (docs) | 1 | `docs/architecture/agent-studio-pgvector-future-migration.md` |
| Universal ingestion | Build new | 2, 3 | new `services/ingestion/`, schema for `agsKnowledgeUnits` etc. |
| MCP tool knowledge mirror | Build new | 2, 7 | new `services/mcp/tool-knowledge-sync.ts`, `agsMcpToolKnowledge` schema |
| Runtime trace | Extend | 10 | `agsRacRuntimeTraces` schema delta or sibling table |
| OpenRouter | No change in this retrofit | 13 (CI gate only) | n/a |

---

## 4. Phase-to-PR plan

The retrofit will land as 14 PRs (one per phase, matching the RAC arc cadence):

| Phase | PR title (proposed) | Branch | Size estimate |
|---|---|---|---|
| 0 | docs(agent-studio): roadmap delta + audit (P0) | `feat/retrofit-p0-delta` | ~500 lines (this doc) |
| 1 | docs(agent-studio): retrofit ADRs + CLAUDE.md (P1) | `feat/retrofit-p1-adrs` | ~2000 lines (6 ADRs + CLAUDE.md) |
| 2 | feat(agent-studio): retrofit schema (P2) | `feat/retrofit-p2-schema` | ~600 lines |
| 3 | feat(agent-studio): universal ingestion + 6 MVP parsers (P3) | `feat/retrofit-p3-ingestion` | ~2500 lines |
| 4 | feat(agent-studio): KB unit retrieval integration (P4) | `feat/retrofit-p4-kb-retrieval` | ~800 lines |
| 5 | feat(agent-studio): CAG compile/hash/governance metadata (P5) | `feat/retrofit-p5-cag-extend` | ~600 lines |
| 6 | feat(agent-studio): explicit RAC planner modes (P6) | `feat/retrofit-p6-planner-modes` | ~700 lines |
| 7 | feat(agent-studio): MCP tool knowledge sync (P7) | `feat/retrofit-p7-tool-knowledge` | ~900 lines |
| 8 | feat(agent-studio): ProposedToolCall contract (P8) | `feat/retrofit-p8-proposed-tool-call` | ~1100 lines |
| 9 | feat(agent-studio): approval gate extension (P9) | `feat/retrofit-p9-approval-gate` | ~800 lines |
| 10 | feat(agent-studio): runtime trace retrofit (P10) | `feat/retrofit-p10-runtime-trace` | ~700 lines |
| 11 | feat(agent-studio): API retrofit (P11) | `feat/retrofit-p11-api` | ~1500 lines |
| 12 | feat(agent-studio): UI retrofit (P12) | `feat/retrofit-p12-ui` | ~2000 lines |
| 13 | feat(agent-studio): evaluation + CI blockers (P13) | `feat/retrofit-p13-eval-ci` | ~1000 lines |
| 14 | docs(agent-studio): final acceptance report (P14) | `docs/retrofit-p14-final` | ~600 lines |

Cumulative estimate: ~16 000 LOC + ~3 000 docs.

---

## 5. Acceptance criteria for Phase 0

- [x] All 12 roadmap concepts mapped (CAG, RAC, MCP, approval, risk classifier, KB/RAG, embedding, pgvector, ingestion, tool knowledge, trace, OpenRouter).
- [x] Each mapping carries an existing-artifact pointer (file path + table name where relevant).
- [x] Each mapping declares **Extend** vs **Build new** vs **No change**.
- [x] Each mapping declares the MUST NOT boundary so future phases can't quietly violate it.
- [x] Phase-to-PR plan with branch names + size estimates.
- [x] CLAUDE.md update queued for Phase 1 (the CLAUDE.md changes belong with the ADRs, not with this audit).
