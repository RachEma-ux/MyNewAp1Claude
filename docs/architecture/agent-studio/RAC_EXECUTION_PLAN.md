# RAC Implementation — Execution Plan

**Owner:** Agent Studio module
**Status:** Draft v1 — actionable; awaiting acceptance
**Authority:** Builds on the four pre-bundle decision records merged in PR #161 (`docs/architecture/agent-studio/RAC_TOOL_CLASSIFICATION.md`, `RAC_EMBEDDING_BINDING_DECISION.md`, `RAC_SANDBOX_PREREQUISITE.md`, `RAC_PROMPT_COMPOSITION.md`)
**Anchored against main:** `3e3a9eb`

---

## 0. Inputs and prerequisites

This is an *execution* plan, not an architecture document. Architecture is locked in:

| Decision record | Locked decisions | Phase that consumes |
| --- | --- | --- |
| `RAC_TOOL_CLASSIFICATION.md` | D-TOOL-1..6 — eight-class taxonomy on the manifest, no `unknown` | P0.6, P1B, P9, P10 |
| `RAC_EMBEDDING_BINDING_DECISION.md` | D-EMB-1..5 — embeddings bind to source row, `withEmbeddingCredential` resolver | P0.5, P3, P4 |
| `RAC_SANDBOX_PREREQUISITE.md` | D-SBX-1..5 — concrete sandbox required, dispatcher routes only `code_execution` | P0.6, P9, P10 |
| `RAC_PROMPT_COMPOSITION.md` | D-PRM-1..7 — single composer, fixed section order, 6144 cap | P1B, P1C, P5, P7 |

**Repo state assumed:**
- Phase 27.3 binding contract (`ags_agent_provider_bindings`) is the chat-binding source of truth.
- Pre-existing red CI: `tests/integration/ai-types/execution{,-observability}.test.ts` — 10 failures unrelated to provider/binding/RAC paths. Merge through them when the PR doesn't touch those files.
- Migration journal must be backfilled correctly: every new SQL migration MUST land in `drizzle/meta/_journal.json` with a `when` strictly greater than the latest existing entry, otherwise `migrate()` skips it.
- Governed mutations require `_evidence: { types: ["reason"], refs: [...] }` payload. Service-layer scripts can bypass governance for backfills.
- ASDB owns Agent Studio tables (`ags_*`); main DB owns `catalog_entries` + `provider_connections`. RAC tables belong in ASDB.

**Authority granted (assumed; confirm before P1A):**
- Autonomous merge after CI green (or pre-existing-red path-unaffected merge per memory rule)
- Branch-per-PR, squash-merge, no force-push to main
- Commit format: title line + Co-Authored-By trailer

---

## 1. Phase sequencing — at a glance

```
P0    audit + reality map         ──┐
P0.5  retrieval foundation DR      ├── docs-only, can land in parallel
P0.6  sandbox impl decision DR    ──┘   (pre-bundle covers most)

P1A   CAG schema + store               ┐
P1B   CAG builder/validator/renderer   │  CAG MVP
P1C   CAG resolver + 1 runtime path    │  (binding-driven chat only)
P1D   CAG backend preview APIs         │
P1E   CAG tests + boundary checks      ┘

P2    RAC source registry              ┐
P3    Ingestion + indexing adapters    │
P4    RAC retrieval pipeline           │  Retrieval pipeline
P5    RAC context assembler            │
P6    Runtime integration              ┘

P7    RAC trace + observability + feedback
P8    RAC evaluation
P9    Sandbox gate
P10   Export readiness
P11   RAC UI
P12   Rollout readiness
```

Phases run **strictly sequentially within a track**; P0/P0.5/P0.6 can run in parallel; P1B requires P1A; P3 requires P2; P5 requires P4. Crossing tracks (e.g. starting P2 before P1E lands) is permitted only if the cross-track PR doesn't import code from the unfinished phase.

---

## 2. Phase execution detail

### Phase 0 — Audit and Reality Map

**Branch:** `docs/rac-p0-reality-map`
**PR title:** `docs(agent-studio): RAC architecture + repo reality map (P0)`
**Files:**
- `docs/architecture/agent-studio/RAC_NATIVE_ARCHITECTURE.md`
- `docs/evidence/agent-studio-rac/RAC_REPO_REALITY_MAP.md`
- `docs/evidence/agent-studio-rac/MCP_SNAPSHOT_GAP_REPORT.md` *(only if no stable MCP snapshot)*

**Audit deliverables (concrete, not aspirational):**

For each of the inspect targets in the roadmap, the reality map must answer:

| Inspect target | Required answers |
| --- | --- |
| `server/agent-studio/chat-stream.ts` | Where does the system prompt get assembled today? Line numbers. |
| `server/agent-studio/services/chat.ts` | Same as above for `runChatBindingDriven`. |
| `server/agent-studio/services/test-run-binding.ts` | Same. |
| `server/agent-studio/bindings.ts` | What does `binding_v1` already enforce that RAC can build on? |
| `server/agent-studio/services/mcp/` | Is there a stable capability snapshot, or only live `callTool`? |
| `server/agent-studio/services/export-catalog*` | What candidate fields exist; what readiness flags? |
| `drizzle/tables/agent-studio.ts` | What ASDB tables exist; which are append-only; which carry workspace_id? |
| GraphRAG | What public retrieval contract does Data Analysis expose? |
| `tests/pmb/` | Which boundary checks/invariants apply to new agent-studio code? |

**Stop conditions (per roadmap):**
- No stable MCP capability snapshot → write `MCP_SNAPSHOT_GAP_REPORT.md` and pause P1B until P0 supplements with a snapshot proposal.
- No public retrieval contract from Data Analysis / GraphRAG → P2 source registry can still proceed (refs only); P3 and P4 stop until contract exists.

**Validation:** Reality map names every line/file/contract that P1+ phases will touch. No "TBD" entries.

**PR size:** ~600–1000 lines of markdown, no code.

---

### Phase 0.5 — Retrieval Foundation Decision Record

**Branch:** `docs/rac-p0_5-retrieval-foundation`
**PR title:** `docs(agent-studio): RAC retrieval foundation decision (P0.5)`
**Files:** `docs/architecture/agent-studio/RAC_RETRIEVAL_FOUNDATION_DECISION.md`

**Locks (in addition to D-EMB-1..5 already in pre-bundle):**

1. Source types — final enum (matches D-EMB references and roadmap §0.5).
2. Chunking strategy — concrete numbers (chunkSize, overlap), heading preservation rules.
3. Embedding policy — already locked by D-EMB-1..5; this DR cross-references.
4. Vector / graph index decision — pick one of:
   - Use existing GraphRAG (ragdb) via public `dataAnalysis.graphrag.retrieve` contract for project documents.
   - Stand up `pgvector` in ASDB for Agent-Studio-managed collections (only if D-EMB shows we can't reuse GraphRAG embeddings).
   - Adapter-only with stub backend → only acceptable if real retrieval lands by P4.
5. Quality filtering — concrete defaults: `minScore=0.45`, `maxChunks=8`, `dedupeBy="hash"`, `freshnessMaxAgeDays=null` (no default expiry).
6. Latency target — wired into P7 trace (`retrieval_latency_ms` column REQUIRED) so the SLO can be measured.

**Validation:** A reviewer must be able to read this and start P3 ingestion code without asking another question.

**PR size:** ~400 lines markdown.

---

### Phase 0.6 — Sandbox Implementation Decision

**Branch:** `docs/rac-p0_6-sandbox-impl`
**PR title:** `docs(agent-studio): RAC sandbox implementation choice (P0.6)`
**Files:** `docs/architecture/agent-studio/RAC_SANDBOX_IMPLEMENTATION_DECISION.md`

**Locks:** Picks one of the three concrete options enumerated in `RAC_SANDBOX_PREREQUISITE.md` D-SBX-1. Records:
- Why this implementation
- Adapter contract (`sandbox.execute(name, args, ctx)`)
- Failure modes and how the dispatcher surfaces them
- Test-mode strategy (D-SBX-4 says real, not mock)
- CI strategy (can the chosen sandbox run in GHA?)

**Note:** P0.6 PR locks the *decision*. The implementation lands in P9. Without this DR, P9 cannot start.

---

### Phase 1A — CAG Schema + Store

**Branch:** `feat/rac-p1a-cag-schema`
**PR title:** `feat(agent-studio): CAG schema, types, store, events (P1A)`
**Files:**
- `drizzle/0039_cag_schema.sql` *(new migration)*
- `drizzle/meta/_journal.json` *(append entry idx=39, tag=`0039_cag_schema`, `when` > `1779494400000`)*
- `drizzle/tables/agent-studio.ts` — append `agsCagCapabilityPacks`, `agsCagPackEvents` table definitions
- `server/agent-studio/services/cag/types.ts`
- `server/agent-studio/services/cag/hashing.ts`
- `server/agent-studio/services/cag/store.ts`
- `server/agent-studio/services/cag/events.ts`
- `server/agent-studio/services/cag/index.ts` *(barrel)*

**Schema (final, per roadmap):**

```sql
CREATE TABLE "ags_cag_capability_packs" (
  id                    serial PRIMARY KEY,
  workspace_id          integer NOT NULL,
  agent_id              integer NOT NULL,
  agent_draft_id        integer NOT NULL,
  catalog_entry_id      integer,
  pack_type             varchar(50) NOT NULL DEFAULT 'capability_v1',
  pack_version          integer NOT NULL DEFAULT 1,
  status                varchar(32) NOT NULL DEFAULT 'fresh',
  content_json          json NOT NULL,
  compressed_prompt     text,
  token_estimate        integer,
  source_manifest_json  json NOT NULL,
  source_hashes_json    json NOT NULL,
  injection_policy_json json,
  risk_summary_json     json,
  created_by            integer NOT NULL,
  created_at            timestamp NOT NULL DEFAULT now(),
  updated_at            timestamp NOT NULL DEFAULT now(),
  expires_at            timestamp,
  last_used_at          timestamp,
  CONSTRAINT uniq_ags_cag_pack_draft_version UNIQUE (agent_draft_id, pack_version)
);
CREATE INDEX idx_ags_cag_pack_status ON ags_cag_capability_packs(status);
CREATE INDEX idx_ags_cag_pack_ws_agent ON ags_cag_capability_packs(workspace_id, agent_id);

CREATE TABLE "ags_cag_pack_events" (
  id              serial PRIMARY KEY,
  workspace_id    integer NOT NULL,
  agent_draft_id  integer NOT NULL,
  pack_id         integer,
  event_type      varchar(50) NOT NULL,
  event_severity  varchar(20) NOT NULL DEFAULT 'info',
  reason          varchar(255),
  old_hash        varchar(128),
  new_hash        varchar(128),
  runtime_run_id  integer,
  actor_type      varchar(20),
  source_type     varchar(50),
  pack_version    integer,
  created_by      integer,
  created_at      timestamp NOT NULL DEFAULT now(),
  metadata_json   json
);
CREATE INDEX idx_ags_cag_events_draft ON ags_cag_pack_events(agent_draft_id, created_at DESC);
```

**Store API (no runtime injection yet):**
- `createPack(input)` — inserts; returns `{packId, version}`
- `getLatestPack(draftId)` → `Pack | null`
- `listPacks(draftId)` → `Pack[]`
- `markPackStale(packId, reason)` — flips status, appends event
- `appendPackEvent(eventInput)` — for any caller

**Tests (P1A):**
- Round-trip: create → list → get latest → mark stale → event recorded
- Idempotent re-create with same hash: returns existing pack, no duplicate row
- Workspace isolation: pack from ws=2 not visible to ws=3 query

**Validation:** Migration applies cleanly on a fresh DB. `npx vitest run server/agent-studio/services/cag/` passes. No service.ts file in this phase imports MCP dispatcher or credential resolver.

**PR size:** ~600 lines code + tests.

---

### Phase 1B — CAG Builder, Validator, Renderer

**Branch:** `feat/rac-p1b-cag-builder`
**PR title:** `feat(agent-studio): CAG builder/validator/renderer (P1B)`
**Files:**
- `server/agent-studio/services/cag/builder.ts`
- `server/agent-studio/services/cag/validator.ts`
- `server/agent-studio/services/cag/renderer.ts`
- `server/agent-studio/services/cag/risk-classifier.ts` *(per D-TOOL-2: reads `riskClass` from MCP manifest, does NOT compute)*
- `server/agent-studio/services/cag/skill-tool-mapper.ts`

**Critical integration (per D-PRM-1):**
The renderer returns a `SystemPromptSection`, not a finished prompt:

```ts
export interface SystemPromptSection {
  id: "capability-pack";
  text: string;
  tokenEstimate: number;
  contentHash: string;  // input to D-PRM-5 cache key
  warnings: string[];
}
```

**Renderer rules (per D-PRM-2 §4 + D-PRM-4):**
- MUST NOT include a mission line (Collision A — draft mission wins)
- MUST include the six mandatory assertions from the roadmap
- MUST emit per-tool: `(name, riskClass from D-TOOL-1, summary, approval-required, sandbox-required)`
- MUST NOT emit raw input schema JSON or example invocations (D-TOOL-3)
- MUST stay within 2048 tokens (CAG_MAX_PROMPT_TOKENS, matches D-PRM-3 budget)

**Validator rejection list (per roadmap):**
- secrets, API keys, OAuth tokens, session credentials, provider credentials → reject. Reuse `FORBIDDEN_BINDING_KEYS` from `bindings.ts:132` as the seed list.
- live MCP outputs, tool execution results, RAG chunks, large documents → reject.
- workspace records, dynamic external state, personal data → reject.

**Tests:**
- Build pack from mocked Agent Studio config + mocked MCP snapshot → produces section
- Validator rejects secret-shaped fields (use `FORBIDDEN_BINDING_KEYS` test fixtures)
- Validator rejects RAG chunks (mock chunk with `content`+`embedding`+`source_chunk_id`)
- Renderer omits mission line (regression for Collision A)
- Renderer rejects raw schema JSON (regression for D-TOOL-3)
- Renderer includes all six mandatory assertions

**Validation:** Boundary check: no import from `server/agent-studio/services/mcp/dispatcher.ts` (or wherever the runtime callTool lives). No import from credential resolver.

**PR size:** ~800 lines code + tests.

---

### Phase 1C — CAG Resolver + Single Runtime Injection

**Branch:** `feat/rac-p1c-cag-resolver`
**PR title:** `feat(agent-studio): inject CAG via composeSystemPrompt (P1C)`
**Files:**
- `server/agent-studio/services/cag/resolver.ts`
- `server/agent-studio/services/runtime/system-prompt-composer.ts` *(D-PRM-1)*
- Edit: `server/agent-studio/chat-stream.ts` — replace string-concat system prompt with `await composeSystemPrompt({...})`
- Edit: `server/agent-studio/services/chat.ts` — same
- Edit: `server/agent-studio/services/test-run-binding.ts` — same

**This is the highest-risk PR in P1.** It changes the live chat path. Mitigations:
- Composer must produce byte-identical output to the previous string-concat when CAG mode = `disabled` (golden test).
- Default mode = `safe_degraded`, NOT `strict`. Existing agents without packs continue working.
- The three call sites must converge to the same composer call. No "interim" path that bypasses.

**Section assembly (per D-PRM-2):**
- Section 1 (identity), 2 (mission), 3 (agent-policy), 6 (runtime-policy) sourced from `ags_agent_drafts` columns.
- Section 4 (capability-pack) sourced from CAG resolver. NULL when mode=`disabled` or no fresh pack and mode=`safe_degraded`.
- Section 5 (retrieval-evidence) absent in P1C — placeholder NULL until P5 lands.

**SSE error contract:** When mode=`strict` and pack missing, emit `{type:"error", error:"...", code:"cag_required"}` exactly as `binding_required` is emitted today (precedent: `chat-stream.ts:599-606`).

**Tests:**
- Mode=`disabled` produces byte-equivalent prompt to pre-RAC code (golden snapshot)
- Mode=`safe_degraded` with no pack continues; emits `pack_missing` event; no error in chat
- Mode=`strict` with no pack returns `cag_required` error, message persisted
- Mode=`safe_degraded` with stale pack uses pack and emits `pack_stale` warning
- Tool execution still routes through dispatcher (regression: ensure no CAG path reaches `dispatchMcpToolCall`)

**Validation:** Live smoke test against Agent Studio Expert (agent_id=1) on dev DB; binding from PR #160's backfill must remain functional. No regression in pre-existing 10 ai-types failures.

**PR size:** ~700 lines code + tests.

---

### Phase 1D — Backend Preview APIs

**Branch:** `feat/rac-p1d-cag-preview-api`
**PR title:** `feat(agent-studio): CAG preview tRPC procedures (P1D)`
**Files:**
- `server/agent-studio/api/cag-router.ts` *(new)*
- Edit: `server/agent-studio/api/router.ts` — add `cag: cagRouter`
- Edit: `server/governance/action-key-map.ts` — register `agentStudio.cag.refreshPack` as governed
- Edit: `config/governance/platform_action_registry.yaml` — declare R2 risk

**Procedures:**
- `agentStudio.cag.listPacks(input: {agentId}) → Pack[]` — protected
- `agentStudio.cag.getLatestPack(input: {agentId}) → Pack | null` — protected
- `agentStudio.cag.previewInjectedContext(input: {agentId, mode}) → { sections, prompt, tokenEstimate, warnings }` — protected (calls composer dry-run)
- `agentStudio.cag.refreshPack(input: {agentId}) → {packId, version}` — **governed** (writes pack)
- `agentStudio.cag.listPackEvents(input: {agentId, limit}) → Event[]` — protected

**Validation:** Smoke test via curl against local dev. `previewInjectedContext` returns the same prompt that the live chat would build. No UI yet.

**PR size:** ~400 lines.

---

### Phase 1E — CAG Boundary Hardening + Tests

**Branch:** `test/rac-p1e-cag-boundaries`
**PR title:** `test(agent-studio): harden CAG boundaries + golden tests (P1E)`
**Files:**
- `scripts/check-cag-boundary.ts` *(new — symmetric with `check-provider-credential-resolver-boundary.ts`)*
- `tests/agent-studio/cag-boundaries.test.ts`
- Edit: `package.json` — add `check:cag-boundary` script and chain into `check`

**Boundary rules (enforced by AST scan):**
- No file under `server/agent-studio/services/cag/**` may `import` from:
  - `server/agent-studio/services/mcp/dispatcher.ts` (or live execution paths)
  - `server/provider-connections/internal/credential-resolver.ts`
  - `server/secrets/encryption.ts`
  - any RAG chunk store path (P0 audit names the actual paths)
- No file under `server/agent-studio/services/cag/**` may write or recompute `riskClass` (D-TOOL-5)
- The composer in `server/agent-studio/services/runtime/system-prompt-composer.ts` is the only file that imports both CAG resolver and (later) RAC assembler

**Golden tests:**
- Section order matches D-PRM-2 byte-for-byte
- Cache key (D-PRM-5) excludes `retrieval-evidence` block
- Two different evidence blocks produce same cache key

**Validation:** `pnpm check` passes including the new boundary check. Boundary check rejects an intentional violation in a temp branch (smoke).

**PR size:** ~500 lines.

---

### Phase 2 — RAC Source Registry

**Branch:** `feat/rac-p2-source-registry`
**PR title:** `feat(agent-studio): RAC source registry (P2)`
**Files:**
- `drizzle/0040_rac_source_registry.sql`
- `drizzle/meta/_journal.json` entry idx=40
- `drizzle/tables/agent-studio.ts` — append `agsRacProfiles`, `agsRacSources`, `agsRacPolicies`, `agsRacWorkspaceEmbeddingDefault`
- `server/agent-studio/services/rac/sources/types.ts`
- `server/agent-studio/services/rac/sources/store.ts`
- `server/agent-studio/api/rac-sources-router.ts`

**Schema highlights (the new bit beyond what's in the roadmap — per D-EMB-1):**

```sql
CREATE TABLE "ags_rac_sources" (
  id                                  serial PRIMARY KEY,
  workspace_id                        integer NOT NULL,
  profile_id                          integer NOT NULL REFERENCES ags_rac_profiles(id),
  source_type                         varchar(32) NOT NULL,  -- enum from roadmap
  owner_module                        varchar(32) NOT NULL,  -- 'agentStudio' | 'dataAnalysis' | ...
  external_ref_id                     varchar(255),
  enabled                             boolean NOT NULL DEFAULT true,
  priority                            integer NOT NULL DEFAULT 50,
  -- D-EMB-1 columns:
  embedding_provider_connection_id    integer,
  embedding_model_ref                 varchar(255),
  embedding_model_dim                 integer,
  embedding_model_version             varchar(64),
  embedding_model_pinned_at           timestamp,
  -- bookkeeping:
  created_by                          integer NOT NULL,
  created_at                          timestamp NOT NULL DEFAULT now(),
  updated_at                          timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "ags_rac_workspace_embedding_default" (
  workspace_id                        integer PRIMARY KEY,
  embedding_provider_connection_id    integer NOT NULL,
  embedding_model_ref                 varchar(255) NOT NULL,
  embedding_model_dim                 integer NOT NULL,
  created_by                          integer NOT NULL,
  updated_at                          timestamp NOT NULL DEFAULT now()
);
```

**Validation:** Source registry can hold a reference to a GraphRAG-owned source without copying any data from `ragdb`. Cross-module boundary check verifies no `ragdb` import in `server/agent-studio/services/rac/`.

**PR size:** ~700 lines.

---

### Phase 3 — Ingestion + Indexing Adapters

**Branch:** `feat/rac-p3-ingestion-adapters`
**PR title:** `feat(agent-studio): RAC ingestion + indexing adapters (P3)`
**Files:**
- `server/agent-studio/services/rac/ingestion/types.ts` — `RacIngestionAdapter` interface
- `server/agent-studio/services/rac/ingestion/graphrag-adapter.ts` — wraps `dataAnalysis.graphrag.retrieve` for read; ingestion proxied to Data Analysis or stub
- `server/agent-studio/services/rac/ingestion/local-pgvector-adapter.ts` — ONLY if P0.5 chose pgvector
- `server/provider-connections/internal/credential-resolver.ts` — extend with `withEmbeddingCredential` (D-EMB-2)
- Edit: `scripts/check-provider-credential-resolver-boundary.ts` — add `server/agent-studio/services/rac/ingestion/**` to allowlist
- `server/agent-studio/api/rac-ingestion-router.ts` — `ingestPreview`, `registerIndexedSource`, `validateIndex`

**Tests:**
- Ingestion uses workspace embedding default when source row has NULL embedding ref
- Ingestion fails closed when no embedding provider available (D-EMB-5: NO silent fallback)
- Boundary check still passes after credential resolver extension

**PR size:** ~900 lines.

---

### Phase 4 — RAC Retrieval Pipeline

**Branch:** `feat/rac-p4-retrieval`
**PR title:** `feat(agent-studio): RAC retrieval planner/executor/filter (P4)`
**Files:**
- `server/agent-studio/services/rac/retrieval-planner.ts`
- `server/agent-studio/services/rac/retrieval-executor.ts`
- `server/agent-studio/services/rac/retrieval-filter.ts`
- `server/agent-studio/services/rac/retrieval/index.ts`

**Quality filtering uses P0.5 defaults** (`minScore`, `maxChunks`, `dedupeBy`, `freshnessMaxAgeDays`). Configurable per-profile.

**Latency target measurement:** Executor records start/end timestamp; passes to P7 trace. The SLO from P0.5 is enforced as a *warning* in P7 (not blocking), promoted to a *hard timeout* (default 3s) at P6 runtime integration.

**Tests:**
- Planner respects `priority` ordering on sources
- Filter dedupes by hash
- Filter rejects below-threshold chunks
- Citation-required filter drops chunks without citation metadata

**PR size:** ~700 lines.

---

### Phase 5 — RAC Context Assembler

**Branch:** `feat/rac-p5-assembler`
**PR title:** `feat(agent-studio): RAC context assembler + composer integration (P5)`
**Files:**
- `server/agent-studio/services/rac/context-assembler.ts`
- Edit: `server/agent-studio/services/runtime/system-prompt-composer.ts` — accept `retrievalEvidence: SystemPromptSection | null` and emit it as section 5 (D-PRM-2)

**The assembler returns `SystemPromptSection[]`** (per D-PRM-1), not a finished prompt. Each retrieval block becomes one section line within the `retrieval-evidence` section.

**D-PRM-5 cache key:** verified by golden test that swapping evidence blocks doesn't change the prefix hash.

**Tests:**
- CAG output and retrieval evidence are clearly separated (same agent, two distinct sections)
- Citations preserved through assembler
- Token budget respected per D-PRM-3 (1536 cap on retrieval-evidence)

**PR size:** ~500 lines.

---

### Phase 6 — Full Runtime Integration

**Branch:** `feat/rac-p6-runtime`
**PR title:** `feat(agent-studio): RAC retrieval in chat runtime (P6)`
**Files:**
- Edit: `server/agent-studio/chat-stream.ts` — call retrieval planner/executor/filter/assembler before composer
- Edit: `server/agent-studio/services/chat.ts` — same
- Edit: `server/agent-studio/services/test-run-binding.ts` — same

**Runtime order (locked):**

```
binding resolved (existing) →
CAG resolver (P1C) →
RAC profile resolved →
retrieval planned (P4) →
retrieval executed (P4) →
retrieval filtered (P4) →
context assembled (P5) →
composeSystemPrompt(D-PRM-1) →
Model Access (existing) →
MCP dispatcher (existing) →
trace stored (P7)
```

**Hard timeout:** retrieval has a 3s default budget (P0.5). On timeout, mode=`safe_degraded` continues with empty retrieval-evidence section + warning. mode=`strict` returns `retrieval_timeout` error.

**Validation:** Full E2E smoke against Agent Studio Expert: chat with retrieval enabled returns a response that includes a citation block; trace records the latency.

**PR size:** ~600 lines.

---

### Phase 7 — Trace, Observability, Feedback

**Branch:** `feat/rac-p7-trace`
**PR title:** `feat(agent-studio): RAC runtime trace + feedback (P7)`
**Files:**
- `drizzle/0041_rac_trace.sql` — `ags_rac_runtime_traces`, `ags_rac_context_blocks`, `ags_rac_feedback`
- `drizzle/meta/_journal.json` entry idx=41
- `server/agent-studio/services/rac/trace/store.ts`
- `server/agent-studio/api/rac-trace-router.ts` — `getTrace`, `submitFeedback`
- Edit: `server/agent-studio/chat-stream.ts` — write trace at end of stream
- `client/src/modules/agent-studio/components/RacTraceDrawer.tsx` *(MVP)*

**Metrics emitted:**
- retrieval_latency_ms (per-source breakdown)
- chunks_returned / chunks_filtered / chunks_included
- citation_coverage (% of model output spans with citations)
- groundedness_score (P8 may overwrite asynchronously)
- token_budget_used / token_budget_truncated
- mode (`disabled` / `safe_degraded` / `strict`)
- fallback_reason (NULL when no fallback)

**Feedback model:** `thumbs_up`, `thumbs_down`, optional `note`, `messageId` ref.

**PR size:** ~900 lines.

---

### Phase 8 — Evaluation

**Branch:** `feat/rac-p8-evaluation`
**PR title:** `feat(agent-studio): RAC evaluation actions (P8)`
**Files:**
- `server/agent-studio/services/rac/evaluation/groundedness.ts`
- `server/agent-studio/services/rac/evaluation/relevance.ts`
- `server/agent-studio/services/rac/evaluation/recall-mrr.ts` *(only if fixture exists)*
- `server/agent-studio/api/rac-evaluation-router.ts` — `evaluate`, `previewRetrieval`, `runGroundednessCheck`

**Note:** Recall@k and MRR require a labeled fixture. P8 ships with a minimal fixture (5–10 questions) for the `christmas-carol` and `alice-wonderland` sample datasets that the boot log shows are seeded. Real evaluation lands when real corpora are registered.

**PR size:** ~700 lines.

---

### Phase 9 — Sandbox Gate

**Branch:** `feat/rac-p9-sandbox-gate`
**PR title:** `feat(agent-studio): sandbox dispatcher gate + impl (P9)`
**Files:**
- `server/agent-studio/services/sandbox/types.ts` — adapter interface
- `server/agent-studio/services/sandbox/<chosen-impl>.ts` — concrete impl per P0.6 decision
- Edit: `server/agent-studio/services/mcp/dispatcher.ts` — route `riskClass="code_execution"` through sandbox (D-SBX-3)
- `tests/agent-studio/sandbox-gate.test.ts`

**This is the second-highest-risk PR.** Sandbox failure modes must surface clearly. Test mode must run real sandbox (D-SBX-4).

**PR size:** ~800 lines (impl-dependent).

---

### Phase 10 — Export Readiness

**Branch:** `feat/rac-p10-export-readiness`
**PR title:** `feat(agent-studio): RAC readiness on export candidates (P10)`
**Files:**
- Edit: `server/agent-studio/services/export-catalog/*` — add RAC fields per roadmap
- Edit: `drizzle/...` — schema delta on candidate side or new side table (P10 PR picks)
- Edit: AI Types catalog import wizard (`client/src/components/CatalogImportWizard.tsx`) — surface `racStatus` badge

**Hard-block matrix per D-TOOL-4 + D-SBX-2:** code_execution without sandbox = `racStatus="blocked"`, hard. Other risk classes downgrade to `degraded`.

**PR size:** ~600 lines.

---

### Phase 11 — RAC UI

**Branch:** `feat/rac-p11-ui`
**PR title:** `feat(agent-studio): RAC configuration + observability UI (P11)`
**Files:**
- `client/src/modules/agent-studio/pages/RacPage.tsx`
- `client/src/modules/agent-studio/components/CagPackPanel.tsx`
- `client/src/modules/agent-studio/components/RacSourcesPanel.tsx`
- `client/src/modules/agent-studio/components/RacRetrievalPolicyPanel.tsx`
- `client/src/modules/agent-studio/components/RacEvaluationPanel.tsx`
- `client/src/modules/agent-studio/components/RacTracesPanel.tsx`
- Edit: `client/src/App.tsx` — add `/agent-studio/:agentId/rac` route

**Validation:** Manual UI smoke per CLAUDE.md UI testing rule. Type checking + tests cannot replace.

**PR size:** ~1500–2000 lines (UI is bulky).

---

### Phase 12 — Rollout Readiness

**Branch:** `docs/rac-p12-rollout`
**PR title:** `docs(agent-studio): RAC rollout + vendor lock-in + ops (P12)`
**Files:**
- `docs/architecture/agent-studio/RAC_ROLLOUT_PLAN.md`
- `docs/architecture/agent-studio/RAC_VENDOR_LOCKIN_ASSESSMENT.md`
- `docs/architecture/agent-studio/RAC_RESOURCE_ESTIMATE.md` *(updated with actuals from P0–P11)*

**PR size:** ~600 lines markdown.

---

## 3. Cross-cutting rules (apply to every code-bearing phase)

### 3.1 Migration journal discipline

Every new SQL migration MUST:
1. Land at `drizzle/000N_*.sql`
2. Append a journal entry to `drizzle/meta/_journal.json` with `idx=N`, `tag="000N_*"`, `breakpoints=true`, and `when` strictly greater than the previous entry's `when`.
3. Be idempotent in spirit (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) to survive re-runs against partially-migrated DBs.

The dev-DB jam (resolved by manually applying 0038 + backfilling journal) is a permanent risk if these rules slip. P0 audit must verify the local journal is consistent before P1A starts.

### 3.2 Governed mutations require evidence

Any new tRPC procedure that mutates state and is registered in `platform_action_registry.yaml` MUST accept and forward the `_evidence` payload through the `governedProcedure` middleware. Tests must call with evidence:

```ts
caller.someAction({ ..., _evidence: { types: ["reason"], refs: [{ type: "reason", value: "test" }] } });
```

### 3.3 Boundary check additions

Every code-bearing phase that adds a new module under `server/agent-studio/services/` MUST update at least one boundary check script. The full inventory:
- P1B → CAG must not import dispatcher/resolver/secrets
- P3 → ingestion is on the credential-resolver allowlist (not a violation)
- P4 → retrieval must call only public Module Gateway contracts for cross-module sources
- P9 → sandbox is the only consumer of `code_execution` tools

### 3.4 Squash-merge convention

- Branch-per-PR
- Squash-merge with the title equal to the PR title
- Co-Authored-By trailer on every commit
- Delete branch after merge

### 3.5 Pre-existing red CI handling

The 10 `tests/integration/ai-types/execution{,-observability}.test.ts` failures are unrelated to RAC paths. Merge through them when RAC PRs don't touch those files. Each PR description must explicitly note the failure is pre-existing and unaffected.

---

## 4. Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| MCP capability snapshot doesn't exist as a stable read | M | H | Stop in P0; write `MCP_SNAPSHOT_GAP_REPORT.md`; add a snapshot phase before P1B |
| GraphRAG public retrieval contract is incomplete | M | H | Adapter contract in P0.5; defer real corpus registration until contract lands |
| Sandbox choice introduces a heavy CI dependency | M | M | P0.6 selects an impl that runs in the existing GHA runner without new infra; defer external sandboxes to a later phase |
| Composer regression: prompt drift on existing agents | L | H | P1C golden test: mode=`disabled` byte-equivalent to current code |
| Embedding model dim drift across providers breaks search | L | H | D-EMB-3 freezes dim at ingest; mismatch at query is hard error |
| Migration jam recurs on a fresh box | L | M | P0 audit verifies journal; cross-cutting rule 3.1; P12 ops doc records the recovery procedure |
| Pre-existing red CI absorbs a real new red signal | L | M | Each RAC PR explicitly lists the 10 known failures by name in its PR body; any 11th failure halts merge |
| RAC adds prompt cost the user didn't sign up for | M | M | D-PRM-3 hard cap (6144); P7 trace surfaces tokens used; P11 UI shows budget |

---

## 5. Stop conditions (halt and ask)

Halt the autonomous run and surface to the user when:
- P0 audit finds an architectural assumption in the pre-bundle DRs that doesn't match repo reality.
- A schema migration fails on the dev DB and rolling forward isn't safe.
- A new test failure appears that isn't in the known pre-existing 10.
- A boundary check rejects a planned PR's structure (rethink before forcing).
- Sandbox impl chosen in P0.6 turns out not to run in CI (this only surfaces in P9 — re-decide before merging P9).

---

## 6. Resource calibration

The roadmap's headline estimate (4–6 PRs for CAG, 6–10 PRs for retrieval, 6–10 for obs/eval/UI/gov) understates the real cadence on this repo. Actual estimate based on Direction B (8 PRs for one ingestion path) and Plan v3 (multi-week for binding alone):

| Track | Roadmap | Realistic |
| --- | --- | --- |
| P0 / P0.5 / P0.6 docs | 3 PRs | 3 PRs (matches; pre-bundle covered most) |
| P1A–P1E CAG MVP | 4–6 PRs | 5 PRs, 2–3 weeks |
| P2–P6 retrieval pipeline | 6–10 PRs | 5 PRs, 4–6 weeks |
| P7–P10 obs/eval/sandbox/export | 6–10 PRs | 4 PRs, 4–5 weeks |
| P11 UI | 1 PR | 1–2 PRs, 1–2 weeks |
| P12 docs | 1 PR | 1 PR |
| **Total** | **18 PRs** | **~19 PRs, 12–18 weeks** |

The roadmap PR count is roughly right; the timeline is roughly half what it should be on a single-engineer cadence in this repo.

---

## 7. Day-1 next actions (if user accepts this plan)

1. Open PR P0: audit the inspect targets and write `RAC_NATIVE_ARCHITECTURE.md` + `RAC_REPO_REALITY_MAP.md`. Stop conditions if MCP snapshot or GraphRAG contract gaps appear.
2. In parallel, open PR P0.5: `RAC_RETRIEVAL_FOUNDATION_DECISION.md` filling in the chunking/index/quality decisions. Cross-references D-EMB.
3. In parallel, open PR P0.6: `RAC_SANDBOX_IMPLEMENTATION_DECISION.md` picking the sandbox impl. Constrains P9.
4. After all three land: P1A schema PR. After P1A: P1B builder. After P1B: P1C resolver. P1D and P1E can interleave with P1C.

Each PR follows §3 cross-cutting rules. CI-green-or-pre-existing-red is the merge gate.

---

## 8. Acceptance of this execution plan

- All four pre-bundle DRs cited and integrated.
- Every phase has a branch, PR title, file list, validation gate.
- Cross-cutting rules cover migration journal, governance evidence, boundary checks.
- Risk register names known failure modes with mitigations.
- Resource estimate calibrated against Direction B / Plan v3 actuals.
- Day-1 actions are concrete enough that an engineer can start P0 immediately.
