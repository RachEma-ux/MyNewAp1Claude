# AI Types Standalone Module — Execution Plan

## AGENTS.md Compliance

This is **architectural + catalog + boundary-related** work.
Required pipeline: **Planner → Builder → Reviewer → Tester → Governance**

---

## PLANNER OUTPUT

### Objective
Transform AI Types from a scattered catalog browser into a self-contained standalone module.

### Touched Files (by phase)

#### Phase 1 — Technical Consolidation (13 tasks)
**NEW files:**
- `server/ai-types/ports.ts`
- `server/ai-types/boot.ts`

**MOVED files (source → destination):**
- `server/db/catalog.ts` → `server/ai-types/db.ts`
- `server/catalog/execution.ts` → `server/ai-types/execution.ts`
- `server/catalog/execution.test.ts` → `server/ai-types/execution.test.ts`
- `server/catalog/execution-observability.test.ts` → `server/ai-types/execution-observability.test.ts`
- `server/catalog/invoke.ts` → `server/ai-types/invoke.ts`
- `server/catalog/availability.ts` → `server/ai-types/availability.ts`
- `server/catalog/service-runtime.ts` → `server/ai-types/service-runtime.ts`
- `server/catalog-import/*` → `server/ai-types/import/*`

**MODIFIED files (import path updates):**
- `server/db/index.ts` — re-export from new location
- `server/_core/index.ts` — update imports + call boot()
- `server/agents/executor.ts` — update catalog import
- `server/agents/stream.ts` — update catalog import
- `server/providers/init.ts` — update catalog-guard import
- `server/providers/router.ts` — update catalog imports
- `server/providers/catalog-guard.ts` — update catalog imports
- `server/routers/agents.ts` — update catalog imports
- `server/routers/bots.ts` — update catalog imports
- `server/routers/models.ts` — update catalog imports
- `server/routers/conversations.ts` — update catalog imports
- `server/routers.ts` — update import registration
- `server/sandbox-wf/service.ts` — update invoke import
- `server/llm/authority.ts` — update catalog imports
- `server/governance/router.ts` — update catalog imports
- `server/ai-types/index.ts` — update façade

#### Phase 2 — Backend Router + Namespace (5 tasks)
**NEW files:**
- `server/ai-types/router.ts` — main aiTypes tRPC router
- `server/ai-types/catalog-router.ts` — moved from catalog-manage.ts

**MOVED files:**
- `server/routers/catalog-manage.ts` → `server/ai-types/catalog-router.ts`
- `server/routers/catalog-registry.ts` → `server/ai-types/registry-router.ts`

**MODIFIED files:**
- `server/routers.ts` — register aiTypes router
- Client files using `trpc.catalogManage.*` (keep backward aliases OR update)

#### Phase 3 — Taxonomy (3 tasks)
**NEW files:**
- `server/ai-types/taxonomy/router.ts`
- `client/src/pages/ai-types/AITypesTaxonomyPage.tsx`

#### Phase 4 — Relationships + Validation (4 tasks)
**NEW files:**
- `server/ai-types/relationships/router.ts`
- `server/ai-types/validation/router.ts`
- `client/src/pages/ai-types/AITypesRelationshipsPage.tsx`
- `client/src/pages/ai-types/AITypesValidationPage.tsx`

#### Phase 5 — Route Family + Shell (7 tasks)
**NEW files:**
- `client/src/pages/ai-types/AITypesShell.tsx` — Simple IBM Shell layout
- `client/src/pages/ai-types/AITypesOverviewPage.tsx`
- `client/src/pages/ai-types/AITypesControlPanelPage.tsx`
- `client/src/pages/ai-types/AITypesGovernancePage.tsx`
- `client/src/components/ai-types/AITypesSidebar.tsx`

**MODIFIED files:**
- `client/src/pages/AITypesPage.tsx` → becomes `client/src/pages/ai-types/AITypesCatalogPage.tsx`
- `client/src/App.tsx` — update routes from single to shell + sub-routes
- Hamburger menu items — update AI Types entry

#### Phase 6 — Cleanup (6 tasks)
**DELETED:**
- `server/catalog/` directory (all files moved)
- `server/catalog-import/` directory (all files moved)
- `server/routers/catalog-manage.ts` (moved)
- `server/routers/catalog-registry.ts` (moved)

### Risks
1. **High:** 16+ files import from `server/db/catalog.ts` — mass import update in Phase 1
2. **Medium:** tRPC client calls use `catalogManage.*` — need aliases or client update
3. **Medium:** Execution pipeline has 2 test files — must pass after move
4. **Low:** `shared/catalog-*.ts` files stay in place — no client-side breakage

### Implementation Order
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Each phase is independently shippable and testable.

### Validation Plan
- Phase 1: `grep -r "server/catalog/" server/ | grep import` returns 0 results
- Phase 1: `grep -r "server/db/catalog" server/ | grep import` returns only façade re-export
- Phase 2: `trpc.aiTypes.catalog.list` returns same data as `trpc.catalogManage.list`
- Phase 3-5: Pages render, no console errors
- Phase 6: `ls server/catalog/` → directory does not exist

---

## BUILDER EXECUTION ORDER

### Phase 1 — Step-by-step

**Step 1:** Create `server/ai-types/ports.ts`
- Define `ICatalogProviderPort` (getProvider)
- Define `ICatalogAgentPort` (getAgent)
- Define `IGovernancePort` (evaluateStageReview)
- Export setter functions (setProviderPort, setAgentPort, setGovernancePort)

**Step 2:** Create `server/ai-types/boot.ts`
- Import real implementations from providers/agents/governance
- Call setter functions to wire ports
- Export `bootAiTypesModule()` function

**Step 3:** Move `server/db/catalog.ts` → `server/ai-types/db.ts`
- Copy file, update internal imports (drizzle schema paths)
- Update `server/ai-types/index.ts` to re-export all functions
- Update `server/db/index.ts` to re-export from new location (backward compat)

**Step 4:** Move `server/catalog/*.ts` → `server/ai-types/`
- Move execution.ts, invoke.ts, availability.ts, service-runtime.ts
- Move test files alongside
- Update internal imports to use ports.ts instead of direct provider/agent imports

**Step 5:** Move `server/catalog-import/*` → `server/ai-types/import/`
- Move all 5 source files + 1 test file
- Update router registration in routers.ts

**Step 6:** Create `server/ai-types/index.ts` façade
- Re-export all public functions that external code needs
- This is the ONLY import path external code should use

**Step 7:** Update all external consumers (16+ files)
- Change import paths from `../catalog/...` and `../db/catalog` to `../ai-types` or `../ai-types/index`

**Step 8:** Update `server/_core/index.ts`
- Import and call `bootAiTypesModule()`
- Update all catalog-related imports

**Step 9:** Verify
- All imports resolve
- App starts without errors
- Catalog CRUD works
- Existing tests pass

### Phase 2-6
Follow roadmap task tables. Builder implements, Reviewer audits, Tester validates.

---

## GOVERNANCE CHECKPOINTS

Per AGENTS.md, Governance Agent verifies:
- [ ] No cross-module direct DB access (ports pattern enforced)
- [ ] Separation of concerns maintained (AI Types doesn't absorb governance engine)
- [ ] Lifecycle rules preserved (register → validate → publish pipeline intact)
- [ ] Publication/runtime boundaries unchanged
- [ ] No bypass of required control points (10-gate execution pipeline intact)
- [ ] Backward compatibility for existing tRPC clients
