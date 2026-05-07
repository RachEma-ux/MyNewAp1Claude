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

### Phase 28 sub-phase mapping

The six Phase-28-deadline LRs are batched under `PHASE_28_EXECUTION_PLAN.md`. Each row's `Deadline phase` cell still reads "Phase 28" for backwards compatibility; the sub-phase that owns the closure is:

| LR | Phase 28 sub-phase | Decision |
|---|---|---|
| LR-01 (simulation) | 28.6 (primitive) + 28.7 (caller migration) | MIGRATE_TO_MODEL_ACCESS |
| LR-02 (embeddings) | 28.4 (primitive) + 28.5a | MIGRATE_TO_MODEL_ACCESS |
| LR-03 (documents) | 28.4 (primitive) + 28.5b | MIGRATE_TO_MODEL_ACCESS |
| LR-04 (operators) | 28.4 (primitive) + 28.5c | MIGRATE_TO_MODEL_ACCESS |
| LR-06 (autoProvisionProviders) | 28.2 | RETIRE → `seed-from-env.ts` |
| LR-08 (chat-stream + executeInvokeAgent) | 28.3 | MIGRATE_TO_MODEL_ACCESS |
| LR-09 (opencode subprocess env-write) | 28.1 (CLOSED) | ALREADY_FIXED by PR #100 (predates register); see `PHASE_28_OPENCODE_SUBPROCESS_DECISION.md` |

### Runtime provider-key paths (D1 violations)

| ID | Path | Owner | Current violation | Reason retained | Risk | Target replacement | Deadline phase | Deadline PR | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|
| LR-01 | `server/agent-studio/adapters/openllm-runtime-adapter.ts:312-321` | Agent Studio | Reads `process.env[pc.apiKeyEnvVar]` for runtime provider auth. | **Phase 27.7 narrowing:** the resolver now has exactly ONE remaining caller — `services/simulation.ts:808, 826` (live-mode `runViaOpenAIDirect` + `runViaOpenllmAgent`). Phase 27.3 (`chat-stream.ts`) and Phase 27.5 (`services/chat.ts` `runChatWithTools` + `sendChatMessage` fallback) closed all other LR-01 callers. The simulation deferral is the **single approved Phase 27 exception** (Option C in `PHASE_27_SIMULATION_ENGINE_DECISION.md`) — closing requires Model Access exposing a streaming-with-tool-calls + MCP-bridge primitive that simulation can call via `gatewayCall`. | Low — surface is contained to one engine, scoped by deadline. | `withProviderCredential()` via `openRouter.modelAccess.execute` (or a streaming-with-tool-calls equivalent). | Phase 28 (Model Access streaming-with-tool-calls + MCP-bridge primitive) | PR #122 (Phase 18 narrowed); Phase 27.3 (chat-stream); Phase 27.5 (chat.ts); Phase 27.7 (allowlist purge). | in_progress | Governance |
| LR-02 | `server/embeddings/service.ts:54` | Embeddings | Reads `process.env.OPENAI_API_KEY` for embedding generation. | Active runtime path. Embeddings is not in Plan v3 scope. Phase 27.4 decision: TEMPORARY_EXCEPTION_WITH_DEADLINE — Model Access today is chat/stream/validateBinding only, no embedding-execute primitive yet. | Medium — single hard-coded var, no per-draft indirection. | Migrate to a Model Access embedding-execute action (`openRouter.modelAccess.embed` or equivalent) once that primitive lands. | Phase 28 | TBD | open | Governance |
| LR-03 | `server/documents/processor.ts:339` | Documents | Reads `process.env.OPENAI_API_KEY` for document processing. | Active runtime path. Documents pipeline is not in Plan v3 scope. Same Model Access embedding-endpoint dependency as LR-02. | Medium. | Same as LR-02. | Phase 28 | TBD | open | Governance |
| LR-04 | `server/operators/provider-hub.ts:78` | Operators | Reads `process.env.OPENAI_API_KEY` for operator runtime. | Active runtime path. Operators is not in Plan v3 scope. Same Model Access embedding-endpoint dependency as LR-02. | Medium. | Same as LR-02. | Phase 28 | TBD | open | Governance |
| LR-05 | `server/data-analysis/omnirag-adapter.ts:57` | Data Analysis | Reads `process.env.OMNIRAG_API_KEY`. | OmniRAG is a domain-specific service, not a Plan v3 provider. Phase 27.4 decision: NOT_APPLICABLE — D1 covers provider keys, not arbitrary service tokens. The `NON_PROVIDER_KEYS` set in `check-provider-key-env-boundary.ts` already exempts it. | Low — not a generic provider key. | None (permanent exemption per Phase 27.4). | — | — | migrated | Governance |
| LR-06 | `server/_core/index.ts:120-140` | Platform | `autoProvisionProviders()` reads `process.env[OPENAI_API_KEY \| ANTHROPIC_API_KEY \| GOOGLE_API_KEY \| GROQ_API_KEY]` at boot to seed the legacy `providers` table. | Phase 27.4 decision: RETIRE — extract to `scripts/provider-connections/seed-from-env.ts`; switch target table to `provider_connections` with encrypted secret. The actual extract requires moving the encrypted-secret write target and a one-shot operator/CI invocation pattern; that is owned by Phase 28. | High — this IS the env-to-runtime path Decision D1 forbids; allowlisted under `<dynamic>` until the extract lands. | Extract to `scripts/provider-connections/seed-from-env.ts`. | Phase 28 (RETIRE follow-up; decision locked in 27.4 matrix) | TBD | open | Reviewer + Governance |
| LR-08 | `server/chat/stream.ts` (`/api/chat/stream`) and `server/automation/block-executors.ts:executeInvokeAgent` (202–270) | Chat + Automation | Both consume `getProviderRegistry()` — the runtime registry that was seeded by LR-06's `autoProvisionProviders()`. Even after LR-06 closes, callers who load `getProviderRegistry()` still hit a registry whose providers were originally minted from env. **Function-name correction:** the actual export is `executeInvokeAgent`, not `executeRunAgent` (Phase 27.1 sizing report). | Active runtime path; the cross-cutting `/api/chat/stream` HTTP endpoint is used by the legacy chat UI; `executeInvokeAgent` is reachable via automation workflows. Phase 27.4 decision: TEMPORARY_EXCEPTION_WITH_DEADLINE rolled into the Phase 28 LR-08 batch. | Medium — neither path is the PR-#100 incident shape, but both bypass Plan v3 binding/Model Access. | Migrate `/api/chat/stream` to call `agentStudio.providerBindings.resolveForRun` then `openRouter.modelAccess.execute|stream` via the gateway. Migrate `executeInvokeAgent` to do the same against the agent's binding. | Phase 28 | TBD | open | Reviewer + Governance |
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
