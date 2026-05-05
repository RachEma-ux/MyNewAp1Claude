# RAC Native Architecture — Agent Studio

**Owner:** Agent Studio module
**Phase:** P0 (anchor for all later RAC phases)
**Status:** Adopted (this PR)
**Authority:** Pre-bundle DRs (PR #161) — D-TOOL/D-EMB/D-SBX/D-PRM; Execution Plan (PR #162); Audit findings in `docs/evidence/agent-studio-rac/RAC_REPO_REALITY_MAP.md`

---

## 1. Canonical framing (locked)

`RAC = Retrieval-Augmented Context.` Inside Agent Studio, RAC is the **full runtime context system** for agents. Its parts:

```
Agent Studio RAC
├── CAG capability packs            (P1)
├── Source ingestion / source refs  (P2, P3)
├── Chunking / embedding / index    (P0.5, P3)
├── Retrieval planner               (P4)
├── Retrieval quality filtering     (P4)
├── Context assembler               (P5)
├── Tool/code execution safety      (P0.6, P9)
├── RAC runtime trace               (P7)
├── Evaluation / feedback / metrics (P7, P8)
└── Governance/export readiness     (P10)
```

CAG is a *part* of RAC, not a parallel system. CAG teaches the agent how to work; RAG/GraphRAG provides factual evidence; Memory provides retained context; MCP executes tools through the dispatcher; Sandboxing controls risky execution; Governance decides what is allowed; OpenRouter Model Access calls the model. RAC assembles, traces, evaluates, and governs the final runtime context.

---

## 2. Layer separation (do not violate)

| Layer | Does | Does NOT |
| --- | --- | --- |
| CAG | Stable capability summary into prompt | Execute tools, retrieve evidence, store secrets, copy RAG chunks |
| RAG / GraphRAG | Provide factual evidence with citations | Decide what tools to use, mutate state |
| Memory | Persist retained agent context (`ags_runtime_memory_events`) | Replace authoritative records |
| MCP dispatcher | Execute tool calls (live) | Be bypassed by CAG/RAC |
| Sandbox | Wrap `code_execution` tool calls | Become a parallel runtime path |
| Governance | Authorize / receipt / approve | Be bypassed by RAC context bloat |
| OpenRouter Model Access | Call the LLM, hold credentials | Be invoked outside sealed Module Gateway |
| RAC | Assemble + filter + trace context | Execute tools, write to private module DBs |

These rules are enforced by boundary checks (`scripts/check-*.ts`). New checks land per `RAC_EXECUTION_PLAN.md` §3.3.

---

## 3. Anchored to repo reality (audited 2026-05-05)

The audit at `docs/evidence/agent-studio-rac/RAC_REPO_REALITY_MAP.md` confirms:

### 3.1 What exists (RAC builds on these)

- **Stable MCP capability snapshot** — `server/agent-studio/services/mcp/registry.ts:91` (`getSnapshot(serverId)` returning `{tools, prompts, resources}`). P1B reads this; **no `MCP_SNAPSHOT_GAP_REPORT.md` needed.**
- **Provider/model binding (Phase 27.3)** — `server/agent-studio/bindings.ts`, table `ags_agent_provider_bindings`, role=`primary`, status=`binding_v1`. RAC reuses; embeddings get a separate path per D-EMB-1.
- **Module Gateway** — `server/platform/modules/module-gateway.ts:84` `gatewayCall<I,O>`. All cross-module RAC calls go through this.
- **MCP dispatcher** — tool execution stays here (P9 wraps it for `code_execution` tools per D-SBX-3).
- **Skills (static manifests)** — `ags_draft_skills` (per-draft) and `ags_catalog_skills` (global catalog). P1B reads, never writes.
- **Memory event log** — `ags_runtime_memory_events`, append-only. RAC reads via memory adapter (P5 source type).
- **Documents/RAG infra** — `server/documents/`, `server/embeddings/`, `server/vectordb/qdrant-service.ts`. Separate module surface; RAC accesses via public contracts only.
- **Governance + action key map** — `server/governance/action-key-map.ts`. New RAC actions register here per cross-cutting rule §3.2.
- **Export Catalog** — `server/agent-studio/services/export-catalog.ts`. P10 extends candidate fields with RAC readiness.

### 3.2 What is missing (RAC adapts around these)

- **No centralized system-prompt composer.** `chat-stream.ts:640-643` and `services/chat.ts:651-654` each duplicate `systemInstructions + roleInstructions` concat. P1C introduces `composeSystemPrompt` (D-PRM-1) and converges both call sites.
- **No public Data Analysis / GraphRAG retrieval contract.** GraphRAG runs as an external worker; no synchronous gateway action exists. Documented separately at `docs/evidence/agent-studio-rac/GRAPHRAG_CONTRACT_GAP_REPORT.md`. P0.5 picks the adapter-first strategy. **P3 ingestion proceeds with an adapter contract; P4 retrieval falls back to local-pgvector when GraphRAG contract isn't reachable.**
- **No sandbox infrastructure.** Greenfield for P9. P0.6 picks `node:vm`-based sandbox (impl in P9).

### 3.3 Schema landing zone

- **ASDB owns RAC tables.** All `ags_*` tables live in ASDB (`postgres://...:5432/asdb`). RAC schema additions go in `drizzle/tables/agent-studio.ts`.
- **42 ASDB tables exist today.** RAC adds: `ags_cag_capability_packs`, `ags_cag_pack_events` (P1A); `ags_rac_profiles`, `ags_rac_sources`, `ags_rac_policies`, `ags_rac_workspace_embedding_default` (P2); `ags_rac_runtime_traces`, `ags_rac_context_blocks`, `ags_rac_feedback` (P7).
- **Migration journal next slot:** `0039_*.sql` with `when > 1779494400000` (rule §3.1).

---

## 4. Runtime order (locked)

The P6 runtime integration locks this sequence — every chat call goes through it, and no shortcut path may exist:

```
1. binding resolved (existing path; chat-stream.ts:593-609)
2. CAG resolver (P1C) — fresh pack or safe_degraded
3. RAC profile resolved — sources for this agent
4. retrieval planned (P4) — sources × policy → query plan
5. retrieval executed (P4) — parallel calls to source adapters
6. retrieval filtered (P4) — score, dedupe, citation, freshness
7. context assembled (P5) — SystemPromptSection[]
8. composeSystemPrompt (D-PRM-1) — single composer
9. Model Access (existing) — openRouter.modelAccess.execute via Module Gateway
10. MCP dispatcher (existing; P9-wrapped for code_execution tools)
11. trace stored (P7) — ags_rac_runtime_traces row written at stream end
```

`safe_degraded` mode permits steps 2–7 to fail individually (recorded as warnings). `strict` mode fails fast with a structured SSE error code per D-PRM-6. `disabled` mode bypasses 2–7 entirely (composer behaves as today).

---

## 5. Required decisions answered (per prompt)

| Question | Answer |
| --- | --- |
| Where is the primary RAC injection point? | The single `composeSystemPrompt` introduced in P1C at `server/agent-studio/services/runtime/system-prompt-composer.ts`. Replaces the duplicated assembly at `chat-stream.ts:640-643` and `services/chat.ts:651-654`. |
| Where is the stable MCP capability snapshot? | `server/agent-studio/services/mcp/registry.ts:91` — `getSnapshot(serverId): RegistrySnapshot \| undefined`. |
| Where are skills represented? | `ags_draft_skills` (per-draft, lines 682–712 of `drizzle/tables/agent-studio.ts`) + `ags_catalog_skills` (global, lines 964–1002). Static manifests, no live computation. |
| Where is memory represented? | `ags_runtime_memory_events` (lines 514–527). Append-only event log. |
| Where are document/RAG sources represented? | `server/documents/`, `server/embeddings/`, `server/vectordb/qdrant-service.ts`. Public surface via HTTP routers. |
| Which retrieval engines exist? | Qdrant (vector DB) is wired for documents. GraphRAG worker exists but exposes no synchronous public contract (gap report). |
| Which sandbox/tool execution paths exist? | None. Greenfield for P9. |
| Which runtime path gets CAG first? | Binding-driven Agent Studio chat via `chat-stream.ts` (the path that calls `openRouter.modelAccess.execute` after `getAgentProviderBinding`). |
| Which runtime paths are excluded until later? | Simulation runs (`agsSimulationRuns`); legacy non-Agent-Studio chat; automation/workflow runs; streaming variants that don't share the binding-driven prompt builder. |

---

## 6. What does NOT change

These are non-goals for RAC. Anyone trying to "improve" them as part of an RAC PR is out of scope:

- The Module Gateway sealed-context contract (Plan v3 D2) — RAC consumes it as-is.
- The `binding_v1` chat binding contract (Phase 27.3) — RAC adds an embedding role on a separate row, not an additional column on this table.
- The MCP dispatcher's tool execution path — P9 wraps `code_execution` tools, otherwise unchanged.
- OpenRouter Model Access — RAC produces the prompt; Model Access still owns the call.
- Governance Engine (CGT v2) — RAC respects governed actions; doesn't replace them.
- AI Types catalog ownership — RAC produces export-readiness signals; AI Types reads them via the existing import contract.

---

## 7. Stop conditions (still load-bearing)

From `RAC_EXECUTION_PLAN.md` §5, restated for visibility:

- P0 audit finds an architectural assumption in the four pre-bundle DRs that doesn't match repo reality — **HALT**.
- A schema migration fails on the dev DB and rolling forward isn't safe — **HALT**.
- A new test failure appears outside the known 10 pre-existing ai-types execution failures — **HALT**.
- A boundary check rejects a planned PR's structure — **HALT, redesign**.
- Sandbox impl chosen in P0.6 cannot run in CI — **HALT, re-decide before merging P9**.

P0 found one new condition: **GraphRAG public retrieval contract is missing**. Per execution plan §0, this does not halt RAC; P2 proceeds with refs only, P3 ingestion uses adapter contract, P4 retrieval has a local-pgvector fallback. The gap is recorded at `docs/evidence/agent-studio-rac/GRAPHRAG_CONTRACT_GAP_REPORT.md` and ownership is assigned for follow-up.

---

## 8. Where to look first

| Need to know | File |
| --- | --- |
| Current chat runtime | `server/agent-studio/chat-stream.ts:560-680` |
| Binding resolution | `server/agent-studio/bindings.ts` |
| MCP snapshot | `server/agent-studio/services/mcp/registry.ts` |
| Module Gateway contract | `server/platform/modules/module-gateway.ts` |
| ASDB schema | `drizzle/tables/agent-studio.ts` |
| Migration journal | `drizzle/meta/_journal.json` (last idx=38, when=1779494400000) |
| Pre-bundle DRs | `docs/architecture/agent-studio/RAC_*.md` (4 files) |
| Execution plan | `docs/architecture/agent-studio/RAC_EXECUTION_PLAN.md` |
| Audit | `docs/evidence/agent-studio-rac/RAC_REPO_REALITY_MAP.md` |
| GraphRAG gap | `docs/evidence/agent-studio-rac/GRAPHRAG_CONTRACT_GAP_REPORT.md` |
