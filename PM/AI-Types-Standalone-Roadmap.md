# AI Types — Standalone Module Roadmap

## Objective

Transform AI Types from a passive catalog browser into a **first-class standalone module** with its own backend namespace, route family, domain ownership, and governance surface.

## Current State (Baseline)

| Aspect | Status |
|---|---|
| Backend router in appRouter | **NO** — uses `catalogManage`, `catalogRegistry`, `catalogImport` |
| Dedicated server directory | Partial — `server/ai-types/` exists (6 files, domain-write only) |
| Frontend routes | **ONE** — `/ai-types/:type` (a read-only browser) |
| DB tables | Shared — `catalog_entries`, `catalog_entry_versions`, etc. in `drizzle/tables/catalog.ts` |
| Execution pipeline | Shared — `server/catalog/execution.ts` (10-gate pipeline) |
| Taxonomy | Shared — `shared/catalog-taxonomy.ts` (1,687 lines, 5 axes) |
| Governance | Shared — `server/governance/stage-review.ts` |
| Import | Shared — `server/catalog-import/` (5 files) |
| Total code surface | ~8,400 lines across 19 files in 5 directories |

## Target State

```
AI Types module answers:
"Can I manage the platform's AI type system from AI Types itself,
without jumping into Providers, LLM, Models, Agents, Bots, and
shared catalog code to do the real work?"
→ YES
```

## Architecture

### Backend: `server/ai-types/` (consolidated module)

```
server/ai-types/
├── index.ts              ← public API (façade)
├── router.ts             ← NEW: aiTypes tRPC router (registered in appRouter)
├── ports.ts              ← NEW: interfaces for provider, agent, governance
├── boot.ts               ← NEW: wiring (called from _core/index.ts)
├── db.ts                 ← MOVED from server/db/catalog.ts
├── execution.ts          ← MOVED from server/catalog/execution.ts
├── invoke.ts             ← MOVED from server/catalog/invoke.ts
├── availability.ts       ← MOVED from server/catalog/availability.ts
├── service-runtime.ts    ← MOVED from server/catalog/service-runtime.ts
├── service.ts            ← EXISTS: domain-first write (models/LLMs)
├── projection.ts         ← EXISTS: catalog projection
├── migration.ts          ← EXISTS: domain migration
├── import-normalizer.ts  ← EXISTS: import normalization
├── types.ts              ← EXISTS: domain types
├── taxonomy/             ← NEW: taxonomy management endpoints
│   └── router.ts
├── relationships/        ← NEW: cross-type dependency graph
│   └── router.ts
├── validation/           ← NEW: completeness + consistency checks
│   └── router.ts
├── control-panel/        ← NEW: import, sync, repair, promote actions
│   └── router.ts
└── import/               ← MOVED from server/catalog-import/
    ├── router.ts
    ├── session-service.ts
    ├── dedup-service.ts
    ├── discovery-service.ts
    └── file-parser.ts
```

### Frontend: `/ai-types/*` route family

```
/ai-types                  → Overview (counts, coverage, health)
/ai-types/catalog          → Unified inventory (all 5 types)
/ai-types/taxonomy         → Axes, classes, mappings editor
/ai-types/relationships    → Dependency graph visualization
/ai-types/validation       → Broken classifications, missing fields
/ai-types/control-panel    → Import, sync, seed, promote, deprecate
/ai-types/governance       → Policy/readiness/risk views
```

### appRouter Registration

```ts
// server/routers.ts
aiTypes: aiTypesRouter,  // ← NEW entry
// catalogManage, catalogRegistry, catalogImport → DEPRECATED aliases → aiTypes
```

---

## Phased Execution Plan

### Phase 1: Technical Consolidation (Foundation)
**Goal:** Consolidate scattered catalog code into `server/ai-types/`, define ports, establish module boundary.

| # | Task | Type | Files |
|---|---|---|---|
| 1.1 | Create `server/ai-types/ports.ts` | NEW | Define ICatalogProviderPort, ICatalogAgentPort, IGovernancePort interfaces |
| 1.2 | Create `server/ai-types/boot.ts` | NEW | Wire port implementations at startup |
| 1.3 | Move `server/db/catalog.ts` → `server/ai-types/db.ts` | MOVE | Update all 16+ import paths |
| 1.4 | Move `server/catalog/execution.ts` → `server/ai-types/execution.ts` | MOVE | Refactor to use ports instead of direct imports |
| 1.5 | Move `server/catalog/invoke.ts` → `server/ai-types/invoke.ts` | MOVE | Update import paths |
| 1.6 | Move `server/catalog/availability.ts` → `server/ai-types/availability.ts` | MOVE | Update import paths |
| 1.7 | Move `server/catalog/service-runtime.ts` → `server/ai-types/service-runtime.ts` | MOVE | Update import paths |
| 1.8 | Move `server/catalog-import/` → `server/ai-types/import/` | MOVE | Update router registration + all imports |
| 1.9 | Create `server/ai-types/index.ts` façade | NEW | Re-export public API for external consumers |
| 1.10 | Update `server/db/index.ts` | MODIFY | Point catalog re-exports to new location |
| 1.11 | Update `server/_core/index.ts` | MODIFY | Call boot.ts, update import paths |
| 1.12 | Update all 16+ external consumers | MODIFY | Point to `server/ai-types` façade |
| 1.13 | Move test files alongside source | MOVE | execution.test.ts, execution-observability.test.ts, file-parser.test.ts |

### Phase 2: Backend Router + Namespace (Identity)
**Goal:** Give AI Types its own tRPC router registered as `aiTypes` in appRouter.

| # | Task | Type | Files |
|---|---|---|---|
| 2.1 | Create `server/ai-types/router.ts` | NEW | Compose sub-routers: catalog, taxonomy, relationships, validation, controlPanel, import |
| 2.2 | Move catalog-manage procedures into `server/ai-types/catalog-router.ts` | MOVE | 21 procedures from server/routers/catalog-manage.ts |
| 2.3 | Move catalog-registry into `server/ai-types/registry-router.ts` | MOVE | From server/routers/catalog-registry.ts |
| 2.4 | Register `aiTypes` in `server/routers.ts` | MODIFY | Add aiTypes router, add backward-compat aliases |
| 2.5 | Update client tRPC calls | MODIFY | `trpc.catalogManage.*` → `trpc.aiTypes.catalog.*` (or keep aliases) |

### Phase 3: Taxonomy Ownership (First New Feature)
**Goal:** AI Types owns taxonomy browsing, editing, and classification management.

| # | Task | Type | Files |
|---|---|---|---|
| 3.1 | Create `server/ai-types/taxonomy/router.ts` | NEW | CRUD for taxonomy nodes, axes, inference rules |
| 3.2 | Create `/ai-types/taxonomy` page | NEW | Tree view, axis editor, class lifecycle |
| 3.3 | Move taxonomy procedures from catalog-manage | MOVE | taxonomyTree, classify, getClassifications |

### Phase 4: Relationships + Validation (New Features)
**Goal:** Cross-type dependency graph and completeness checking.

| # | Task | Type | Files |
|---|---|---|---|
| 4.1 | Create `server/ai-types/relationships/router.ts` | NEW | Query Provider→Model→Agent→Bot→Workflow graph |
| 4.2 | Create `server/ai-types/validation/router.ts` | NEW | Missing metadata, broken classifications, orphaned entries |
| 4.3 | Create `/ai-types/relationships` page | NEW | Interactive dependency graph (D3 or similar) |
| 4.4 | Create `/ai-types/validation` page | NEW | Issue list with fix actions |

### Phase 5: Route Family + Shell (Product Elevation)
**Goal:** Full UI module with overview, control panel, governance views.

| # | Task | Type | Files |
|---|---|---|---|
| 5.1 | Create AI Types shell layout (Simple IBM Shell) | NEW | Sidebar + content, cloned from PM Central |
| 5.2 | Create `/ai-types` overview page | NEW | Counts by type, coverage %, approval state, health |
| 5.3 | Upgrade `/ai-types/catalog` | MODIFY | Unified inventory — current AITypesPage becomes this |
| 5.4 | Create `/ai-types/control-panel` | NEW | Import, sync, seed, repair, promote, deprecate |
| 5.5 | Create `/ai-types/governance` | NEW | Policy views, readiness checks, risk surface |
| 5.6 | Update `App.tsx` routes | MODIFY | `/ai-types` → shell, sub-routes for each page |
| 5.7 | Update hamburger menu | MODIFY | AI Types entry points to shell |

### Phase 6: Cleanup + Deprecation
**Goal:** Remove old scattered directories, finalize module boundary.

| # | Task | Type | Files |
|---|---|---|---|
| 6.1 | Delete `server/catalog/` directory | DELETE | All files moved in Phase 1 |
| 6.2 | Delete `server/catalog-import/` directory | DELETE | All files moved in Phase 1 |
| 6.3 | Remove `server/routers/catalog-manage.ts` | DELETE | Moved in Phase 2 |
| 6.4 | Remove `server/routers/catalog-registry.ts` | DELETE | Moved in Phase 2 |
| 6.5 | Update `server/db/index.ts` | MODIFY | Remove catalog re-exports (use façade) |
| 6.6 | Final import audit | VERIFY | No file outside `server/ai-types/` imports catalog internals |

---

## Risks

| Risk | Mitigation |
|---|---|
| 16+ external consumers break on move | Phase 1 façade re-exports maintain compatibility |
| tRPC client calls break | Phase 2 keeps backward-compat router aliases |
| Execution pipeline regression | Tests exist (execution.test.ts, execution-observability.test.ts) |
| File-parser tests break | Move test alongside source in Phase 1 |
| Governance coupling | Ports pattern isolates dependency; governance stays external |
| Large diff size | Phased execution — each phase is independently shippable |

---

## Validation Plan

| Phase | Validation |
|---|---|
| Phase 1 | All existing imports resolve. Tests pass. App starts. Catalog CRUD works. |
| Phase 2 | `trpc.aiTypes.*` endpoints work. Old `trpc.catalogManage.*` aliases still work. |
| Phase 3 | Taxonomy browsing/editing works from `/ai-types/taxonomy` |
| Phase 4 | Relationship graph renders. Validation page shows real issues. |
| Phase 5 | Full AI Types shell navigable. All 7 sub-pages render. |
| Phase 6 | No orphaned files. No broken imports. Clean `git grep` for old paths. |

---

## Standalone Test (Definition of Done)

> "Can I manage the platform's AI type system from AI Types itself?"

- [ ] Own backend router: `aiTypes` in appRouter
- [ ] Own directory: all catalog logic in `server/ai-types/`
- [ ] Own route family: 7 pages under `/ai-types/*`
- [ ] Own taxonomy management (not just browsing)
- [ ] Own relationship graph (Provider → Model → Agent → Bot)
- [ ] Own validation surface (missing metadata, broken classifications)
- [ ] Own control panel (import, sync, promote, deprecate)
- [ ] Own governance view (readiness, risk, policy)
- [ ] External consumers use façade only (`server/ai-types/index.ts`)
- [ ] No scattered catalog code in `server/db/`, `server/catalog/`, `server/routers/catalog-*`
