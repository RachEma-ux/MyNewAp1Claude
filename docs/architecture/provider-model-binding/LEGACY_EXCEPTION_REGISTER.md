# Legacy Exception Register — Provider/Model Binding

**Phase 0.3 deliverable.** Tracks every known violation of the Plan v3 boundaries that exists in `main` today, with an owner, a target migration phase, and a deadline. Without a deadline, "exception" silently becomes "exception forever" — see the existing 24 AI Types internals importers and three direct catalog writers as proof.

## Allowed status values

- `open` — exception exists, migration not started
- `in_progress` — migration PR opened or in flight
- `migrated` — replacement landed; exception closed
- `removed` — original code path deleted; exception closed
- `blocked` — migration blocked by an external dependency (must list the dependency)
- `expired` — deadline passed; **fails governance review** until reclassified

## Lifecycle rule

- Every `open` exception **must** have a `Deadline phase`.
- Every exception staying `open` past its deadline phase becomes `expired` automatically and **must fail** the next architecture/governance check run.
- `expired` is not an acceptable steady state; it forces a re-decision (extend deadline with renewed signoff, or migrate).
- Adding a new exception requires Governance signoff in the PR description.

---

## Register

Columns: `ID | Path | Owner | Current violation | Reason retained | Risk | Target replacement | Deadline phase | Deadline PR | Status | Reviewer`

### Phase 28 sub-phase mapping (CLOSED 2026-05-07)

| LR | Phase 28 sub-phase | Decision |
|---|---|---|
| LR-01 (simulation) | 28.6b primitive built ✓; 28.7 caller migration DEFERRED → Phase 29 | MIGRATE_TO_MODEL_ACCESS via `runViaOpenllmBridge` + `execute` (Phase 29) |
| LR-02 (embeddings) | 28.4 primitive built ✓; caller migration DEFERRED → Phase 29 | MIGRATE_TO_MODEL_ACCESS via `embed` (Phase 29) |
| LR-03 (documents) | DEFERRED → Phase 29 (closes transitively with LR-02) | MIGRATE_TO_MODEL_ACCESS via `embed` (Phase 29) |
| LR-04 (operators) | DEFERRED → Phase 29 (reclassified: chat-completion caller, uses existing `execute` primitive) | MIGRATE_TO_MODEL_ACCESS via `execute` (Phase 29) |
| LR-06 (autoProvisionProviders) | 28.2 (CLOSED, Scope A) | RETIRED — env read relocated to `seed-from-env.ts`; legacy `providers` table preserved for back-compat with three readers |
| LR-08 (chat-stream + executeInvokeAgent) | 28.3 (DEFERRED → Phase 29) | Scope discovery: routing-layer migration is a Phase 29-shaped piece of work; see `PHASE_29_EXECUTION_PLAN.md` |
| LR-09 (opencode subprocess env-write) | 28.1 (CLOSED) | ALREADY_FIXED by PR #100 (predates register); see `PHASE_28_OPENCODE_SUBPROCESS_DECISION.md` |

### Phase 29 sub-phase mapping (plan-frozen 2026-05-07)

The five Phase-29-deadline LRs are batched under `PHASE_29_EXECUTION_PLAN.md`. LR-01 ships first (29.0a) because it's independent of §29.1 workspace-default-binding; the other four queue behind §29.1.

| LR | Phase 29 sub-phase | Notes |
|---|---|---|
| LR-01 (simulation) | **29.0a CLOSED** — independent of §29.1 (`draft.id` already in scope) | Migrated; adapter files deleted; tripwire test added |
| LR-02 (embeddings) | 29.4 (after §29.1) | Singleton service; no workspace context |
| LR-03 (documents) | 29.4 (transitive with LR-02) | Closes when LR-02 closes |
| LR-04 (operators) | 29.5 (after §29.1) | `callProviderHub({operator,prompts})` — no workspace |
| LR-08 (chat-stream + executeInvokeAgent) | 29.6 (after §29.1 + §29.2/29.3 routing-layer rewrite) | `providerRouter` migration is the largest single Phase 29 piece |

### Runtime provider-key paths (D1 violations)

| ID | Path | Owner | Current violation | Reason retained | Risk | Target replacement | Deadline phase | Deadline PR | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|
| LR-01 | (was) `server/agent-studio/adapters/openllm-runtime-adapter.ts:312-321` | Agent Studio | (was) Reads `process.env[pc.apiKeyEnvVar]` for runtime provider auth. | **Phase 29.0a CLOSURE.** Simulation migrated onto Model Access: `runViaOpenllmBridge` (Phase 28.6b primitive) when MCP servers or permission rules are configured; `openRouter.modelAccess.execute` (gateway-call) otherwise. Adapter files deleted entirely (`openllm-runtime-adapter.ts` + `openai-direct-adapter.ts`). `resolveProviderApiKey`, `runViaOpenllmAgent`, `runViaOpenAIDirect`, `resolveOpenllmEndpoint` no longer exist anywhere in the codebase. New tripwire test in `tests/pmb/boundary.test.ts` asserts none of those identifiers are restored. | Closed (lint-fenced + tripwire-tested). | None — closed. | — | (this PR) | migrated | Reviewer + Governance |
| LR-02 | `server/embeddings/service.ts:54` | Embeddings | Reads `process.env.OPENAI_API_KEY` for embedding generation. | **Phase 28.4 status:** the `openRouter.modelAccess.embed` primitive was built and is ready. The caller migration is deferred to Phase 29 — `embeddings/service.ts` is a workspace-agnostic singleton (`generateEmbedding(text)` has no workspace context); migrating it requires the workspace-default-binding decision that Phase 29 owns. See `MODEL_ACCESS_EMBED_DECISION.md` and `PHASE_29_EXECUTION_PLAN.md` §29.1. | Medium — single hard-coded var, no per-draft indirection. | `openRouter.modelAccess.embed` (built in Phase 28.4) once Phase 29 ships workspace-default binding. | Phase 29 | TBD | open | Governance |
| LR-03 | `server/documents/processor.ts:339` | Documents | Reads `process.env.OPENAI_API_KEY` for document processing. | Same shape as LR-02; calls into `embeddings/service.ts` (`getEmbeddingService()`), so closes transitively when LR-02 closes. | Medium. | Closes when LR-02 closes. | Phase 29 | TBD | open | Governance |
| LR-04 | `server/operators/provider-hub.ts:78` | Operators | Reads `process.env.OPENAI_API_KEY` for operator runtime. | **Phase 28.4 reclassification:** this is actually a **chat-completion** caller (`/v1/chat/completions` with `gpt-4o-mini`), not an embedding caller. The Phase 27.4 matrix grouped it with LR-02/03 under "embedding-endpoint dependency" — that was wrong. LR-04 uses the existing `openRouter.modelAccess.execute` primitive in Phase 29 (alongside LR-08). The caller is workspace-agnostic (`callProviderHub({operator, prompts})` has no workspace context); migration requires workspace-default binding from Phase 29. | Medium. | `openRouter.modelAccess.execute` once Phase 29 ships workspace-default binding. | Phase 29 | TBD | open | Governance |
| LR-05 | `server/data-analysis/omnirag-adapter.ts:57` | Data Analysis | Reads `process.env.OMNIRAG_API_KEY`. | OmniRAG is a domain-specific service, not a Plan v3 provider. Phase 27.4 decision: NOT_APPLICABLE — D1 covers provider keys, not arbitrary service tokens. The `NON_PROVIDER_KEYS` set in `check-provider-key-env-boundary.ts` already exempts it. | Low — not a generic provider key. | None (permanent exemption per Phase 27.4). | — | — | migrated | Governance |
| LR-06 | (was) `server/_core/index.ts:120-140` | Platform | (was) `autoProvisionProviders()` reads provider env keys at boot. | **Phase 28.2 closure (Scope A):** boot block removed; env read relocated to `scripts/provider-connections/seed-from-env.ts`. Boundary lint allowlist for `_core/index.ts` purged; the script is allowlisted under the existing `<seed-script>` sentinel as the one legitimate env reader. Dev-mode boot logs a hint when env vars are present but providers table is empty. The "switch target table to `provider_connections`" piece was deferred (would require porting three legacy `providers`-table readers — `provider-sync.ts`, `web-instance-manager.ts`, `kgra-agent/nodes.ts`); the LR-06 D1 violation closes regardless because the env read is gone from runtime. | Closed (closed surface; lint-fenced). | None — closed. | — | (this PR) | migrated | Reviewer + Governance |
| LR-08 | `server/chat/stream.ts` (`/api/chat/stream`) and `server/automation/block-executors.ts:executeInvokeAgent` (202–270) | Chat + Automation | Both consume `getProviderRegistry()`. **Phase 28.3 scope discovery:** the register's prescribed fix materially underestimated the migration. `chat/stream.ts` has no `agentId`; the unified-routing path it uses (`server/inference/provider-router.ts:resolvePlan`) reads the registry at lines 17, 137, 205 — so the routing-layer infrastructure itself, not just the two named callers, must move onto Model Access. `executeInvokeAgent` operates on the legacy `agents` table, not `ags_agent_drafts`; `resolveForRun(legacyAgentId)` doesn't resolve. Full rationale: `docs/evidence/provider-model-binding/PHASE_28_LR_08_DEFERRAL_DECISION.md`. | **Phase 28.3 decision: DEFER to Phase 29.** Deadline rolls Phase 28 → Phase 29 (per the Phase 27.4 precedent: a deadline roll is not a new TEMPORARY_EXCEPTION). Phase 29 scope is captured in `PHASE_29_EXECUTION_PLAN.md`. | Medium — both paths are still active; neither is the PR-#100 incident shape. | Migrate the workspace-scoped routing layer (`provider-router.ts`) onto Model Access, then `chat-stream.ts` + `executeInvokeAgent` on top. Workspace-default-binding decision required. Legacy-`agents`-table support decision required. | Phase 29 | TBD | open | Reviewer + Governance |
| LR-09 | `server/code-studio/opencode/provider-sync.ts` (historical line 96) | Code Studio | (historical) Writes provider env vars (`process.env[envVar] = config.apiKey`) onto a spawned-subprocess environment. | **Phase 28.1 decision: ALREADY_FIXED.** The surface was eliminated by **PR #100** (`f824d8c`, merged 2026-05-04 13:39 UTC+02:00) — *seven hours before this register was created* in PR #104 (`5d7fd92`). Line 96 is now inside a comment block explaining the historical bug; the function writes to `~/.local/share/opencode/auth.json` instead. Boundary lint Rule 2 (`scripts/check-provider-key-env-boundary.ts:166-283`) detects `process.env[X] = ...` writes and emits an error message naming PR #100 — regression guard already in place. Full rationale: `docs/evidence/provider-model-binding/PHASE_28_OPENCODE_SUBPROCESS_DECISION.md`. | Low (closed surface; lint-fenced). | None — closed. | — | PR #100 (`f824d8c`) | migrated | Governance |

### AI Types public-API boundary violations (D-N/A — covered by Phase 26)

The 21 importers from `CURRENT_REALITY_MAP.md §4` are not enumerated row-by-row here. They are tracked in aggregate:

| ID | Path | Owner | Current violation | Reason retained | Risk | Target replacement | Deadline phase | Deadline PR | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|
| LA-01 | `server/db.ts:34` and `server/db/index.ts:19` and `server/db/catalog.ts:36` | Platform | Barrel re-exports of `ai-types/db` mean any code importing `server/db` reaches AI Types internals transitively. | Most load-bearing leak vector — many callers indirect through these. | High (transitive blast radius). | Phase 26 (this PR) added the `check:ai-types-public-api-boundary` lint with `server/db.ts`, `server/db/index.ts`, `server/db/catalog.ts` on the baseline allow-list. **Stripping** the re-exports + migrating transitive callers is the Phase 26.1 follow-up PR. The lint now blocks any NEW transitive caller. | Phase 26.1 (barrel-strip follow-up) | TBD | in_progress | Reviewer + Governance |
| LA-02 | 21 files baselined in `scripts/baseline/ai-types-public-api-boundary.txt` (the original 18 + `server/agents/executor.ts`, `server/agents/stream.ts`, `server/db.ts`, `server/platform/modules/module-routers.ts`) | Various | Direct imports from `ai-types/{db,service,service-runtime,execution,invoke,import-normalizer,projection,router,boot}`. | Each caller is a working flow. Bulk replacement requires the public API to actually expose what each caller needs. | Medium per-file, high in aggregate. | `aiTypes.*` gateway actions or barrel from `ai-types/public-api.ts`. Phase 26 lands the baseline-allow lint; Phase 26.1 migrates the callers. | Phase 26.1 (caller migration follow-up) | TBD | in_progress | Reviewer |

### Direct `catalog_entries` writers/readers outside AI Types (D-N/A — covered by Phase 25)

| ID | Path | Owner | Current violation | Reason retained | Risk | Target replacement | Deadline phase | Deadline PR | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|
| LC-01 | `server/catalog-import/router.ts:477,481` | Catalog Import | `db.select().from(catalogEntries).where(...)` direct read. | Catalog import is a legitimate caller of the catalog table; it predates the boundary rule. | Low (read-only). | `aiTypes.catalog.list` public action via gateway. Tracked in `CATALOG_WRITER_MIGRATION_MATRIX.md` (fate: MIGRATE_TO_PUBLIC_API_READ). | Phase 26 | TBD | open | Governance |
| LC-02 | `server/llm/authority.ts:87` | LLM Authority | Direct read of `catalogEntries` table. | Authority decisions need catalog facts. | Low. | `aiTypes.catalog.list` or `aiTypes.catalog.get`. Tracked in matrix (MIGRATE_TO_PUBLIC_API_READ). | Phase 26 | TBD | open | Governance |
| LC-03 | `server/llm/authority.ts:107` | LLM Authority | `tx.insert(catalogEntries).values(...)` — direct WRITE. | Authority writes a row when promoting an LLM. | High — direct write violates D8-equivalent for non-Agent-Studio modules. | `aiTypes.catalog.register` action (Phase 25 lands the action; caller migrates in Phase 26 alongside its read-side migration). Tracked in matrix (MIGRATE_TO_REGISTER). | Phase 26 | TBD | open | Reviewer + Governance |
| LC-04 | `server/routers/catalog-manage.ts` (multiple) | Catalog Manage | All writes go through `createCatalogEntry`/`updateCatalogEntry` from `ai-types/db.ts`. | Catalog Manage is the admin-edit tRPC surface for catalog entries. | None — header at lines 1-13 carries the AI Types governance contract; all writes delegate to the canonical service layer. Phase 25 audit confirmed no direct table writes. | Phase 25 LO-01 audit resolved: file is "AI Types admin surface in the wrong directory". File relocation to `server/ai-types/admin-router.ts` is a no-op refactor outside Plan v3. | Phase 25 (resolved) | PR #129 (LO-01 audit) | migrated | Reviewer + Governance |
| LC-05 | `server/routers/agents.ts:81` | Agents Router | `db.select({...}).from(catalogEntries).where(eq(entryType,"agent"))` in the `list` procedure. | Phase 25 verification: read-only fetch joining agent rows with their catalog entry. NO write found at this site (the historical "agentStudio.agent.publish writes catalog row" path was deleted in earlier phases). | Low (read-only). | `aiTypes.catalog.list({entryType:"agent"})`. Tracked in matrix (MIGRATE_TO_PUBLIC_API_READ). | Phase 26 | TBD | open | Reviewer |
| LC-06 | `server/kgra-agent/nodes.ts:66,69` | KGRA Agent | Raw SQL `db.execute(sql\`SELECT count(*) ... FROM catalog_entries\`)`. | KGRA aggregates catalog facts. | Low (read-only count). | `aiTypes.catalog.count` public action, or remove the read. Tracked in matrix (MIGRATE_TO_PUBLIC_API_READ). | Phase 26 | TBD | open | Governance |
| LC-07 | `server/automation/block-executors.ts:102` | Automation | Bare string `"catalog_entries"` in `ALLOWED_TABLES` — used for SQL identifier validation in a generic DB-block executor. | Phase 19 verified: SQL target whitelist for a power-user automation block, not a code path that READS catalog_entries. Phase 25 re-verification: same conclusion. | Low (whitelist entry, not an active read/write). | Documented as accepted catalog-touch-via-allowlist in the migration matrix. SELECT-only tightening is Stage 8 hardening, not a Plan v3 deliverable. | Phase 25 (resolved as accepted) | PR #129 (matrix) | migrated | Reviewer |
| LC-08 | `server/hq/router.ts:127` | HQ | Field name `catalogEntries:` in response shape. | Phase 25 inspection: data is fetched via public counters API, not a direct table read. False positive. | None. | None — documenting closure in the migration matrix. | Phase 25 (resolved) | PR #129 | removed | Reviewer |

### Agent Studio raw-key surface (D1 violations — schema-level)

| ID | Path | Owner | Current violation | Reason retained | Risk | Target replacement | Deadline phase | Deadline PR | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|
| LK-01 | `drizzle/tables/agent-studio.ts:119` | Agent Studio | `ags_agent_drafts.providerConfig` is an unconstrained `jsonb` blob — schema permits raw `apiKey`. | **Phase 27.2 forward-write closure:** `services/provider-config-guard.ts` strips `apiKey`, `api_key`, `apiKeyEnvVar`, `api_key_env_var` from any value passed through `repository.updateRuntimeConfig` and `repository.updateDraft`, with a console.warn that names the offending agentId/draftId/source. The migration apply path in `scripts/agent-studio/migrate-provider-config-to-bindings.ts` redacts existing rows and version snapshots. The schema column itself remains `jsonb` (typed-column tightening is out of Plan v3 scope). | Low — forward writes are guarded; existing rows redacted by migration. | None: forward-write guard is the long-term enforcement. The schema column remains `jsonb` by design. | Phase 27.2 (resolved by guard + migration apply) | Phase 27.2 | migrated | Reviewer + Governance |
| LK-02 | `server/agent-studio/db/seed-legacy-fixtures.ts:36-191` | Agent Studio | Five seed fixtures hard-code `providerConfig.apiKeyEnvVar = "*_API_KEY"`. | Seed fixtures support local dev. | Medium — sets bad example for new fixtures. | Replace seeds with provider-binding seeds that reference Provider Connection IDs. | Phase 10 | TBD | open | Reviewer |
| LK-03 | `server/agent-studio/seeds/openllm-agent2-defaults.ts:131` | Agent Studio | Default `providerConfig` seed. | Same as LK-02. | Medium. | Same as LK-02. | Phase 10 | TBD | open | Reviewer |

### Existing inert events (D9 violations)

| ID | Path | Owner | Current violation | Reason retained | Risk | Target replacement | Deadline phase | Deadline PR | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|
| LE-01 | `aiTypes.catalog.published` | AI Types | Declared event, zero subscribers. | Forward-declared for unspecified consumers. | Low (no behavior). | Either Agent Studio subscribes (Phase 40) or event is removed from manifest. | Phase 40 (Agent Studio event subscribers) | TBD | open | Governance |
| LE-02 | `aiTypes.catalog.deprecated` | AI Types | Same as LE-01. | Same. | Low. | Same as LE-01. | Phase 40 | TBD | open | Governance |

### `routers/catalog-manage.ts` ownership ambiguity

| ID | Path | Owner | Current violation | Reason retained | Risk | Target replacement | Deadline phase | Deadline PR | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|
| LO-01 | `server/routers/catalog-manage.ts` | AI Types (admin surface) | The file lives at `server/routers/`, not `server/ai-types/`, but it directly manages catalog entries. | Phase 25 audit (`CATALOG_WRITER_MIGRATION_MATRIX.md`) confirmed: header at lines 1-13 is the AI Types governance contract; all writes go through `ai-types/db.ts` helpers; procedures are admin-lifecycle ops (status flips, freeze, review-state). It IS the AI Types admin tRPC surface — wrong directory, right ownership. | Resolved (None). | File relocation `server/routers/catalog-manage.ts` → `server/ai-types/admin-router.ts` is a no-op refactor tracked outside Plan v3. The boundary is intact today. | Phase 25 (resolved by matrix) | PR #129 | migrated | Reviewer + Governance |

---

## Aggregate counts

- **Open exceptions at Phase 0.3:** 18
- **Open exceptions after Phase 5 (LR-06 added):** 19
- **By risk:** High = 5, Medium = 8, Low = 4, Unknown = 2
- **By deadline phase:** Phase 10 = 4, Phase 17 = 1, Phase 19 = 4, Phase 25 = 7, Phase 26 = 2, Phase 40 = 2
- **By owner:** Agent Studio = 5, AI Types (declared events) = 2, Catalog Import = 1, Catalog Manage = 1, Documents = 1, Embeddings = 1, HQ = 1 (likely false positive), KGRA = 1, LLM Authority = 2, Operators = 1, Platform = 2, Data Analysis = 1, Automation = 1, Routers/Agents = 1 (pending verify)

## Format addendum — when to add a new row

Add a row when **any** of the following is true:

- A new code path violates D1–D10.
- A previously unknown violation is discovered (e.g., during a Phase 0.2 follow-up).
- A planned migration is deferred past its target phase (then status flips to `expired` and a new row tracks the deferral).

Do not add rows for:

- Hypothetical violations.
- Violations already migrated (use the `Status` column on the original row instead).
- Tooling debt unrelated to the Plan v3 boundaries.
