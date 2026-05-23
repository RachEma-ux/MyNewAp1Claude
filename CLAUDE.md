# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It is also the **living architectural consistency file** for the Agent Studio Universal KB / Universal Ingestion / RAC / RAG / CAG / MCP Tool-Use / Critical Approval retrofit (Phases 0–14).

## Project Operating Context

Repository: `RachEma-ux/MyNewAp1Claude`. AGENTS.md is the authoritative repo operating policy (5-agent model: Planner → Builder → Reviewer → Tester → Governance). CLAUDE.md is the architectural reference; AGENTS.md governs how work is performed.

## Mandatory Repository Rules

- Read AGENTS.md before implementation.
- Follow Planner → Builder → Reviewer → Tester → Governance for non-trivial work.
- Extend existing Agent Studio. Do not greenfield-rebuild it.
- OpenRouter remains the model execution path for retrofit-bound flows (alternate model paths exist for legacy reasons; see §"Architectural Boundaries").
- Existing MCP dispatcher (`server/agent-studio/services/mcp/dispatcher.ts`) remains the only tool execution path.
- Existing CAG Capability Packs (`server/agent-studio/services/cag/`) are the base CAG system and must be extended, not duplicated.
- Existing approval/governance scaffolding (`agsApprovalSteps`, `agsPendingPermissionRequests`, `evaluateGovernance()`) must be reused where possible.

## Architectural Boundaries

**Universal Ingestion** (Phases 2–3, new under `server/agent-studio/services/ingestion/`):
- Converts supported source artifacts into `NormalizedKnowledgeUnit` records.
- Does not execute tools.
- Does not inject raw artifacts into prompts by default.

**Knowledge Base** (Phases 2–4, persistence in `agsKnowledgeUnits` + `agsProvenanceRecords` + sibling tables):
- Stores governed, versioned, retrievable knowledge.
- Owns sources, documents, document versions, knowledge units, chunks, embeddings, indexes, provenance, permissions, and freshness.
- Does not execute tools.

**RAG** (Phase 4, extends existing `server/agent-studio/services/rac/retrieval-*`):
- Retrieves governed evidence from KB via the existing RAC retrieval planner / executor / filter.
- Does not execute tools.

**CAG** (Phase 5, extends existing `server/agent-studio/services/cag/`):
- Stable, versioned, compiled runtime context with hash + governance metadata.
- Does not store raw corpora.
- Does not override MCP schemas.
- Does not execute tools.
- Locked: 8-class `riskClass` taxonomy at the manifest (D-TOOL-1); read via `readRiskClass()` only (D-TOOL-5).

**RAC** (Phase 6, extends existing planner/orchestrator):
- Plans and assembles runtime context with explicit modes:
  - `no_retrieval`
  - `cag_only`
  - `knowledge_retrieval`
  - `multimodal_hybrid_retrieval`
  - `tool_knowledge_retrieval`
  - `hybrid_cag_rag`
  - `hybrid_cag_tool_knowledge`
  - `hybrid_cag_rag_tool_knowledge`
- Does not execute tools.

**MCP** (existing dispatcher; Phases 7–9 extend without replacing):
- `dispatchMcpToolCall(input)` is the single chokepoint.
- All tool calls must pass `ProposedToolCall` validation (Phase 8), governance, approval where required (Phase 9), and MCP schema validation.
- Sandbox routes `riskClass="code_execution"` per D-SBX-3 (P9 of the prior RAC roadmap).

**Governance**:
- Enforces permissions, freshness, citation, CAG validity, data-type policy, tool risk, and approval.
- `agsPendingPermissionRequests` is the approval persistence; `evaluateGovernance()` is the policy engine.
- Approval permits dispatch; approval does not execute tools.

## Embedding Storage Decision

- Use existing embedding storage for MVP.
- `ags_rac_sources` carries per-source embedding binding (D-EMB-1: `embedding_provider_connection_id` / `embedding_model_ref` / `embedding_model_dim`).
- Do not force `pgvector` migration in MVP. No `vector(N)` columns are added in this retrofit.
- pgvector is documented as a future migration in `docs/architecture/agent-studio-pgvector-future-migration.md` (Phase 1 deliverable).

## Implementation Status

Tracked in `docs/implementation/agent-studio-roadmap-delta.md` (Phase 0 deliverable) and the per-phase memory entry `~/.claude/projects/-root/memory/project_rac_progress.md`. RAC roadmap (P1A–P12) shipped 2026-05-06. Retrofit (Universal KB + Ingestion + ProposedToolCall + Approval Gate + UI) **CLOSED 2026-05-06** at P14 (`55c8b6b`); follow-ups §A wiring, §B coverage, §C latent cleanup, §D1 pgvector optional engine, §D2 multi-region forward-looking ADR, §D3 synthesizer enum removal, §D4 five extension parsers (CSV/xlsx/OCR/audio/video), §D5 ai-types vi.mock repair all closed. Four review-polish PRs followed (#218 chat.ts spec-bypass + dispatcher CagRequiredError, #219 CAG compile metadata + KB workspace gate, #220 KB listing composite index + trace observability, #221 trace warn-breadcrumb test guard). PR #222 added §B-followup integration coverage. PR #223 corrected the migration 0042 path: ASDB does not run Drizzle SQL migrations (uses table-by-table seed reconciler), so the partial WHERE clause moved to operator-applied `scripts/migrations/manual/kb-listing-partial-index.sql` (same shape as the pgvector script). The retrofit ships **13 parsers** total (text, markdown, html-snapshot, json, basic-pdf, basic-code, csv, xlsx, ocr, audio, video, docx, ocr-pdf). `application/pdf` defaults to `basic_pdf_text`; OCR-PDF is reached via `IngestionJobRequest.parserKey="ocr_pdf"` operator override.

## Deferred Scope

- Multi-region deployment — single-region remains the operational baseline. Forward-looking ADR locks the deferral + trigger conditions + swap surface (`docs/architecture/agent-studio-multi-region.md`).

(DOCX closed at R5 — `D-PARSE-DOCX-1..4` per `docs/architecture/agent-studio-docx-parser.md`. OCR-PDF closed at R6 — `D-PARSE-OCRPDF-1..4` per `docs/architecture/agent-studio-ocr-pdf-parser.md`.)

## Native Graph Workspace — Non-Build List (MVP 0–4)

The Native Graph Workspace initiative (per `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`) **extends** existing graph-shaped infrastructure and must NOT duplicate it.

Existing systems to extend, not greenfield:
- `server/kgra-agent/` — existing Knowledge Graph + Reasoning Agent (12-node pipeline, RAGDB-backed). Graph Agent Lite (Phase 13) is a vault-aware **sibling**; mirrors module shape (manifest / ports / public-api / engine / nodes / state); calls KGRA `actions.ts` (`ingestProject`, `buildKnowledgeGraph`, `getGraphStats`) for entity / relationship extraction.
- `server/modules/kgia/` — existing Neo4j Inference Agent with stub adapter, query planner, schema discovery, frontend pages at `/kgia/*`. The new `Neo4jCommunityGraphRepository` (Phase 7.5) wraps and hardens KGIA's adapter; new Native Graph Workspace UI at `/agent-studio/graph-workspace/` coexists with `/kgia/*`.
- `server/data-analysis/graphrag/` — existing GraphRAG control plane (Python worker on `:8484`). Phase 12 GraphRAG Retrieval Router calls existing `dataAnalysis.graphRag.*` tRPC for index / query workflows; does not greenfield indexing.
- `drizzle/tables/graphrag.ts` — existing `graphrag_sources`, `graphrag_sync_runs`, `graphrag_index_runs`, `graphrag_query_runs`, `graphrag_artifact_registry`. New `ags_*` tables (`ags_vault_*`, `ags_graph_*`, `ags_graph_projection_*`, etc.) are **additive**; new vault sources register via existing `graphrag_sources`.
- `drizzle/tables/ragdb.ts` — existing `kgra_entities`, `kgra_relationships`, `kgra_build_runs`, `kgra_manual_nodes`. Read-only projection target; not modified.
- `server/agent-studio/services/cag/` — Phase 10 adds CAG block → source note version reference; existing CAG runtime contract preserved.
- `server/agent-studio/services/rac/` — Phase 12 GraphRAG router registers as new `RetrievalPlanItem` source type; existing planner / executor / filter unchanged.
- `server/agent-studio/services/mcp/dispatcher.ts` — single tool execution chokepoint. Graph Agent Lite must use `dispatchMcpToolCall(input)`; no parallel tool execution.
- `server/openrouter/model-access/` — single model execution path. Graph Agent Lite must use `execute()` / `stream()` / `embed()`; no direct provider SDK imports.
- `agsRuntimeRuns` (V3 Phase 11a observability columns) — Native Graph Workspace adds Neo4j projection (Phase 14); preserves Postgres source-of-truth.

Hard rules:
- All graph access goes through `GraphRepository` (`server/agent-studio/services/graph/repository/`). No `neo4j-driver` imports outside `server/agent-studio/services/graph/repository/**` and `server/modules/kgia/**`. Source-scan tested.
- Postgres = source of truth; Neo4j CE = projected backend. No reverse direction outside ADR-approved bidirectional flows.
- Graph Agent Lite must not mutate graph facts directly. Mutations route through Phase 11.5 graph change proposals + existing approval scaffolding.
- Cypher templates must be parameterized; no raw query strings outside `ags_query_templates` registry.
- Read-only Text2Cypher; mutations forbidden.
- **Vault FS-sync** (Track A, `docs/architecture/agent-studio-vault-fs-sync.md`): `.md` filesystem mirror is a writeable projection alongside the offline-local-first IndexedDB cache. Postgres remains canonical; per-vault opt-in via `ags_vaults.fs_sync_path` under operator-configured `VAULT_FS_SYNC_ALLOWED_ROOTS`. `fs.write*` / `fs.rename*` / `fs.unlink*` / `fs.mkdir*` inside `server/agent-studio/services/vault/**` are restricted to `fs-sync/` + the two sibling `fs-sync-{backfill,integration}.ts` modules (source-scan tested). Atomic `.tmp → rename` writer + SHA-256 `fs_sync_last_hash` cycle prevention + chokidar 5 watcher. CRDT/Yjs is the merge venue on concurrent edits.
- **Vault → Knowledge Graph projection chain** (shipped 2026-05-18 across PRs #1476–#1488): every vault note mutation (`createNote` / `updateNote` / `deleteNote`) fans out into a `note.created` / `note.updated` / `note.deleted` row in `ags_graph_projection_sync_jobs` via `enqueueVaultNoteProjection`. The drain cron (`*/5 * * * *`, env-gated via `AGS_PROJECTION_DRAIN_CRON_DISABLED`) hands pending rows to `ProjectionSyncWorker.handle()` → `GraphRepository` → Neo4j writes; `MAX_DRAIN_RETRY_ATTEMPTS = 3` caps failure retries. Outgoing wikilinks + embeds are persisted into `ags_vault_wikilinks` + `ags_vault_embeds` (REPLACE-on-version, latest-version invariant); `WikilinksBacklinksPanel` reads from these tables (not client-side regex scan). Inbound-resolution backfill on `note.created` re-enqueues peer notes whose `content_md` references the new slug — closes the creation-order asymmetry. Bypassing the queue (writing to Neo4j directly from `services/vault/**`) breaks the Postgres-canonical + DB-backed-backlinks invariants.

Out of scope for MVP 0–4 (eternal — boundary preserved even after V1+ shipments):
- `kgra/` Python sidecar at repo root
- `server/kgra-agent/` internal changes
- `server/data-analysis/` internal changes
- Plugin framework / marketplace — V2.x scope per `agent-studio-native-graph-workspace-roadmap.md` Phase 26 (T-H, gated on operator approval)
- Neo4j Enterprise / Aura migration (Phase 27 documents the upgrade path)

**V1+ plan scope — first slices shipped 2026-05-13, full hardening in V2.0** (formerly listed as eternal MVP-0-4 deferrals; reclassified 2026-05-15 because the V1+ plan opened these phases and the strict-audit doc names the reclassification trigger):
- Real-time collaborative editing / CRDT — V1+ plan Phase CRDT (`docs/architecture/agent-studio-realtime-collab-crdt.md`). Phases α/β/γ/γ-2/γ-3-auth/γ-3-upgrade/γ-3-framing/transport landed (#755/#764/#765/#774/#787-#791); full hardening (y-protocols framing, presence persistence, conflict UX) tracked in `agent-studio-native-graph-workspace-remaining-execution-plan.md` track T-B.
- Offline sync / local-first mode — V1+ plan Phase OL-1 (`docs/architecture/agent-studio-offline-local-first.md`). Phases α through OL-9 landed (#756/#762/#773/#777–#781/#783/#785); operator rollout (App.tsx call site with real tRPC closures) tracked in remaining-plan T-B.
- Multi-region graph deployment — V1+ plan Phase MR-1 (`docs/architecture/agent-studio-multi-region.md`). Phases α through MR×19 + caller-migration batches landed (#754/#763/#775/#794/#797/#798/…); production rollout (Aurora-style replication, failover runbook execution) tracked in remaining-plan T-H.2.
- **Canvas** — Phase 17 data model + service shipped (#752 / #761); UI page (`CanvasPage.tsx`) is open Phase 17 work in the punch list. NOT eternal.
- **Bases** — Phase 24 MVP + KG projection shipped 2026-05-18 (#1508 / #1509). `ags_bases` / `ags_base_columns` / `ags_base_rows` data model + 9-procedure tRPC + `base.*` ProjectionEvent kinds live. Lens registry + Impact Analysis Lens + Quality Lens + Runtime Lens tracked in the punch list as T-F.1 / T-F.3 / T-F.4 / T-F.5. NOT eternal.

The strategic intent of the original MVP-0-4 Non-Build List was to prevent over-scoping the *initial closure* — not to forbid those features in the V1+ successor plan. The V1+ plan, the remaining execution plan, and `agent-studio-native-graph-workspace-remaining-punch-list-2026-05-19.md` are the authoritative scope documents for these areas going forward.

ADR index: `docs/architecture/agent-studio-native-graph-workspace.md` (top-level), `agent-studio-postgres-neo4j-responsibility-split.md`, `agent-studio-graph-agent-integration-boundaries.md`, `agent-studio-graph-repository-and-backend-strategy.md`, `agent-studio-active-graph-backend-decision.md` (Phase 1.5 closure), `agent-studio-realtime-collab-crdt.md`, `agent-studio-offline-local-first.md`, `agent-studio-multi-region.md`.

Execution plan index: `docs/implementation/agent-studio-native-graph-workspace-roadmap.md` (canonical 28-phase), `agent-studio-native-graph-workspace-v1-v2-execution-plan.md` (active V1+ 10-phase), `agent-studio-native-graph-workspace-remaining-execution-plan.md` (forward T-A..T-H tracks).

---

## CRITICAL: Device Workflow Rules

- **DO NOT run builds, tests, or dev servers on device** by default. The user has authorized `pnpm check` / `pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork` for validation passes (see `~/.claude/projects/-root/memory/feedback_repo_overrides.md`); other invocations need explicit instruction.
- **Work with file tools** (Read, Edit, Write) and **push to GitHub**.
- **Never modify files on device outside of git workflow** — edit, commit, push.
- Once built on GitHub (CI), pull to device.
- **Neo4j is not installed on this Termux dev box.** No `neo4j` binary on PATH, no `neo4j*` directory under `/data/data/com.termux`, no runit service, no `NEO4J_*` env vars. Any UI surface that depends on the graph projection (Graph Workspace, Graph Health Admin, Graph Lens Browser, KGIA pages, Vault Explorer's graph view) will render the `neo4j_unavailable` workspace-state banner (`WorkspaceStateLayer.tsx:79-85`: "Graph backend unavailable — showing cached data where possible"). This is the **designed graceful-degradation** path, not a regression. Postgres-canonical surfaces (Bases Admin, Agent CRUD, runtime runs, approvals, retention crons, etc.) work normally. If verification needs Neo4j-side behavior, the operator must install Neo4j CE + OpenJDK separately — non-trivial on Termux.

## MANDATORY: Local App Launch Procedure

When asked to open/start/run the app on localhost:3000, ALWAYS follow these steps in order:
1. Create `/tmp` dirs: `mkdir -p /tmp/claude-$(id -u) 2>/dev/null`
2. Kill all running instances: `pkill -f "tsx.*server/_core/index.ts"; pkill -f "npm run dev"; pkill -f "npm exec tsx"; pkill -f "esbuild.*service"; kill $(lsof -ti :3000) 2>/dev/null`
3. Ensure PostgreSQL is running: `pg_ctl -D /data/data/com.termux/files/usr/var/lib/postgresql status || pg_ctl -D /data/data/com.termux/files/usr/var/lib/postgresql start`
4. Ensure main DB exists: `psql -d mynewap1claude -c "SELECT 1;" || createdb mynewap1claude`
4b. Ensure ASDB exists (Agent Studio dedicated DB, Phase 12.5): `psql -d asdb -c "SELECT 1;" || createdb asdb`
4c. Ensure RAGDB exists (RAG Knowledge Graph DB): `psql -d ragdb -c "SELECT 1;" || createdb ragdb`
4d. Seed provider rows from env (one-time per fresh DB; idempotent — Phase 28.2 replaced the boot-time `autoProvisionProviders` block with this script): `pnpm tsx scripts/provider-connections/seed-from-env.ts`
5. Start dev server: `TMPDIR=/data/data/com.termux/files/usr/tmp nohup npm run dev > /data/data/com.termux/files/usr/tmp/dev-server.log 2>&1 &`
6. Wait and verify: `/data/data/com.termux/files/usr/bin/sleep 5 && tail -3 /data/data/com.termux/files/usr/tmp/dev-server.log` — confirm `Server running on http://localhost:3000/`
7. Open: `xdg-open "http://localhost:3000/"`

## Project Overview

MyNewAppV1 is a local-first AI development platform (LLM Control Plane) built as a full-stack TypeScript monorepo. It provides workspace-based management for LLM providers, document ingestion/RAG, agent orchestration, automation workflows, and governance features.

For detailed architecture, layer mapping, and security controls, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Commands

- **Dev server:** `npm run dev` (runs Express + Vite HMR on port 3000)
- **Build:** `npm run build` (Vite frontend build + esbuild server bundle to `dist/`)
- **Type check:** `npm run check` (runs `tsc --noEmit && tsx scripts/check-cag-boundary.ts`)
- **Format:** `npm run format` (Prettier)
- **Run all tests:** `npm run test` (Vitest)
- **Run a single test:** `npx vitest run server/path/to/file.test.ts`
- **DB migrations:** `npm run db:push` (drizzle-kit generate + migrate)
- **Start production:** `npm run start`
- **Builder Deploy:** `.github/workflows/builder-deploy.yml` is a GHA workflow that builds, releases, and runs the app behind a `*.trycloudflare.com` tunnel for a chosen duration. `workflow_dispatch` only; inputs include `version` (auto-increments by default), `run_app` (yes/no), `duration` (5/10/15/30 min), `dev_mode`. The live tunnel URL is published to gist `54451f4f49427f293bfdc9fc0a037b2d` (repo variable `TUNNEL_GIST_ID`, file `tunnel-status.json`).

## Architecture

### Monorepo Structure

```
client/src/     → React 19 frontend (Vite, Tailwind 4, wouter routing)
server/         → Express 4 backend with tRPC 11 API layer
shared/         → Types and constants shared between client and server
drizzle/        → PostgreSQL schema (Drizzle ORM) and migrations
```

### Client-Server Communication

The app uses **tRPC** for end-to-end type-safe API calls. The full data flow:

1. Schema defined in `drizzle/schema.ts` → types exported via `shared/types.ts`
2. Server routers in `server/routers.ts` compose all sub-routers into `appRouter` (the `AppRouter` type)
3. Client creates typed hooks via `client/src/lib/trpc.ts` → `createTRPCReact<AppRouter>()`
4. React Query manages caching/state via `@tanstack/react-query`
5. SuperJSON transformer handles serialization (dates, etc.) on both sides

### Server Entry Point

`server/_core/index.ts` boots the Express server:
- Runs Drizzle migrations on startup
- Initializes provider registry (`server/providers/init.ts`)
- Mounts tRPC at `/api/trpc`, file uploads at `/api`, chat streaming at `/api/chat/stream`
- In dev mode: Vite middleware for HMR. In production: serves static `dist/public/`

### Key Server Domains

Each domain has its own router, DB queries, and types:

| Directory | Purpose |
|---|---|
| `server/providers/` | LLM provider registry (Ollama, OpenAI, Anthropic, Google, llama.cpp) |
| `server/openrouter/` | OpenRouter integration (the retrofit-bound model execution path) |
| `server/chat/` | Chat streaming with provider routing |
| `server/agent-studio/` | Agent Studio: drafts, releases, CAG, RAC, MCP, governance, runtime |
| `server/agent-studio/services/cag/` | Capability Packs (CAG) — extended in Phase 5 |
| `server/agent-studio/services/rac/` | RAC source registry, ingestion adapters, retrieval, assembler |
| `server/agent-studio/services/mcp/` | MCP dispatcher (the single tool-execution chokepoint) |
| `server/agent-studio/services/sandbox/` | `node:vm` tool sandbox (P9 of prior RAC arc) |
| `server/agent-studio/services/ingestion/` | Universal Ingestion (Phase 3, NEW) |
| `server/agents/` | Legacy agent orchestration (pre-Agent-Studio; out of retrofit scope) |
| `server/automation/` | Workflow builder, triggers, actions |
| `server/documents/` | Document upload, chunking, embedding pipeline |
| `server/inference/` | Inference routing, batch service, hybrid router |
| `server/vectordb/` | Qdrant vector database integration |
| `server/embeddings/` | Embedding generation and management |
| `server/models/` | Model download, benchmarking, versioning |
| `server/secrets/` | Secret management |
| `server/policies/` | Rule-based policy scoring |
| `server/wiki/` | Knowledge base wiki |
| `server/routers/` | Additional tRPC routers (agents, triggers, workflows, deploy, etc.) |

### Frontend Structure

- **Routing:** `wouter` (not react-router). All routes defined in `client/src/App.tsx`
- **UI components:** Radix UI primitives in `client/src/components/ui/`, shadcn/ui pattern
- **Pages:** `client/src/pages/` — one file per page, 70+ pages; Agent Studio module under `client/src/modules/agent-studio/`
- **Auth:** Optional OAuth flow; app runs in "demo mode" without OAuth config (`isOAuthConfigured()`)
- **Theming:** `next-themes` via `ThemeContext`, defaults to dark mode

### Path Aliases

- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

### Auth Model

Three tRPC procedure levels: `publicProcedure`, `protectedProcedure` (requires login), `adminProcedure` (requires admin role). When OAuth env vars (`VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID`) are unset, auth is bypassed entirely.

### Database

PostgreSQL via Drizzle ORM. Schema in `drizzle/schema.ts` + per-domain files under `drizzle/tables/`. The DB connection is lazy-initialized from `DATABASE_URL` env var. Three Postgres databases: main (`mynewap1claude`), ASDB (`asdb` — Agent Studio dedicated, per Phase 12.5), RAGDB (`ragdb` — Knowledge Graph). Key tables: users, workspaces, workspace_members, models, documents, document_chunks, agents, conversations, messages, workflows, workflow_executions, providers, routing_audit_logs. Agent Studio tables under `ags_*` prefix on ASDB.

### TypeScript Configuration

`tsconfig.json` has `strict: false` and excludes many server directories from type checking (routers, services, features, modules, client/src). The `npm run check` command reflects this limited scope. The build uses esbuild for the server (not tsc).
