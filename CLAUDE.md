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

Tracked in `docs/implementation/agent-studio-roadmap-delta.md` (Phase 0 deliverable) and the per-phase memory entry `~/.claude/projects/-root/memory/project_rac_progress.md`. RAC roadmap (P1A–P12) shipped 2026-05-06. Retrofit (Universal KB + Ingestion + ProposedToolCall + Approval Gate + UI) **CLOSED 2026-05-06** at P14 (`55c8b6b`); follow-ups §A wiring, §B coverage, §C latent cleanup, §D1 pgvector optional engine, §D2 multi-region forward-looking ADR, §D3 synthesizer enum removal, §D4 five extension parsers (CSV/xlsx/OCR/audio/video), §D5 ai-types vi.mock repair all closed. Four review-polish PRs followed (#218 chat.ts spec-bypass + dispatcher CagRequiredError, #219 CAG compile metadata + KB workspace gate, #220 KB partial index migration 0042 + trace observability, #221 trace warn-breadcrumb test guard). The retrofit ships **11 parsers** total (text, markdown, html-snapshot, json, basic-pdf, basic-code, csv, xlsx, ocr, audio, video).

## Deferred Scope

- Multi-region deployment — single-region remains the operational baseline. Forward-looking ADR locks the deferral + trigger conditions + swap surface (`docs/architecture/agent-studio-multi-region.md`).
- DOCX + OCR-PDF parsers — listed in D-UI-5's original deferral set; §D4 closed audio/video/image-OCR but DOCX and PDF-with-images stay open behind future `D-PARSE-DOCX-N` / `D-PARSE-OCRPDF-N` ADRs.

---

## CRITICAL: Device Workflow Rules

- **DO NOT run builds, tests, or dev servers on device** by default. The user has authorized `pnpm check` / `pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork` for validation passes (see `~/.claude/projects/-root/memory/feedback_repo_overrides.md`); other invocations need explicit instruction.
- **Work with file tools** (Read, Edit, Write) and **push to GitHub**.
- **Never modify files on device outside of git workflow** — edit, commit, push.
- Once built on GitHub (CI), pull to device.

## MANDATORY: Local App Launch Procedure

When asked to open/start/run the app on localhost:3000, ALWAYS follow these steps in order:
1. Create `/tmp` dirs: `mkdir -p /tmp/claude-$(id -u) 2>/dev/null`
2. Kill all running instances: `pkill -f "tsx.*server/_core/index.ts"; pkill -f "npm run dev"; pkill -f "npm exec tsx"; pkill -f "esbuild.*service"; kill $(lsof -ti :3000) 2>/dev/null`
3. Ensure PostgreSQL is running: `pg_ctl -D /data/data/com.termux/files/usr/var/lib/postgresql status || pg_ctl -D /data/data/com.termux/files/usr/var/lib/postgresql start`
4. Ensure main DB exists: `psql -d mynewap1claude -c "SELECT 1;" || createdb mynewap1claude`
4b. Ensure ASDB exists (Agent Studio dedicated DB, Phase 12.5): `psql -d asdb -c "SELECT 1;" || createdb asdb`
4c. Ensure RAGDB exists (RAG Knowledge Graph DB): `psql -d ragdb -c "SELECT 1;" || createdb ragdb`
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
