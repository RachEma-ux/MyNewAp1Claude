# Current Reality Map — Provider/Model Binding

**Phase 0.2 output. Inventory only — does NOT assign migration fate.**

Captured against `main` at the time of writing. Citations are `file:line`. Migration fates are decided later in:

- `LEGACY_EXCEPTION_REGISTER.md` (per-exception status + deadline)
- `CATALOG_WRITER_MIGRATION_MATRIX.md` (per-writer fate — Phase 25)
- `RUNTIME_PATH_MIGRATION_MATRIX.md` (per-runtime-path fate — Phase 19)

This decoupling is the explicit fix for prior issue **N18**.

---

## 1. Agent Studio provider config — current shape

### Schema

`drizzle/tables/agent-studio.ts:119` — `ags_agent_drafts.providerConfig` is a `jsonb("provider_config").$type<Record<string, unknown>>().default({})`. The shape is unenforced at the DB level; it is a JSON blob.

### Conventional fields (de facto)

From `server/agent-studio/adapters/openllm-runtime-adapter.ts:299-321`:

- `providerConfig.apiKey` — literal API key string (legacy / per-agent override)
- `providerConfig.apiKeyEnvVar` — name of env var to read (e.g. `"OPENAI_API_KEY"`)
- `providerConfig.providerSlug` / `providerConfig.providerId` — provider reference

### Where the de facto shape is read

- `server/agent-studio/adapters/openllm-runtime-adapter.ts:312-321` — `resolveProviderApiKey(providerConfig)` checks `pc.apiKey`, then `process.env[pc.apiKeyEnvVar]`, then a PROVIDER → env-var convention map.
- `server/agent-studio/repository.ts:108,118,2057` — draft read/write of `providerConfig`.
- `server/agent-studio/services/cloning.ts:150` — copies `providerConfig` blob across drafts.

### Where the de facto shape is written (seeds)

`server/agent-studio/db/seed-legacy-fixtures.ts:36-191` — five seed fixtures each include `providerConfig: { apiKeyEnvVar: "OPENAI_API_KEY" | "ANTHROPIC_API_KEY" | "GOOGLE_API_KEY" }`.

`server/agent-studio/seeds/openllm-agent2-defaults.ts:131` — `providerConfig:` seed.

### Where the de facto shape is consumed at runtime

- `server/agent-studio/services/chat.ts:160` — `runChatWithTools(input)` (function signature).
- `server/agent-studio/services/chat.ts:474` — call site inside `sendMessage` mutation.
- `server/agent-studio/api/router.ts:1949` — `agentStudio.chat.sendMessage` tRPC mutation.

---

## 2. process.env API-key readers in runtime paths

| File:line | Var | Notes |
|---|---|---|
| `server/agent-studio/adapters/openllm-runtime-adapter.ts:321` | `process.env[pc.apiKeyEnvVar]` | Indirect — env var name is per-draft. This is the path PR #100 fixed against pollution. |
| `server/embeddings/service.ts:54` | `OPENAI_API_KEY` | Embeddings pipeline. |
| `server/documents/processor.ts:339` | `OPENAI_API_KEY` | Document processor. |
| `server/operators/provider-hub.ts:78` | `OPENAI_API_KEY` | Operator hub. |
| `server/data-analysis/omnirag-adapter.ts:57` | `OMNIRAG_API_KEY` | OmniRAG adapter. Domain-specific, not provider-agnostic. |

`server/_core/env.ts:12` reads `BUILT_IN_FORGE_API_KEY` — not a provider key, this is a Forge service token; classification deferred.

---

## 3. Agent Studio publish path — what it writes today

`server/agent-studio/repository.ts:675-705` — `publishRelease(input)`:

- INSERTs into `agsAgentReleases` (ASDB).
- UPDATEs `agsAgents` (ASDB) — sets `publishedVersionId`, `lifecycleState`, `environment`.
- **Does NOT write to `catalog_entries` directly.**

Gateway action `agentStudio.agent.publish` is registered at `server/agent-studio/manifest.ts:42` and `server/agent-studio/boot.ts:109-122` — its handler calls `repo.publishRelease(payload)`.

The "publish writes to catalog_entries" pattern documented in earlier session notes is **not currently visible in this code path**. If a side-effect writer exists, it is in a different caller (see Section 5).

---

## 4. AI Types internal imports from outside the module

`public-api.ts` exists at `server/ai-types/public-api.ts` but is currently aspirational — the following files import from `server/ai-types/{db,service,service-runtime,execution,invoke,import-normalizer,projection,manifest,router}.ts` directly:

| File:line | What it imports |
|---|---|
| `server/db.ts:34` | `export * from "./ai-types/db"` — barrel re-export. Any code importing `server/db` transitively reaches AI Types internals. |
| `server/db/index.ts:19` | `export * from "../ai-types/db"` — same. |
| `server/db/catalog.ts:36` | re-exports from `../ai-types/db`. |
| `server/_core/index.ts:14,15,30` | `catalogExecutionQuerySchema` from `../ai-types/execution`; `invokeCatalogEntry` from `../ai-types/invoke`; `bootAiTypesModule` from `../ai-types/boot`. |
| `server/catalog-import/router.ts:21-23` | `createModel`, `createLlm` from `../ai-types/service`; `normalizeToModel`, `normalizeToLlm`, `resolveProviderId` from `../ai-types/import-normalizer`; `linkCatalogToDomain` from `../ai-types/projection`. |
| `server/governance/router.ts:27` | `getCatalogEntryById`, `getEntryClassifications` from `../ai-types/db`. |
| `server/llm/authority.ts:4` | `getActiveBundleForEntry`, `getCatalogEntryById` from `../ai-types/db`. |
| `server/modules/pmt/context-translator-agent.ts:23` | several CRUD fns from `../../ai-types/db`. |
| `server/modules/pmt/idea-builder-agent.ts:19` | several CRUD fns from `../../ai-types/db`. |
| `server/providers/catalog-guard.ts:8` | `getCatalogEntries` from `../ai-types/db`. |
| `server/providers/router.ts:20` | several CRUD fns from `../ai-types/db`. |
| `server/ps/context-translator-router.ts:27-28` | `service-runtime` + `db`. |
| `server/routers/catalog-registry.ts:17` | `resolveCatalogAgentExecutionTarget`, `resolveServiceAgentExecutionTarget` from `../ai-types/execution`. |
| `server/routers/conversations.ts:30` | from `../ai-types/execution`. |
| `server/routers/models.ts:30` | several CRUD fns from `../ai-types/db`. |
| `server/routers/bots.ts:33` | several CRUD fns from `../ai-types/db`. |
| `server/routers/catalog-manage.ts:92` | `createDomainModel`, `createDomainLlm`, `resolveProviderFromCatalogEntry` from `../ai-types/service`. |
| `server/routers/agents.ts:34` | `createCatalogEntry`, `createCatalogAuditEvent`, `getTaxonomyNodes`, `setEntryClassifications` from `../ai-types/db`. |
| `server/sandbox-wf/seed-orchestrator.ts:22` | `createCatalogEntry`, `createPublishBundle` from `../ai-types/db`. |
| `server/platform/modules/module-routers.ts:24` | `aiTypesRouter` from `../../ai-types/router`. |
| `server/platform/modules/manifests.ts:26` | `aiTypesManifest` from `../../ai-types/manifest`. |

The platform-level imports (`module-routers.ts`, `manifests.ts`) are legitimate by current convention — modules expose router and manifest to the platform mounter. The first two barrel re-exports (`server/db.ts`, `server/db/index.ts`, `server/db/catalog.ts`) are the most load-bearing leak vector — any deletion or restriction will fan out across many callers.

---

## 5. Direct `catalog_entries` table writers/readers outside `server/ai-types/`

| File:line | Operation |
|---|---|
| `server/catalog-import/router.ts:477,481` | dynamic `import("../../drizzle/schema")` of `catalogEntries`, `db.select().from(catalogEntries).where(isNull(catalogEntries.providerId))`. **Read.** |
| `server/llm/authority.ts:7,87,107` | imports `catalogEntries`; `tx.select().from(catalogEntries).where(eq(catalogEntries.entryType, "llm"))` — **read**; `tx.insert(catalogEntries).values(...)` — **write**. |
| `server/routers/agents.ts:81` | (per prior session note) — direct read. Not re-verified in this map. |
| `server/routers/catalog-manage.ts:607-710` | three dynamic imports of `catalogEntries` + `db.update(catalogEntries).set({...}).where(...)` — **writes** (multiple sites). |
| `server/automation/block-executors.ts:102` | string literal `"catalog_entries"` — needs follow-up to determine if this is a query target or just a label. |
| `server/kgra-agent/nodes.ts:66,69` | raw SQL: `db.execute(sql\`SELECT count(*) as cnt FROM catalog_entries\`)` — **read**. |
| `server/providers/router.ts:944,950` | uses `getCatalogEntries()` (the canonical AI Types API, not direct SQL) — boundary-safe but the import is from `../ai-types/db` (see Section 4). |
| `server/routers/bots.ts:185,191` | uses `getCatalogEntries()` — same as above. |
| `server/hq/router.ts:127` | field name `catalogEntries:` — needs follow-up to verify it's not a direct query. |

The earlier "three direct writers" finding was **incomplete**. Confirmed direct-table writers/readers outside AI Types: `catalog-import/router.ts`, `llm/authority.ts`, `routers/catalog-manage.ts` (multiple), `kgra-agent/nodes.ts`, plus a likely-direct write in `routers/agents.ts:81` (not re-verified) and an ambiguous reference in `automation/block-executors.ts`.

---

## 6. Provider Connections — current module shape

`ls server/provider-connections/` returns:

- `db.ts`
- `provider-connections.test.ts`
- `router.ts`
- `service.ts`
- `state-machine.ts`

**Missing files:**

- ❌ `manifest.ts` — Provider Connections is **NOT** a manifested module today.
- ❌ `public-api.ts` — no public-API barrel.
- ❌ `index.ts` — no module index file.

Plan v3 Phase 1 ("Manifest Provider Connections as platform infrastructure") therefore creates the entire module surface (manifest, public-api, ports, governance hooks, gateway actions, wiring registration). This is real new module-creation work, not a tweak.

Frontend route: `client/src/App.tsx:394` — `/providers/connections` → `ProviderConnectionsPage`.
Backend mount: `server/routers.ts:55` imports `providerConnectionsRouter` from `./provider-connections/router`.

---

## 7. OpenRouter — current server-side surface

`ls server/openrouter/`:

- `contracts.ts`, `events.ts`, `handoffs.ts`, **`manifest.ts`**, `ports.ts`, **`public-api.ts`**, `router.ts`, `routing-service.ts`, `schema.ts`, `service.ts`, `sync-service.ts`

**Has manifest** (`manifest.ts:40` → `ports: { provided: ["openRouter.route"], consumed: [] }`) and a registered public action (`openRouter.config.update`). 

`routing-service.ts` currently manages **routing profiles** (preset selection / fallback ordering) — it does NOT have a runtime `execute(messages, model)` function today. There is no `streamRequest`/`runRequest` exported from OpenRouter in the search performed.

For Plan v3 Phase 4 ("Create OpenRouter Model Access facade"): `openRouter.modelAccess.execute|stream|validateBinding` are entirely new. Adopting OpenRouter as Model Access host means **adding a new sub-folder `server/openrouter/model-access/`** with execution capability that doesn't exist in the OpenRouter capsule today.

---

## 8. /api/chat/stream — provider access

`server/_core/index.ts:879` mounts `app.post("/api/chat/stream", handleChatStream)` which is imported from `chat/stream.ts:11`.

`server/chat/stream.ts:27` defines `handleChatStream(req, res)`:

- Line 13: input includes `providerId: z.number().int().positive().optional()`.
- Line 70: `const registry = getProviderRegistry()` from `../providers/registry`.
- Line 84/93: `provider = registry.getProvider(routingPlan.primaryProviderId | providerId)`.

**Provider access path:** legacy chat-stream → platform provider registry → registry resolves provider object (which holds the credential, not Provider Connections). The platform provider registry is what the AI Types catalog gate (`server/providers/init.ts:17-44`) gates by approved-provider IDs.

This is the path that is **invisible to Agent Studio** — the prior AI Types ↔ Agent Studio analysis confirmed Agent Studio's chat does not use the registry, so the catalog gate has no effect on Agent Studio.

---

## 9. Agent Studio Expert chat — provider access

The Expert chat (`agentStudio.chat.sendMessage`) goes through:

- `server/agent-studio/api/router.ts:1949` — mutation handler.
- `server/agent-studio/services/chat.ts:474` — calls `runChatWithTools({...})`.
- `server/agent-studio/services/chat.ts:160` — `runChatWithTools` opens `new OpenAI({ apiKey })` directly with the resolved key.
- `server/agent-studio/adapters/openllm-runtime-adapter.ts:312-321` — `resolveProviderApiKey()` walks `pc.apiKey` → `process.env[pc.apiKeyEnvVar]` → conventional env-var fallback.

This entire chain bypasses Provider Connections, OpenRouter, and the platform provider registry. Per PR #100's fix, `process.env` is no longer mutated by Code Studio at boot, but Agent Studio still **reads** from it.

---

## 10. server/automation — provider access

Search `grep -rn "OpenAI\|Anthropic\|provider\|apiKey" server/automation/` filtered to call/instantiation patterns returned **no direct provider SDK instantiations** in `server/automation/`. This suggests automation workflows currently call providers through one of:

- Agent Studio runtime (sendMessage)
- Legacy `/api/chat/stream`
- A non-instantiation pattern (e.g., HTTP fetch)

`server/automation/block-executors.ts:102` mentions `"catalog_entries"` as a string — needs follow-up to determine whether it's a query target or a label/registry key.

This section is **incomplete** and is flagged as a known gap to close before Phase 19 (Runtime Path Migration Matrix) is finalized.

---

## 11. Known cross-DB references (no FK enforcement)

Plan v3's `AgentProviderBinding` will hold soft references from ASDB to:

- `providerCatalogEntryId` → `appdb.catalog_entries.id`
- `modelCatalogEntryId` → `appdb.catalog_entries.id`
- `providerConnectionId` → `appdb.providers.id` (or wherever Provider Connections owns its rows)

No PostgreSQL FK can span these databases. Phase 15 (degraded-state detection) is the chosen mitigation.

---

## 12. Inventory gaps — explicit follow-ups

The following items were searched but the result was inconclusive or empty within the Phase 0.2 time-box. They are **not** assumed clean — they are explicitly flagged for confirmation before downstream phases close:

1. `server/automation/block-executors.ts:102` — verify whether `"catalog_entries"` is a SQL target.
2. `server/routers/agents.ts:81` — re-verify the prior-session "direct catalog_entries write" claim against current code.
3. `server/hq/router.ts:127` — `catalogEntries:` field — verify it's a count from the public API, not a direct query.
4. `server/automation/*` — confirm there is genuinely zero direct provider SDK instantiation.
5. Whether OpenRouter's `routing-service.ts` `seedDefaultPresets` or any other function performs an actual provider HTTP call today.

These gaps are recorded here, not silently elided.

---

## End of map

Migration fates for every item above are decided in:

- `LEGACY_EXCEPTION_REGISTER.md`
- `CATALOG_WRITER_MIGRATION_MATRIX.md` (Phase 25 deliverable)
- `RUNTIME_PATH_MIGRATION_MATRIX.md` (Phase 19 deliverable)

Inventory only. No fates here.
