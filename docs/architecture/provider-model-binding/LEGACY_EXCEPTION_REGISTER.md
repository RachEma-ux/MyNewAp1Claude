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

### Runtime provider-key paths (D1 violations)

| ID | Path | Owner | Current violation | Reason retained | Risk | Target replacement | Deadline phase | Deadline PR | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|
| LR-01 | `server/agent-studio/adapters/openllm-runtime-adapter.ts:312-321` | Agent Studio | Reads `process.env[pc.apiKeyEnvVar]` for runtime provider auth. | Phase 17 routed binding-equipped no-tool Expert chat through Model Access; Phase 18 routed binding-equipped TOOL-equipped chat through Model Access via the new `runChatWithToolsViaBinding` (`ModelAccessToolCall` schema). Phase 19 catalogs the remaining callers in `RUNTIME_PATH_MIGRATION_MATRIX.md`: `services/simulation.ts` (live runtime branch — `runViaOpenAIDirect` + `runViaOpenllmAgent`) and the `runChatWithTools` legacy fallback (only reachable for non-binding agents). Both deletions are owned by Phase 27 (Agent Studio raw-key surface elimination). | Medium — Expert chat no longer reaches the function for binding-equipped agents. Simulation engine + non-binding agents remain. | `withProviderCredential()` via `openRouter.modelAccess.execute`. | Phase 27 (Agent Studio raw-key surface elimination) | PR #122 (Phase 18 narrowed); see `RUNTIME_PATH_MIGRATION_MATRIX.md` for the punch list | in_progress | Governance |
| LR-02 | `server/embeddings/service.ts:54` | Embeddings | Reads `process.env.OPENAI_API_KEY` for embedding generation. | Active runtime path. Embeddings is not in Plan v3 scope. | Medium — single hard-coded var, no per-draft indirection. | Either route through Model Access (Phase 17 followup) or whitelist with documented reason. Phase 19 deferred the classification call to Phase 27. | Phase 27 (Agent Studio raw-key surface — embedding/documents/operators reclassification batch) | TBD | open | Governance |
| LR-03 | `server/documents/processor.ts:339` | Documents | Reads `process.env.OPENAI_API_KEY` for document processing. | Active runtime path. Documents pipeline is not in Plan v3 scope. | Medium. | Same as LR-02. | Phase 27 | TBD | open | Governance |
| LR-04 | `server/operators/provider-hub.ts:78` | Operators | Reads `process.env.OPENAI_API_KEY` for operator runtime. | Active runtime path. Operators is not in Plan v3 scope. | Medium. | Same as LR-02. | Phase 27 | TBD | open | Governance |
| LR-05 | `server/data-analysis/omnirag-adapter.ts:57` | Data Analysis | Reads `process.env.OMNIRAG_API_KEY`. | OmniRAG is a domain-specific service, not a Plan v3 provider. | Low — not a generic provider key. | May be exempted permanently (D1 covers provider keys, not arbitrary service tokens). Phase 19 deferred the decision to Phase 27. | Phase 27 | TBD | open | Governance |
| LR-06 | `server/_core/index.ts:120-140` | Platform | `autoProvisionProviders()` reads `process.env[OPENAI_API_KEY \| ANTHROPIC_API_KEY \| GOOGLE_API_KEY \| GROQ_API_KEY]` at boot to seed the legacy `providers` table. | Discovered while writing the Phase 5 boundary check. The block is the de facto boot-time seed Plan v3 wants, but it writes to the wrong table. | High — this IS the env-to-runtime path Decision D1 forbids; the Phase 5 lint allowlists it under `<dynamic>` so the rule can land. | Extract to `scripts/provider-connections/seed-from-env.ts`; switch target table to `provider_connections` with encrypted secret. | Phase 10 (Provider config migration script) | TBD | open | Reviewer + Governance |
| LR-08 | `server/chat/stream.ts` (`/api/chat/stream`) and `server/automation/block-executors.ts:executeRunAgent` (220–270) | Chat + Automation | Both consume `getProviderRegistry()` — the runtime registry that was seeded by LR-06's `autoProvisionProviders()`. Even after LR-06 closes, callers who load `getProviderRegistry()` still hit a registry whose providers were originally minted from env. | Active runtime path; the cross-cutting `/api/chat/stream` HTTP endpoint is used by the legacy chat UI; `executeRunAgent` is reachable via automation workflows. | Medium — neither path is the PR-#100 incident shape, but both bypass Plan v3 binding/Model Access. | Migrate `/api/chat/stream` to call `agentStudio.providerBindings.resolveForRun` then `openRouter.modelAccess.execute|stream` via the gateway. Migrate `executeRunAgent` to do the same against the agent's binding. | Phase 27 (Agent Studio raw-key surface elimination) | TBD | open | Reviewer + Governance |
| LR-09 | `server/code-studio/opencode/provider-sync.ts:96` | Code Studio | Writes provider env vars (`process.env[envVar] = config.apiKey`) onto a spawned-subprocess environment. | The opencode CLI subprocess expects credentials in env; this is the handoff point. | Low (write, not read; surface is contained). | Decision pending: classify as out-of-scope (subprocess env handoff is a different surface than runtime reads) OR migrate the subprocess invocation to receive credentials another way. | Phase 27 | TBD | open | Governance (decision call) |

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
| LK-01 | `drizzle/tables/agent-studio.ts:119` | Agent Studio | `ags_agent_drafts.providerConfig` is an unconstrained `jsonb` blob — schema permits raw `apiKey`. | Existing rows must remain readable through migration. | High — production drafts may carry raw keys today. | Phase 9–10 migration: remove `apiKey`/`apiKeyEnvVar` from new writes; backfill drafts to `legacy_unresolved` bindings; redact secret fields. | Phase 10 (Provider config migration script) | TBD | open | Reviewer + Governance |
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
