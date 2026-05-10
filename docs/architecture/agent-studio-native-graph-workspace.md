# Agent Studio Native Graph Workspace — ADR

**Owner:** Agent Studio module + Knowledge / GraphRAG / KGRA Agent + Governance
**Phase:** Native Graph Workspace MVP 0 — Phase 0 (top-level)
**Status:** Adopted — drives MVP 0 → MVP 4 execution
**Authority:** Locked top-level scope and integration contract for the Native Graph Workspace initiative. Companion roadmap: `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`. Companion execution plan: `docs/implementation/agent-studio-native-graph-workspace-execution-plan.md`.

---

## 1. Problem statement

Agent Studio currently has **partial graph infrastructure** scattered across multiple modules — a GraphRAG control plane (`drizzle/tables/graphrag.ts`), a Data Analysis GraphRAG subdomain (`server/data-analysis/graphrag/`), a KGRA Agent module (`server/kgra-agent/`), and a `kgra/` Python sidecar. None of these provide:

- A durable Markdown vault that humans use to author, link, and search knowledge.
- A typed knowledge graph engine with ontology, constraints, provenance, and entity resolution.
- A dedicated graph backend (Neo4j CE) for traversal beyond the existing GraphRAG control plane's index/query workflow.
- A Graph Agent Lite that reasons over a permission-filtered, governance-aware projected graph.
- A promotion model that turns notes into governed runtime assets (CAG blocks, Graph Skill Packs, tool knowledge) with version pinning.

The Native Graph Workspace fills these gaps by **layering on top of** existing infrastructure, not replacing it.

## 2. Existing infrastructure inventory (must extend, not duplicate)

| Existing surface | Location | New project's relationship |
|---|---|---|
| GraphRAG control plane | `drizzle/tables/graphrag.ts` (sources, sync_runs, index_runs, query_runs, artifact_registry) | **Extends.** Adds workspace-scoped sources + projection sync that targets Neo4j CE; preserves existing source/index/query lifecycle. |
| Data Analysis GraphRAG subdomain | `server/data-analysis/graphrag/` | **Consumes.** Native Graph Workspace publishes typed graph projections that Data Analysis can read; does not replace its analytics surface. |
| KGRA Agent | `server/kgra-agent/` (engine, nodes, router, adapter, public-api) | **Extends / aligns.** Graph Agent Lite is a sibling capability that uses KGRA Agent patterns (manifest, ports, public-api); not a parallel runtime. |
| `kgra/` Python sidecar | repo root | **Out of scope** for MVP 0–4. Document its existence; do not modify. |
| MCP dispatcher | `server/agent-studio/services/mcp/dispatcher.ts` | **Boundary.** Graph Agent Lite must route every tool call through this dispatcher. Source-scan tested. |
| OpenRouter Model Access | `server/openrouter/model-access/` | **Boundary.** Graph Agent Lite must call models only via this path. Source-scan tested. |
| CAG capability packs | `server/agent-studio/services/cag/` | **Extends.** Adds CAG block → source note version reference (Phase 10). Existing CAG runtime contract preserved. |
| RAC retrieval | `server/agent-studio/services/rac/` (planner, executor, filter, sources, trace) | **Extends.** GraphRAG retrieval router (Phase 12) registers as an additional retrieval source, not a replacement. |
| Governance / approval | `agsApprovalSteps`, `agsPendingPermissionRequests`, `evaluateGovernance()` | **Reuses.** Promotion workflows (Phase 11) and graph change proposals (Phase 11.5) hook into existing approval scaffolding. |
| Runtime trace store | `agsRuntimeRuns` (with V3 Phase 11a observability columns) | **Extends.** Adds runtime trace projection into Neo4j CE (Phase 14); preserves Postgres source-of-truth. |

## 3. Decision

The Native Graph Workspace ships as a **5-layer addition** layered on top of existing infrastructure:

1. **Markdown vault layer** (Phases 2–6) — durable Postgres-backed notes, frontmatter, wikilinks, backlinks, search, command palette. **NEW.**
2. **Typed knowledge graph layer** (Phases 1.6, 7) — ontology registry, constraints, entity resolution, provenance, source-of-truth in Postgres. **NEW.**
3. **Neo4j CE projected graph backend** (Phases 1.3, 1.5, 7.5) — projected traversal store behind `GraphRepository` abstraction. **NEW.**
4. **GraphRAG retrieval + Graph Agent Lite** (Phases 12, 13) — extends RAC retrieval source registry; uses MCP dispatcher + OpenRouter Model Access boundaries; mirrors KGRA Agent module shape (manifest/ports/public-api). **EXTENDS.**
5. **Promotion + governance + self-correction** (Phases 10, 11, 11.5, 23) — note→CAG/Graph Skill/tool-knowledge promotion with version pinning; reuses existing approval scaffolding. **EXTENDS.**

The dual-store responsibility split is locked:

```
Postgres = source of truth for app records, vault notes, governance,
           permissions, runtime trace metadata, promotion state, audit.

Neo4j CE = projected graph backend for typed traversal, GraphRAG path
           expansion, runtime trace path projection, graph views.

GraphRepository = the only allowed access surface to Neo4j CE.
                  Postgres-backed shallow graph fallback also goes
                  through GraphRepository.

Projection sync = explicit, replayable, drift-detectable pipeline
                  from Postgres source-of-truth records to Neo4j CE.
```

See `agent-studio-postgres-neo4j-responsibility-split.md` for the detailed split.

## 4. Non-build list

The Native Graph Workspace **must not**:

- Reimplement existing CAG storage or override existing CAG runtime contracts silently.
- Replace or bypass the MCP dispatcher.
- Bypass OpenRouter Model Access for any LLM call.
- Force pgvector migration (the embedding storage decision in CLAUDE.md stands).
- Duplicate the existing GraphRAG control plane (`graphrag_sources`, `graphrag_sync_runs`, etc.) — extends it via new workspace-scoped tables.
- Create a parallel KGRA Agent runtime — Graph Agent Lite mirrors KGRA Agent module shape and shares architectural primitives.
- Duplicate the existing approval/governance scaffolding.
- Treat Neo4j CE as a source of truth.
- Allow agents to mutate graph facts directly — only governed proposals + approved Postgres source-of-truth changes can propagate to Neo4j CE.
- Implement plugin runtime, full Canvas, full Bases, real-time collaboration, offline sync, or local-first mode in MVP 0–4.
- Force existing system records to become notes.
- Build advanced graph views before the Phase 1.5 backend decision gate closes.

## 5. Consequences

**Positive:**
- Zero risk of build-and-discard: every new surface is layered on existing infrastructure or fills a clear gap.
- Existing modular checks (`check:wiring`, `check:boundaries`, `check:module-readiness`) automatically apply to new code.
- Permission/governance contracts inherited from existing scaffolding.
- Native Graph Workspace becomes the user-facing entry point for the existing GraphRAG / KGRA / Data Analysis graph capabilities.

**Negative / risks:**
- Tight coupling to existing module boundaries — refactors in `server/agent-studio/services/` may cascade.
- Projection sync introduces operational complexity (drift detection, replay).
- Neo4j CE single-instance limits documented in `agent-studio-neo4j-community-edition-graph-backend.md` — production hardening deferred to Phase 27.

## 6. Alternatives considered

- **Pure Postgres recursive-CTE graph.** Rejected: existing GraphRAG control plane already shows the pain of graph workloads on Postgres-only. Backend decision gate (Phase 1.5) formally evaluates.
- **Neo4j Enterprise / Aura from day one.** Rejected: cost + production hardening overhead for MVP. Phase 27 defines the upgrade path.
- **Reuse `kgra/` Python sidecar as the graph runtime.** Rejected: heterogeneous runtime + IPC complexity; Native Graph Workspace stays inside the TypeScript monorepo.
- **Greenfield rebuild ignoring existing GraphRAG / KGRA Agent.** Rejected: explicit AGENTS.md / CLAUDE.md mandate to extend existing systems.

## 7. Acceptance

- [x] Existing systems mapped (this doc §2).
- [x] Non-build list documented (§4).
- [x] Postgres/Neo4j responsibility split locked (companion ADR).
- [x] Graph Agent integration boundaries documented (companion ADR).
- [x] KGRA disposition documented (§2 — extends/aligns, no parallel runtime).
- [x] Data Analysis RTLM disposition documented (§2 — consumes typed projections).
- [ ] All Phase 1 ADRs merged (companion ADRs in `docs/architecture/agent-studio-*.md`).
- [ ] Backend decision gate closed (Phase 1.5).
- [ ] CLAUDE.md non-build list update merged.

## 8. Evidence

- Existing GraphRAG schema: `drizzle/tables/graphrag.ts` (read 2026-05-10).
- Existing KGRA Agent module: `server/kgra-agent/{engine,nodes,router,adapter,public-api,manifest,ports}.ts`.
- Existing Data Analysis GraphRAG subdomain: `server/data-analysis/graphrag/`.
- Existing MCP dispatcher: `server/agent-studio/services/mcp/dispatcher.ts`.
- Existing OpenRouter Model Access: `server/openrouter/model-access/`.
- AGENTS.md mandate: extend, do not greenfield-rebuild.
- CLAUDE.md mandate: existing CAG/MCP/governance scaffolding must be reused.
