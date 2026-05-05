# RAC Repo Reality Map

**Purpose:** Authoritative facts for RAC implementation. Answers what's in the repo, where, and what's missing.
**Method:** Code inspection of `server/agent-studio/`, `drizzle/tables/`, `server/data-analysis/`, `server/secrets/`, `tests/pmb/`, `scripts/`.
**Anchored to:** main @ `2390cb9` on 2026-05-05.
**Scope:** Read-only audit. No "should" statements; only "is."

---

## A. System-prompt assembly today

| File | Lines | What it does |
| --- | --- | --- |
| `server/agent-studio/chat-stream.ts` | 640–643 | `const systemPrompt = [draft.systemInstructions, draft.roleInstructions].filter(Boolean).join("\n\n") \|\| "You are a helpful assistant.";` (paraphrased) |
| `server/agent-studio/services/chat.ts` | 651–654 | Identical pattern in `runChatBindingDriven` |
| `server/agent-studio/services/test-run-binding.ts` | 157–158 | Accepts optional `systemPrompt` input; pushes `{role:"system", content:systemPrompt}` if provided. No draft-level default. |

**Source columns** (`ags_agent_drafts`): `system_instructions` (text, nullable), `role_instructions` (text, nullable), `policy_instructions` (text, nullable), `mission` (text, nullable). The current code reads only the first two of these four.

**No helper exists.** No file in the repo defines `buildSystemPrompt`, `assembleSystemPrompt`, or similar. Each call site duplicates the concat.

**RAC consequence (P1C):** The composer at `server/agent-studio/services/runtime/system-prompt-composer.ts` becomes the single writer. All three call sites converge on it. D-PRM-1 is satisfied by introducing this file.

---

## B. MCP capability snapshot

**Snapshot exists** at `server/agent-studio/services/mcp/registry.ts:91`:

```ts
export function getSnapshot(serverId: number): RegistrySnapshot | undefined
```

`RegistrySnapshot` carries:
- `tools: ReadonlyArray<McpTool>` — `{ name, description?, inputSchema }`
- `prompts: ReadonlyArray<McpPrompt>`
- `resources: ReadonlyArray<McpResource>`

Snapshot is published synchronously at MCP server connect time (lines 71–84). Chat paths (`chat-stream.ts:97-133`, `chat.ts:118-150`) already enumerate tools from the snapshot for tool-call exposure.

**Other MCP files in `server/agent-studio/services/mcp/`:**
- `dispatcher.ts` — `dispatchMcpToolCall` (live execution)
- `mcp-manager.ts` — connection lifecycle
- `studio-mcp-server.ts` — Agent Studio's own MCP server impl
- `auth.ts`, `state-machine.ts`, `types.ts`
- `transports/{http,sdk,sse,stdio,websocket}.ts`

**MCP_SNAPSHOT_GAP_REPORT.md not required.** Stop condition does not trigger.

**RAC consequence (P1B):** Builder reads `getSnapshot()` for tool list. Risk class (D-TOOL-1, D-TOOL-2) is NOT yet on the manifest entry — P0.6 baseline must classify the five built-in tools (calculator, current_time, text_analysis, json_parser, url_parser) as `read_only` and any auto-connected tools as `quarantined`.

---

## C. Skills — static manifests in two tables

**`ags_draft_skills`** (`drizzle/tables/agent-studio.ts` lines 682–712) — per-draft skill bindings.
- Fields: `draftId`, `packKey`, `skillKey`, `skillName`, `allowedTools`, `blockedTools`, `requiresApproval`, `argsSchema`.

**`ags_catalog_skills`** (lines 964–1002) — global skill catalog.
- Fields: `packKey`, `skillKey`, `name`, `description`, `context` ("inline" | "fork"), `agent`, `model`, `allowedTools`, `argNames`, `effort`, `body` (markdown), `source` ("db" | "imported" | "vendored" | "marketplace" | "mcp_prompt").

**Service:** `server/agent-studio/services/catalog-skills.ts`.

**RAC consequence (P1B):** Renderer reads both tables to surface skill cards in the capability pack. Body content is included; secrets are not (skills carry no credential fields). `argsSchema` is summarized, not embedded raw (D-TOOL-3).

---

## D. Memory representation

**`ags_runtime_memory_events`** (`drizzle/tables/agent-studio.ts` lines 514–527) — **append-only event log**.

Fields: `id`, `runId`, `memoryType` (varchar 32), `operation` (varchar 32), `payload` (jsonb), `createdAt`. Index on `runId`.

**No dedicated memory service file.** `server/agent-studio/services/memory.ts` does not exist. The contract is event-shaped: store via INSERT, retrieve by ORDER BY createdAt.

**RAC consequence (P5 / P6):** Memory is one of the source types in the source registry (P2). The retrieval executor (P4) does not query memory directly; instead, an Agent Studio-internal memory adapter packages the latest N events for the `memory` source type. Memory chunks emit through the same `SystemPromptSection` shape as evidence, distinguished by `sourceType`.

---

## E. Documents / RAG / Vector infra

**`server/documents/`** files include `documents-router.ts`, `documents-crud-router.ts`, `processor.ts`, `chunking-service.ts`, `rag-pipeline.ts`, `db.ts`.

**`server/embeddings/`** files include `embedding-engine.ts`, `service.ts`, `embeddings-router.ts`.

**`server/vectordb/`** files include `qdrant-service.ts` (Qdrant wrapper), `reranking-service.ts`, `vectordb-router.ts`.

**Schema (main DB):** `documents`, `document_chunks` (referenced in CLAUDE.md). Chunks reference Qdrant vector IDs.

**Public surfaces:** HTTP routers at `/api/documents`, `/api/embeddings`, `/api/vectordb`. No tRPC routers identified for these surfaces; no Module Gateway action keys identified for cross-module retrieval into these stores.

**RAC consequence (P3 / P4):** RAC ingestion adapter for `document_collection` source type wraps these HTTP surfaces (or a future tRPC surface). Reads use the embedding pipeline already present; embedding model ref is pinned at the source row per D-EMB-1.

---

## F. GraphRAG / Data Analysis — public contract status

**Module:** `server/data-analysis/` — registered as `dataAnalysis` in `wiring-inventory.ts` line 64.

**Schema (`ragdb`):** `graphragSources`, `graphragSyncRuns`, `graphragIndexRuns`, `graphragQueryRuns`, `graphragArtifactRegistry` (referenced in `server/data-analysis/graphrag/service.ts`).

**Public API surface:** `server/data-analysis/public-api.ts` exports types (`GraphRagQueryMethod`, `DataAnalysisGraphRagQueryRunSummary`) but **no synchronous retrieval function**. The query runner (`runQueryJob`) is not exported through `public-api.ts` and is not registered as a Module Gateway action.

**Worker pattern:** GraphRAG runs as an external worker (the boot log mentioned `GRAPHRAG_WORKER_URL`-style integration). Communication is asynchronous job-shaped, not synchronous query-shaped.

**Status: GAP.** No `dataAnalysis.graphrag.retrieve` action key in `server/governance/action-key-map.ts`. Documented at `docs/evidence/agent-studio-rac/GRAPHRAG_CONTRACT_GAP_REPORT.md`.

**RAC consequence (P3, P4):** The GraphRAG ingestion adapter is implemented as an adapter-only contract. The `graphrag` source type registers in P2. Real wiring requires Data Analysis to expose a synchronous public retrieval action — when it does, the adapter swaps backends without touching the planner/executor. Until then, P4 retrieval over a `graphrag` source returns an empty result with a structured `source_unavailable` warning.

---

## G. Sandbox / code execution paths

**Greenfield.** No file under `server/sandbox*` (except `server/sandbox-wf/` which is the Workflow sandbox, unrelated). No VM, no isolation, no subprocess sandboxing for tool calls.

**Existing five built-in tools:** calculator, current_time, text_analysis, json_parser, url_parser. None execute arbitrary code — all are deterministic, hardcoded, no shell, no eval.

**Secret encryption** lives in `server/secrets/encryption.ts` (encrypt/decrypt only — not a sandbox).

**RAC consequence (P0.6, P9):** P0.6 picks `node:vm`-based sandbox impl. Until P9 lands, no `code_execution`-class tool may be classified per D-TOOL-1. The five built-ins are `read_only`. New MCP tools that auto-connect default to `quarantined` (D-TOOL-1).

---

## H. Module Gateway contract

**File:** `server/platform/modules/module-gateway.ts:84-100`

```ts
export async function gatewayCall<I = unknown, O = unknown>(
  call: GatewayCall<I, O>,
): Promise<O>
```

**`GatewayCall` shape:**
- `ctx: { sourceModule, targetModule, actionKey, actorId, workspaceId?, governanceReceiptId, correlationId }`
- `input: I`
- `options?: { timeoutMs?, retry? }`

**Action keys registered:** `server/governance/action-key-map.ts` enumerates all governed actions (200+ entries). Examples relevant to RAC:
- `agentStudio.chat.*`
- `agentStudio.exportCatalog.*`
- `openRouter.modelAccess.execute` / `.stream`
- `aiTypes.catalog.register`
- `catalogImport.importAgentStudioCandidate` / `reconcileAgentStudioSync`

**No** `dataAnalysis.graphrag.*` or `dataAnalysis.retrieval.*` action keys exist (gap, see §F).

**RAC consequence:** All cross-module RAC calls (e.g. retrieval into Data Analysis) must go through `gatewayCall` with a registered action key. New action keys land per cross-cutting rule §3.2 of the execution plan.

---

## I. Export Catalog integration

**Files in `server/agent-studio/services/`:**
- `export-catalog.ts` — service: `listExportCandidates`, `getExportCandidate`, `exportCandidate`, `markCandidateImported`, `reconcileCandidateImports`
- `export-catalog-lookups.ts` — DB query abstraction
- `export-catalog.test.ts` — tests

**Candidate shape (`shared/export-candidate.ts:64-100`):**
- Identity: `workspaceId`, `agentId`, `versionId`, `name`, `lifecycleState`
- Verdicts: `readiness`, `governance`
- Binding: `providerConnectionId`, `providerCatalogEntryId`, `modelCatalogEntryId`
- Capabilities: `capabilities` (string array)
- Source linkage: `sourceModule`, `sourceRefId`, `activeSourceVersionId`
- Status: `exportStatus` (`not_started` | `ready` | `exported` | `blocked` | `unresolved`)

**Eligibility gates (`server/agent-studio/services/export-eligibility.ts:22-32`):** 9 gates including `version_release`, `provider_binding_valid`, `provider_connection_active`, `model_approved`, `readiness_score_threshold`, `governance_verdict_acceptable`, `metadata_complete`, `not_already_imported`, `no_duplicate_canonical_entry`.

**RAC consequence (P10):** P10 adds RAC fields to the candidate shape (`racStatus`, `racProfileId`, `cagPackId`, `retrievalMode`, `citationScore`, `groundednessScore`, `retrievalLatencyMs`, `sandboxStatus`). New eligibility gates extend the existing list. Hard-block matrix per D-TOOL-4 and D-SBX-2.

---

## J. ASDB schema (42 tables)

`drizzle/tables/agent-studio.ts` defines 42 `ags_*` tables. Categories:

1. **Draft lifecycle:** `agsAgents`, `agsAgentDrafts`, `agsAgentVersions`, `agsAgentReleases`
2. **Bindings:** `agsDraftToolBindings`, `agsDraftKnowledgeBindings`, `agsDraftMemoryConfigs`, `agsAgentProviderBindings`
3. **Workflow:** `agsDraftWorkflowNodes`, `agsDraftWorkflowEdges`
4. **Test:** `agsSimulationScenarios`, `agsSimulationRuns`, `agsSimulationRunSteps`, `agsTestSuites`, `agsTestCases`, `agsTestRuns`, `agsTestRunResults`
5. **Runtime:** `agsRuntimeRuns`, `agsRuntimeRunSteps`, `agsRuntimeToolCalls`, `agsRuntimeMemoryEvents`, `agsRuntimePolicyEvents`, `agsRuntimeHookExecutions`
6. **Publish:** `agsPublishRequests`, `agsApprovalSteps`, `agsReleaseAuditRefs`
7. **Extensions:** `agsDraftHooks`, `agsDraftMcpServers`, `agsDraftSkills`, `agsDraftSubagents`, `agsDraftPlugins`, `agsDraftPermissionRules`
8. **Marketplace:** `agsMarketplaceItems`, `agsMarketplaceCollections`, `agsMarketplaceInstalls`
9. **Chat:** `agsChatSessions`, `agsChatMessages`
10. **Catalog:** `agsCatalogTools`, `agsCatalogSkills`
11. **Misc:** `agsMcpTransitions`, `agsCatalogSyncLog`

**Workspace isolation:** Most tables carry `workspaceId` directly; ownership tables (`agsAgents`) carry `ownerId` resolving to a workspace.

**Append-only:** `agsRuntimeMemoryEvents`, `agsRuntimePolicyEvents`, `agsRuntimeHookExecutions` are pure event logs.

**Unique constraints (sample):** `uniq_ags_agents_key` on `internalKey`; `uniq_ags_agent_provider_bindings_draft_role` on `(draftId, role)`.

**RAC tables to add:**
- P1A: `ags_cag_capability_packs`, `ags_cag_pack_events`
- P2: `ags_rac_profiles`, `ags_rac_sources`, `ags_rac_policies`, `ags_rac_workspace_embedding_default`
- P7: `ags_rac_runtime_traces`, `ags_rac_context_blocks`, `ags_rac_feedback`

---

## K. tests/pmb/ — boundary checks and invariants

**3 test files:**

- **`tests/pmb/boundary.test.ts`** — Phase 42 invariants (7 total):
  1. `ags_*` schema has no `apiKey`/`secret`/`password` columns
  2. Agent Studio does not write `catalog_entries` directly
  3. AI Types does not import Agent Studio internals
  4. AI Types does not query ASDB
  5. OpenRouter Model Access does not read `process.env.<X>_API_KEY`
  6. Provider Connections public API returns no secrets
  7. Cross-module frontend boundary
- **`tests/pmb/wiring.test.ts`** — Module wiring verification (gateway action registration, event subscription wiring, handoff acceptor registration)
- **`tests/pmb/runtime-coverage.test.ts`** — Runtime coverage assertions

**RAC consequence (every code-bearing PR):** Each RAC PR must keep `pnpm test tests/pmb/` green. P1E adds new boundary check `scripts/check-cag-boundary.ts`; subsequent phases add CAG/RAC-specific invariants if needed.

---

## L. Existing `scripts/check-*.ts` inventory

31 check scripts. Examples directly relevant to RAC:

| Script | Enforces |
| --- | --- |
| `check-provider-credential-resolver-boundary.ts` | Decision D2 — credential resolver imported only by `openRouter/model-access/*`. **P3 will extend the allowlist** (D-EMB-2 / `withEmbeddingCredential`). |
| `check-provider-key-env-boundary.ts` | Decision D5 — Model Access does not read raw env API keys. |
| `check-gateway-wiring.ts` | All `gatewayCall` matches a registered action. **Every new RAC gateway action must register before the calling code merges.** |
| `check-module-boundaries.ts` | Module private-internal isolation. |
| `check-governance-actions.ts` | All governance action keys mapped. |
| `check-handoff-wiring.ts` | Handoff subscriptions match emitter registrations. |
| `check-module-db-ownership.ts` | No cross-module DB writes. |
| `check-readiness-phase-gate.ts` | Phase 15 binding staleness rule. |
| `check-ai-types-public-api-boundary.ts` | AI Types public surface restrictions. |

**RAC consequence (P1E):** New script `scripts/check-cag-boundary.ts` lands, symmetric with `check-provider-credential-resolver-boundary.ts`. Boundaries enforced per D-TOOL-5, D-PRM-7, and the rules in `RAC_TOOL_CLASSIFICATION.md`.

---

## M. Migration journal state (verified)

**File:** `drizzle/meta/_journal.json`. Total entries: 38. Last entry:

```json
{
  "idx": 38,
  "version": "7",
  "when": 1779494400000,
  "tag": "0038_catalog_source_versioning",
  "breakpoints": true
}
```

**Disk SQL files:** 39 (0000 through 0038). 0039 slot is empty.

**Next migration must use:** `idx = 39`, `tag = "0039_*"`, `when > 1779494400000`. Per cross-cutting rule §3.1, migrations must be idempotent (`CREATE TABLE IF NOT EXISTS`).

**Local-DB note:** The dev DB on this device had a journal jam previously (resolved by manually applying 0038 + backfilling all 38 journal rows). The journal is now coherent locally; future migrations will apply cleanly. CI / GHA-built deployments do not have this history (they boot from clean DB).

---

## N. Notable absences (RAC implementation must address or work around)

| # | Absence | Phase that addresses it |
| --- | --- | --- |
| 1 | No centralized system-prompt composer | P1C |
| 2 | No per-tool risk class on the MCP manifest | P0.6 (decision) + retrofit during P1B |
| 3 | No public Data Analysis / GraphRAG retrieval contract | P3 adapter-only path; gap report tracks follow-up |
| 4 | No sandbox infrastructure | P0.6 (decision) + P9 (impl) |
| 5 | No memory adapter for prompt injection (memory events not yet packaged) | P5 (memory source type adapter) |
| 6 | No public tRPC surface for `documents` / `embeddings` (HTTP only) | Out of RAC scope; P3 wraps existing surfaces |
| 7 | No RAC trace tables | P7 |
| 8 | No RAC export readiness fields | P10 |

---

## O. RAC injection-point contract (for P1C)

The composer at `server/agent-studio/services/runtime/system-prompt-composer.ts` is the single writer of the final system prompt. Three call sites converge:

| Caller | Migration |
| --- | --- |
| `server/agent-studio/chat-stream.ts:640-643` | Replace concat with `await composeSystemPrompt({...})` |
| `server/agent-studio/services/chat.ts:651-654` | Same |
| `server/agent-studio/services/test-run-binding.ts:157-158` | Pass through `systemPrompt` input as a `manual_context` source |

After P1C, no other file in the repo composes the system prompt. P1E boundary check enforces this.

---

This map is the authoritative input for P0.5 (retrieval foundation), P0.6 (sandbox impl), and all P1+ phases.
