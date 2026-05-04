# Catalog Writer Migration Matrix — Plan v3 Phase 25

**Plan v3 Phase 25 deliverable.** Inventories every code path that writes (or directly reads) `catalog_entries` outside `server/ai-types/`, classifies each with a migration fate, and assigns deadlines for the ones that need migration. Pairs with `LEGACY_EXCEPTION_REGISTER.md` (sections "Direct `catalog_entries` writers/readers outside AI Types" — entries `LC-01..LC-08`) and resolves the LO-01 ownership ambiguity for `routers/catalog-manage.ts`.

The canonical write surface introduced in this phase is `aiTypes.catalog.register` (declared in `server/ai-types/manifest.ts`, implementation `server/ai-types/register.ts`). Callers send `{entryType, sourceType, sourceId, fields, registeredBy}`; the action calls `checkDuplicateLegacyImport` (Phase 24) and then delegates to `createCatalogEntry` (new) or `updateCatalogEntry` (existing modern row). Legacy collisions raise `RegisterDuplicateError` so the caller routes to `reconcileLegacyImport` instead.

## Fate values

| Fate | Meaning |
|---|---|
| `IN_MODULE` | Caller lives inside `server/ai-types/` — write goes through the canonical service layer; not a boundary violation. |
| `MIGRATE_TO_REGISTER` | Caller is a domain router or domain service writing catalog rows directly. Must move to `aiTypes.catalog.register` via the Module Gateway. |
| `MIGRATE_TO_PUBLIC_API_READ` | Caller does a direct `catalogEntries` SELECT. Must move to `aiTypes.catalog.list/get/count` (public API). |
| `KEEP_AS_ADMIN_SURFACE` | Caller is the catalog admin/management tRPC layer; its writes ARE the canonical service. No migration. (LO-01 resolution lands here.) |
| `KEEP_INTERNAL_TOOL` | Caller is a script / sandbox seed / migration tool. Documented exception. |
| `REMOVE_FALSE_POSITIVE` | Inspection finds no actual catalog_entries access at the cited site. Update LR row + close. |

## Direct writers (INSERT / UPDATE / call to `createCatalogEntry` or `updateCatalogEntry`)

| LR ID | File | Sites | Owner | Fate | Deadline phase | Reason / replacement |
|---|---|---|---|---|---|---|
| (intra) | `server/ai-types/db.ts:70` | `db.insert(catalogEntries).values(...)` | AI Types | IN_MODULE | — | Canonical impl behind `aiTypes.catalog.register`. |
| (intra) | `server/ai-types/projection.ts:57,76` | `createCatalogEntry`, `updateCatalogEntry` | AI Types | IN_MODULE | — | Internal projection from AI Types service layer. |
| (intra) | `server/ai-types/publishing.ts:89` | `updateCatalogEntry` (status flip on publish) | AI Types | IN_MODULE | — | Internal lifecycle write owned by AI Types. |
| LC-03 | `server/llm/authority.ts:107` | `tx.insert(catalogEntries).values(...)` | LLM Authority | MIGRATE_TO_REGISTER | Phase 26 | Wraps an LLM promotion. Replace with `aiTypes.catalog.register({entryType:"llm", sourceType:"llm", sourceId:llmId, ...})`. The promotion txn boundary moves into the register handler or splits into pre-register + register. |
| LC-04 | `server/routers/catalog-manage.ts` (multiple) | `createCatalogEntry`, `updateCatalogEntry`, status flips, freeze ops | Catalog Manage (= AI Types admin surface — see LO-01 below) | KEEP_AS_ADMIN_SURFACE | — (file-tree relocation tracked separately) | This file already routes through `ai-types/db.ts` helpers — its writes are NOT direct table writes. Header at `server/routers/catalog-manage.ts:1-13` carries the AI Types governance contract. The file is the catalog management tRPC surface; LO-01 resolves to "AI Types admin surface in the wrong directory". File move to `server/ai-types/admin-router.ts` is tracked as a no-op refactor outside Plan v3. |
| (other) | `server/routers/agents.ts:642` | `createCatalogEntry` (catalog import path under `importToCatalog` procedure) | Agents | KEEP_AS_INTAKE | — | Scanned by `scripts/governance/check-invariants.ts` allow-list — file has `importToCatalog` procedure, treated as catalog intake. Not a domain create. |
| (other) | `server/routers/llm.ts:477`, `server/routers/models.ts:254`, `server/routers/bots.ts:261`, `server/providers/router.ts:1023` | `createCatalogEntry` under `importToCatalog`-style procedures | Domain routers | KEEP_AS_INTAKE | — | Same allow-list rule. The intake procedure pattern is the existing approved bridge until Phase 26's public-api boundary phase reroutes them through the gateway. |
| (other) | `server/catalog-import/router.ts:74,375,394,403,531,534` | `createCatalogEntry`, `updateCatalogEntry` | Catalog Import | MIGRATE_TO_REGISTER | Phase 26 | Bulk import path. Calls AI Types helpers today; rewires to call `aiTypes.catalog.register` via `gatewayCall` in Phase 26 alongside the public-api boundary lock. |
| (other) | `server/modules/pmt/idea-builder-agent.ts:627`, `server/modules/pmt/context-translator-agent.ts:1153,1195` | `createCatalogEntry`, `updateCatalogEntry` | PMT Module | MIGRATE_TO_REGISTER | Phase 26 | PMT agents create catalog rows when ideating/translating. Wire through `aiTypes.catalog.register` via gateway. |
| (other) | `server/sandbox-wf/seed-orchestrator.ts:186` | `createCatalogEntry` | Sandbox WF | KEEP_INTERNAL_TOOL | — | Sandbox seed orchestrator — dev-only. Not a runtime path. Documented as exception. |

## Direct readers (SELECT against `catalogEntries`)

| LR ID | File | Sites | Owner | Fate | Deadline phase | Reason / replacement |
|---|---|---|---|---|---|---|
| LC-01 | `server/catalog-import/router.ts:477,481` | `db.select().from(catalogEntries)` | Catalog Import | MIGRATE_TO_PUBLIC_API_READ | Phase 26 | Use `aiTypes.catalog.list` via gateway. Bundled with the writer migration above. |
| LC-02 | `server/llm/authority.ts:87` | `tx.select().from(catalogEntries).where(...)` | LLM Authority | MIGRATE_TO_PUBLIC_API_READ | Phase 26 | Use `aiTypes.catalog.list({entryType:"llm"})` then read in-process. |
| LC-05 | `server/routers/agents.ts:81` | `db.select(...).from(catalogEntries).where(eq(entryType,"agent"))` in the `list` procedure | Agents | MIGRATE_TO_PUBLIC_API_READ | Phase 26 | Replace with a single `aiTypes.catalog.list({entryType:"agent"})` call. Confirmed read-only — does not write the catalog. |
| LC-06 | `server/kgra-agent/nodes.ts:66,69` | Raw SQL `SELECT count(*) FROM catalog_entries` | KGRA Agent | MIGRATE_TO_PUBLIC_API_READ | Phase 26 | Use `aiTypes.catalog.count` (new public action; or remove the read). KGRA uses it as a fact for the knowledge graph; a count public API is the natural surface. |
| LC-07 | `server/automation/block-executors.ts:102` | String `"catalog_entries"` in `ALLOWED_TABLES` | Automation | KEEP_AS_ALLOWLIST | — | Phase 19 reverification: this is a SQL identifier whitelist for the power-user automation block, **not** a code path that reads catalog_entries. Removing it would silently break user workflows that legitimately query the catalog from a workflow block. Documented as accepted catalog-touch via allowlist; tightening (`SELECT-only`) is Stage 8 hardening, not Phase 25. |
| LC-08 | `server/hq/router.ts:127` | `catalogEntries:` field name in a response shape | HQ | REMOVE_FALSE_POSITIVE | — | Inspection: the field name is part of the HQ summary response; the data is fetched through the public counters API, not a direct read. No migration needed — closing LR-LC-08 with `removed`. |

## LO-01 resolution — `server/routers/catalog-manage.ts` ownership

**Audit finding:** `server/routers/catalog-manage.ts:1-13` carries the AI Types governance contract header verbatim (the same header sits atop AI Types-owned files). All writes in the file go through `createCatalogEntry`/`updateCatalogEntry` from `server/ai-types/db.ts` — no direct `db.insert(catalogEntries)` or `db.update(catalogEntries)`. The procedures use `governedProcedure`/`governedAdminProcedure` and represent admin lifecycle operations: status flips (validating→active, active→deprecated), review state changes (needs_review→approved), freeze/unfreeze. These are exactly the operations the AI Types module itself owns.

**Decision:** `server/routers/catalog-manage.ts` is the **AI Types admin tRPC surface in the wrong directory**. Its writes are not D8 violations; they delegate to the canonical service layer. The file relocation to `server/ai-types/admin-router.ts` is a no-op refactor and is **not** a Plan v3 deliverable — it is tracked as future cleanup with no impact on the boundary or governance. LR-LC-04 status moves from `open` to `migrated_to_matrix` with the resolution recorded here.

## What Phase 25 explicitly does NOT do

- Does NOT migrate the LC-01..LC-06 callers in this same PR — those are tracked with deadline phase **Phase 26** so the public-api boundary lockdown and the writer migrations land in one coordinated PR train (LA-01..LA-02 + LC-01..LC-06).
- Does NOT delete `createCatalogEntry`/`updateCatalogEntry` direct exports — those remain available as in-module helpers and are still called by `aiTypes.catalog.register` itself.
- Does NOT change `server/routers/catalog-manage.ts`. The LO-01 audit is a documentation-only resolution; the future file move is unrelated to the boundary.
- Does NOT modify the `scripts/governance/check-invariants.ts` allow-list. That script's `importToCatalog`-procedure exception remains the legacy bridge until Phase 26 reroutes those callers through `aiTypes.catalog.register`.

## Phase 26 punch list (carried forward)

The matrix's "MIGRATE_TO_REGISTER" + "MIGRATE_TO_PUBLIC_API_READ" rows are the input to Phase 26's caller migration. Phase 26 also strips the `server/db.ts` / `server/db/index.ts` barrel re-exports of `ai-types/db` (LA-01) and adds the boundary check (`scripts/check-ai-types-public-api-boundary.ts`). The deadline phase column on every LC-* row in `LEGACY_EXCEPTION_REGISTER.md` updated with this PR points to Phase 26 with this matrix as the migration source-of-truth.
