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
| LR-01 | `server/agent-studio/adapters/openllm-runtime-adapter.ts:312-321` | Agent Studio | Reads `process.env[pc.apiKeyEnvVar]` for runtime provider auth. | Phase 17 routed binding-equipped no-tool Expert chat through Model Access (`server/agent-studio/services/chat.ts:sendChatMessageViaBinding`). Tool-equipped chats and the simulation path still call `resolveProviderApiKey`; full removal blocked on Phase 18 (tool schema on Model Access) and the simulation-engine migration. | High — same path PR #100 incident exploited; surface area now smaller (binding+no-tools chats no longer hit it). | `withProviderCredential()` via `openRouter.modelAccess.execute`. | Phase 18 (chat tool-loop migration) | PR #121 (Phase 17) | in_progress | Governance |
| LR-02 | `server/embeddings/service.ts:54` | Embeddings | Reads `process.env.OPENAI_API_KEY` for embedding generation. | Active runtime path. Embeddings is not in Plan v3 scope. | Medium — single hard-coded var, no per-draft indirection. | Either route through Model Access (Phase 17 followup) or whitelist with documented reason. | Phase 19 (Runtime path migration matrix classification) | TBD | open | Governance |
| LR-03 | `server/documents/processor.ts:339` | Documents | Reads `process.env.OPENAI_API_KEY` for document processing. | Active runtime path. Documents pipeline is not in Plan v3 scope. | Medium. | Same as LR-02. | Phase 19 | TBD | open | Governance |
| LR-04 | `server/operators/provider-hub.ts:78` | Operators | Reads `process.env.OPENAI_API_KEY` for operator runtime. | Active runtime path. Operators is not in Plan v3 scope. | Medium. | Same as LR-02. | Phase 19 | TBD | open | Governance |
| LR-05 | `server/data-analysis/omnirag-adapter.ts:57` | Data Analysis | Reads `process.env.OMNIRAG_API_KEY`. | OmniRAG is a domain-specific service, not a Plan v3 provider. | Low — not a generic provider key. | May be exempted permanently (D1 covers provider keys, not arbitrary service tokens). Decision in Phase 19. | Phase 19 | TBD | open | Governance |
| LR-06 | `server/_core/index.ts:120-140` | Platform | `autoProvisionProviders()` reads `process.env[OPENAI_API_KEY \| ANTHROPIC_API_KEY \| GOOGLE_API_KEY \| GROQ_API_KEY]` at boot to seed the legacy `providers` table. | Discovered while writing the Phase 5 boundary check. The block is the de facto boot-time seed Plan v3 wants, but it writes to the wrong table. | High — this IS the env-to-runtime path Decision D1 forbids; the Phase 5 lint allowlists it under `<dynamic>` so the rule can land. | Extract to `scripts/provider-connections/seed-from-env.ts`; switch target table to `provider_connections` with encrypted secret. | Phase 10 (Provider config migration script) | TBD | open | Reviewer + Governance |

### AI Types public-API boundary violations (D-N/A — covered by Phase 26)

The 21 importers from `CURRENT_REALITY_MAP.md §4` are not enumerated row-by-row here. They are tracked in aggregate:

| ID | Path | Owner | Current violation | Reason retained | Risk | Target replacement | Deadline phase | Deadline PR | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|
| LA-01 | `server/db.ts:34` and `server/db/index.ts:19` and `server/db/catalog.ts:36` | Platform | Barrel re-exports of `ai-types/db` mean any code importing `server/db` reaches AI Types internals transitively. | Most load-bearing leak vector — many callers indirect through these. | High (transitive blast radius). | Strip the re-exports; fix every transitive caller; then enable Phase 26 lint. | Phase 26 (AI Types public API boundary enforcement) | TBD | open | Reviewer + Governance |
| LA-02 | 18 named files in `CURRENT_REALITY_MAP.md §4` (catalog-import, governance, llm/authority, modules/pmt/*, providers/*, ps/*, routers/{catalog-registry,conversations,models,bots,catalog-manage,agents}, sandbox-wf, _core/index.ts) | Various | Direct imports from `ai-types/{db,service,service-runtime,execution,invoke,import-normalizer,projection}`. | Each caller is a working flow. Bulk replacement requires the public API to actually expose what each caller needs. | Medium per-file, high in aggregate. | `aiTypes.*` gateway actions or barrel from `ai-types/public-api.ts`. | Phase 26 | TBD | open | Reviewer |

### Direct `catalog_entries` writers/readers outside AI Types (D-N/A — covered by Phase 25)

| ID | Path | Owner | Current violation | Reason retained | Risk | Target replacement | Deadline phase | Deadline PR | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|
| LC-01 | `server/catalog-import/router.ts:477,481` | Catalog Import | `db.select().from(catalogEntries).where(...)` direct read. | Catalog import is a legitimate caller of the catalog table; it predates the boundary rule. | Low (read-only). | `aiTypes.catalog.list` public action via gateway. | Phase 25 | TBD | open | Governance |
| LC-02 | `server/llm/authority.ts:87` | LLM Authority | Direct read of `catalogEntries` table. | Authority decisions need catalog facts. | Low. | `aiTypes.catalog.list` or `aiTypes.catalog.get`. | Phase 25 | TBD | open | Governance |
| LC-03 | `server/llm/authority.ts:107` | LLM Authority | `tx.insert(catalogEntries).values(...)` — direct WRITE. | Authority writes a row when promoting an LLM. | High — direct write violates D8-equivalent for non-Agent-Studio modules. | `aiTypes.catalog.register` action. | Phase 25 | TBD | open | Reviewer + Governance |
| LC-04 | `server/routers/catalog-manage.ts:607-710` | Catalog Manage | Multiple `db.update(catalogEntries).set({...}).where(...)` sites. | Catalog Manage is the admin-edit path for catalog entries. | High — direct writes outside AI Types. May be argued as "the catalog management UI sits inside AI Types," requiring file-tree audit. | Either: (a) confirm `routers/catalog-manage.ts` is owned by AI Types and reclassify as not-a-violation; (b) route through AI Types service layer. | Phase 25 | TBD | open | Reviewer (ownership audit first) |
| LC-05 | `server/routers/agents.ts:81` | Agents Router | (Per prior session note) direct write to catalog_entries. Re-verify in Phase 0.2 follow-up. | Possibly the historical "agentStudio.agent.publish writes catalog row" path that current code review (`CURRENT_REALITY_MAP §3`) could not locate. | Unknown until verified. | If verified: `aiTypes.catalog.register`. | Phase 25 | TBD | open | Reviewer (verify first) |
| LC-06 | `server/kgra-agent/nodes.ts:66,69` | KGRA Agent | Raw SQL `db.execute(sql\`SELECT count(*) ... FROM catalog_entries\`)`. | KGRA aggregates catalog facts. | Low (read-only count). | `aiTypes.catalog.count` public action, or remove the read. | Phase 25 | TBD | open | Governance |
| LC-07 | `server/automation/block-executors.ts:102` | Automation | Bare string `"catalog_entries"`. Unknown if SQL target or label. | Pending verification. | Unknown. | Phase 0.2 follow-up to classify. | Phase 19 (runtime path matrix) | TBD | open | Reviewer |
| LC-08 | `server/hq/router.ts:127` | HQ | Field name `catalogEntries:` — likely a count-from-public-API, not a direct query. | Pending verification. | Likely none (false positive). | Phase 0.2 follow-up to classify. | Phase 19 | TBD | open | Reviewer |

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
| LO-01 | `server/routers/catalog-manage.ts` | Unclear (AI Types? Generic platform?) | The file lives at `server/routers/`, not `server/ai-types/`, but it directly manages catalog entries. Is this a private AI Types router that lives in the wrong location, or a generic platform router that violates the AI Types boundary? | Audit not yet performed. | Medium (ambiguity is itself a problem). | Phase 0.2 follow-up: assign owner, then either (a) move to `server/ai-types/` and reclassify writes as in-module, or (b) treat all writes as boundary violations and migrate per LC-04. | Phase 25 (resolved before catalog writer migration starts) | TBD | open | Reviewer + Governance |

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
