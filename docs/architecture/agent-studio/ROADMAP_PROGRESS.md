# Agent Studio Roadmap — Progress Table

Mapping of the multi-stage roadmap (Universal KB + Multimodal + RAG/RAC/CAG + MCP + Critical Approval) to the actual state of `RachEma-ux/MyNewAp1Claude` as of 2026-05-07.

Status legend:
- **Done** — implemented and matches the roadmap intent.
- **Partial** — implemented but missing roadmap-required pieces (gap noted).
- **Renamed** — exists under a different name/shape; reconciliation needed before extending.
- **Missing** — net-new work.
- **Deferred** — explicitly outside MVP per roadmap §0.5.5.

---

## Wave / Stage progress

| Wave | Roadmap area | Status | Existing artifact | Gap / action |
|---|---|---|---|---|
| 0 | Repo audit & baseline | Partial | `AGENTS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, 8 RAC ADRs | No `agent-studio-execution-baseline.md` summarizing existing MCP/RAC/CAG boundaries against the new roadmap |
| 1 | Architecture Decision Records | Partial | `docs/architecture/agent-studio/RAC_*.md` (8 files) | Missing ADRs: universal-data-ingestion, normalized-knowledge-unit, knowledge-base, cag-system (vs. existing capability-pack CAG), cag-pack-versioning, cag-runtime-cache, provider-prompt-cache, provider-kv-cache, mcp-tool-knowledge, mcp-execution-boundary, tool-call-governance, critical-tool-approval, graph-index-experimental |
| 2 | Database foundation (`ags_kb_*`, `ags_rac_cag_*`, `ags_tool_*`) | Renamed / Missing | `0039_cag_schema.sql`, `0040_rac_source_registry.sql`; tables `agsCagCapabilityPacks`, `agsCagPackEvents`, `agsRacSources`, `agsRacPolicies`, `agsRacProfiles`, `agsRacWorkspaceEmbeddingDefault`, `agsApprovalSteps`, `agsPendingPermissionRequests`, `agsRuntimeRuns/Steps/ToolCalls/MemoryEvents/PolicyEvents` | No `ags_kb_*` tables (sources, documents, document_versions, knowledge_units, chunks, chunk_embeddings, indexes, ingestion_jobs). No `ags_kb_tool_*` mirror tables. No CAG pack versioning / compile-jobs / runtime-traces tables. No `ags_tool_approval_requests` / `ags_tool_approval_decisions` (approval data lives in `agsApprovalSteps` + `agsAgentReleases.approval_state_json`) |
| 2 | pgvector extension | Missing | `local-pgvector-adapter.ts` exists but column shape is `integer embedding_model_dim` + JSON; no `CREATE EXTENSION vector` | Real migration: install extension, add `vector(...)` columns, backfill, build IVFFlat/HNSW index |
| 3 | Backend module skeletons | Done | `server/agent-studio/{adapters,api,db,services,skills,shared}` plus `services/{cag,mcp,rac,runtime,...}` | Sub-tree for `knowledge-base/{ingestion,knowledge-units,documents,document-versions,chunking,embeddings,indexes,retrieval,tool-knowledge}` does not exist; RAC has `sources/` and `ingestion/` only |
| 4 | Infrastructure adapters (VectorRepository, EmbeddingProvider, CacheProvider, ProviderPromptCacheAdapter) | Partial | `services/rac/ingestion/local-pgvector-adapter.ts`, `graphrag-adapter.ts`, `dispatcher.ts`; embedding binding via `agsRacWorkspaceEmbeddingDefault` (D-EMB-4); `server/openrouter/` provider | No abstract `VectorRepository`, no `CacheProvider`, no `ProviderPromptCacheAdapter` / `NoopProviderCacheAdapter`, no model-registry table with cache capabilities |
| 5 | Universal Data Ingestion + NormalizedKnowledgeUnit | Missing | `server/data-analysis/data-acquisition/pipelines/document/` (canonical-model, parser, validator) and `server/catalog-import/file-parser` are scoped to non-Agent-Studio uses | Net-new: `UniversalIngestionService`, `SourceConnectorRegistry`, `ParserRegistry`, `NormalizerRegistry`, `ExtractorRegistry`, `KnowledgeUnitService`, `ProvenanceService`, `DataValidationService`, `IngestionJobService`; MVP parsers (text, markdown, html-snapshot, json, basic-pdf, basic-code) |
| 6 | KB lifecycle (sources / documents / versions / chunks / rollback) | Partial / Missing | `agsRacSources` registers RAC sources; ingestion dispatcher routes by `(sourceType, ownerModule)` | No document, document-version, chunk, knowledge-unit tables or services; no rollback / soft-delete / time-travel retrieval |
| 7 | CAG foundation (packs, versions, compiler, loader, governance, cache, traces) | Renamed / Partial | `services/cag/{builder,store,resolver,renderer,validator,hashing,risk-classifier,events,skill-tool-mapper}.ts`; `agsCagCapabilityPacks`, `agsCagPackEvents`; tests `cag-builder.test.ts`, `cag-store.test.ts` | Repo CAG = "Capability Pack" (skills/tools per agent). Roadmap CAG = compiled stable prompt context. Closest match for roadmap-CAG is `services/runtime/system-prompt-composer.ts`. Need: rename decision, version table, compile-job table, compiled-hash, runtime-trace, cache entries, invalidation rules |
| 7 | system-prompt-composer (acts as de-facto cache-augmented context compiler) | Done (re-label) | `services/runtime/system-prompt-composer.ts`; section order identity → mission → agent-policy → CAG → retrieval-evidence → runtime-policy; 6144-token cap; SHA-256 cache key | Add provider-prompt-cache adapter, compiled-hash persistence, governance gate, runtime-trace linkage |
| 8 | MCP schema sync into KB (`ags_kb_tool_*`) | Missing | `services/mcp/{dispatcher,mcp-manager,registry,state-machine,auth,studio-mcp-server,transports}` is mature; MCP is the single execution boundary already | No mirror tables (`ags_kb_tool_servers`, `ags_kb_tools`, `ags_kb_tool_versions`, `ags_kb_tool_usage_guides`, `ags_kb_tool_parameter_examples`, `ags_kb_tool_error_patterns`, `ags_kb_tool_policies`); no schema-hash; no schema-change cache invalidation hooks |
| 9 | Approval / governance foundation | Partial | `agsApprovalSteps`, `agsPendingPermissionRequests`, `agsPublishRequests`; `services/governance-adapter.ts`, `services/provider-use-governance.ts`; `services/cag/risk-classifier.ts` (read_only / write / external_side_effect / destructive / credential_sensitive / code_execution / governance_sensitive / quarantined) | No dedicated `ToolApprovalService`, no `ags_tool_approval_requests` / `ags_tool_approval_decisions`, no expiration handling, no MCP-dispatch blocking gate keyed on `ProposedToolCall.requiresApproval` |
| 10 | Indexing / retrieval readiness | Partial | `services/rac/ingestion/{dispatcher,graphrag-adapter,local-pgvector-adapter}.ts`; `server/vectordb/{qdrant-service,reranking-service}.ts` | No specialized adapters for full-text / table / image / code / temporal / geospatial / graph; no permission/freshness filters at retrieval boundary; no citation/source-location metadata builder; no retrieval traces beyond `agsRuntimeRunSteps` |
| 11 | RAC planner + context assembly modes (no_retrieval / cag_only / knowledge_retrieval / multimodal_hybrid / tool_knowledge_retrieval / hybrid_*) | Missing | `services/runtime/system-prompt-composer.ts` composes context but has no planner choosing among the 7 retrieval modes; no `ToolIntentClassifier`, no `MultimodalRetrievalPlanner` | Net-new planner module + classifiers; convert RAC candidates / knowledge units / tool knowledge / CAG blocks into typed context blocks |
| 12 | ProposedToolCall contract + runtime MCP integration | Missing | Tool calls go through `services/mcp/dispatcher.ts` directly; tool-call rows persisted to `agsRuntimeToolCalls` | No `ProposedToolCall` schema (mcpServerId, toolName, toolVersion, arguments, rationale, evidenceChunkIds, knowledgeUnitIds, toolKnowledgeIds, cagBlockIds, schemaHash, riskLevel, requiresApproval); no invented-tool / invented-parameter validator; no approval gate before dispatch |
| 13 | Runtime trace + auditability | Partial | `agsRuntimeRuns`, `agsRuntimeRunSteps`, `agsRuntimeToolCalls`, `agsRuntimeMemoryEvents`, `agsRuntimePolicyEvents`, `agsRuntimeHookExecutions` | Missing fields: planner decision/reason, CAG pack/version/block/compiled-hash, provider-cache hit/miss, retrieval mode/index/unit-types, evidence chunk IDs, schema hash, governance result, approval request/result, MCP dispatch result |
| 14 | tRPC API surface (`kb.*`, `rac.*`, `governance.toolApprovals.*`) | Partial | `server/agent-studio/api/` exposes CAG, RAC, provider-bindings routers | No `kb.ingestion.*`, `kb.knowledgeUnits.*`, `kb.provenance.*`, `kb.documents.*`, `kb.documentVersions.*`, `kb.toolServers.*` etc.; no `governance.toolApprovals.*`; CAG router exists but lacks version/compile/preview/runtime-cache endpoints |
| 15 | Agent Studio UI (KB / Universal Ingestion / CAG / Tool Approvals / Runtime Traces / Tool-Use Traces) | Missing | Builder / Agents / Workspaces UIs exist in `client/`; CAG UI partial | No KB Sources / Documents / Knowledge Units / Indexes / Retrieval Test screens; no CAG Versions / Compiler Preview / Runtime Cache / Provider Prompt Cache; no Tool Approvals / Audit Log; no Tool-Use Trace inspector |
| 16 | Evaluation + CI (golden sets, Recall@K, invented-tool rate, approval correctness) | Missing | 263 vitest files; module test coverage strong | No `ags_kb_eval_*` / `ags_rac_cag_eval_*` / `ags_kb_tool_eval_*` tables; no CI commands for retrieval / multimodal / CAG / tool-use evaluation; no governance CI blockers |
| 17 | Hardening + final acceptance report | Missing | Per-module tests passing | No `docs/reports/agent-studio-universal-kb-rac-cag-mcp-final-acceptance.md`; no MCP/CAG/Universal-Ingestion/Approval boundary proofs |

---

## Cross-cutting roadmap features

| Feature | Status | Notes |
|---|---|---|
| Universal data ingestion framework | Missing | Wave 5 is the largest net-new investment |
| NormalizedKnowledgeUnit contract | Missing | Net-new type + table + service |
| Multimodal indexes (table / image / code / temporal / geospatial) | Missing | Roadmap §0.5.5 explicitly defers all of these for MVP |
| Graph index | Deferred | Roadmap §1 marks experimental + disabled by default |
| Provider prompt-cache adapter | Missing | OpenRouter wired but no cache-control breakpoint plumbing |
| Provider KV-cache adapter | Deferred | Roadmap explicitly noop unless provider proven |
| Semantic cache | Deferred | Roadmap §0.5.5 |
| Agentic plan cache | Deferred | Roadmap §0.5.5 |
| OpenRouter as only LLM execution path | Done | `server/openrouter/{service,router,routing-service,sync-service,manifest,schema,model-access}.ts` |
| MCP as only tool execution path | Done | `services/mcp/dispatcher.ts` is the sole boundary |
| AGENTS.md operating policy | Done | Present at repo root |

---

## MVP acceptance (roadmap §0.5.7) — quick scoreboard

| MVP criterion | Status |
|---|---|
| One agent can use a versioned CAG pack | Partial (CAG packs exist; no version table) |
| CAG pack tables created | Partial (capability-pack flavor only) |
| CAG pack versioning | Missing |
| CAG block service / compiler / loader / governance | Missing as discrete services (system-prompt-composer covers compile/load) |
| CAG blocks traced in runtime context | Missing (no compiled-hash / block-IDs in `agsRuntimeRunSteps`) |
| Universal ingestion framework | Missing |
| Source connector / parser / normalizer / extractor registry | Missing |
| NormalizedKnowledgeUnit contract | Missing |
| Plain text / markdown / HTML / JSON / basic-code / basic-PDF ingestion | Missing |
| Provenance / permissions / freshness on knowledge units | Missing |
| KB retrieval | Partial (RAC retrieval via adapters; no KB document/chunk model) |
| Tool-knowledge retrieval | Missing |
| Existing MCP tool schema mirrored into KB | Missing |
| ProposedToolCall schema validation | Missing |
| Invented tools / parameters rejected | Missing |
| High/critical tool calls require approval | Partial (governance-adapter exists; no proposal-driven gate) |
| Rejected approval blocks MCP dispatch | Partial (publish/release approval works; runtime tool dispatch gate not wired) |
| Approved calls still pass MCP validation | Done (dispatcher always validates) |
| MCP remains only execution layer | Done |
| Runtime trace covers CAG → evidence → execution | Partial |

---

## Recommended next actions

1. Write the **reconciliation ADR** (`docs/architecture/agent-studio/ROADMAP_RECONCILIATION.md`) deciding: (a) CAG terminology, (b) `ags_kb_*` vs. extending `ags_rac_*`, (c) approval table extension vs. new tables, (d) pgvector migration scope.
2. Land the **pgvector migration** as an isolated change before any KB work depends on it.
3. Implement **Wave 5** (Universal Ingestion + NormalizedKnowledgeUnit) — highest net-new value.
4. Add **ProposedToolCall** + runtime approval gate (Wave 12 + Wave 9 extension) — closes the largest governance gap with the smallest surface area.
5. Extend `agsRuntimeRunSteps` / `agsRuntimeToolCalls` with planner-decision / compiled-hash / evidence / approval fields (Wave 13).
