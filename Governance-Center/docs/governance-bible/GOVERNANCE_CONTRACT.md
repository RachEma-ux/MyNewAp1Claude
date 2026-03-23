# Governance Contract — AI Types System

| Field   | Value |
|---------|-------|
| **Status**  | LOCKED |
| **Version** | v1.0.0 |
| **Scope**   | All AI Types (Agents, LLMs, Models, Bots, Providers) |
| **Authority** | This contract is binding. Violations block merge. |

---

## 1. Formal Invariants

### INV-1: Catalog Intake Ownership
The Catalog is the sole owner of `catalog_entries` creation. Only `server/routers/catalog-manage.ts` (and its startup helpers `syncRegistryOnStartup`, `autoDetectLiveModels`) may call `createCatalogEntry()`.

### INV-2: Domain Separation
Domain routers (`agents.ts`, `llm.ts`, `models.ts`, `bots.ts`, `llm-providers.ts`) create and manage domain entities in their own tables. They do NOT create `catalog_entries` rows directly. They expose `importToCatalog` mutations that delegate to the Catalog.

### INV-3: Lifecycle Authority
Lifecycle transitions (approve, reject, activate, publish, recall) are exclusively handled by the `catalog-manage` router's authority endpoints (`approve`, `reject`, `activate`, `publish`, `recall`). No other module may change `reviewState` or `status` on catalog entries.

### INV-4: Runtime Authority
Runtime availability is determined exclusively by the shared authority module `server/catalog/availability.ts`. The rule is:
```
status === "active" AND reviewState === "approved"
```
No code may inline this condition or use alternative availability logic.

### INV-5: Shared Availability Helper
All code paths that check availability MUST use one of:
- `checkCatalogAvailability()`
- `isCatalogEntryAvailableForAppUse()`
- `CATALOG_AVAILABILITY_FILTERS`

from `server/catalog/availability.ts`.

### INV-6: Blocking Audit
All governance mutations (create, approve, reject, activate, publish, recall) MUST produce a blocking audit event via the `audit()` helper in `catalog-manage.ts`.

### INV-7: Immutable Bundles
Published bundles are immutable snapshots. Once created by the `publish` endpoint, a bundle's `snapshot` and `snapshotHash` must never be modified. The only valid state change is `recall`.

### INV-8: Governed Mutations
All mutation endpoints in domain routers and the catalog router MUST use `governedProcedure` (or `governedAdminProcedure` for authority operations). Plain `protectedProcedure` is allowed only for read operations.

---

## 2. Allowed Patterns

| Pattern | Where | Example |
|---------|-------|---------|
| Domain creates entity in own table | Domain routers | `agents.ts` creates row in `agents` table |
| Domain computes deployable status | Domain routers | Model status = "ready" means deployable |
| Domain exposes `importToCatalog` | Domain routers | Creates catalog candidate via catalog-manage |
| Catalog creates `catalog_entries` | `catalog-manage.ts` | `createCatalogEntry()` call |
| Catalog manages lifecycle | `catalog-manage.ts` | `approve`, `activate`, `publish` endpoints |
| Availability check via shared module | Any runtime code | `isCatalogEntryAvailableForAppUse(entry)` |
| App-usage selector via `available` endpoint | Frontend pickers | `trpc.catalogManage.available.useQuery()` |

---

## 3. Forbidden Patterns

| Pattern | Why It Violates | Invariant |
|---------|-----------------|-----------|
| `createCatalogEntry()` inside `agents.ts` | Domain must not create catalog entries | INV-1, INV-2 |
| `createCatalogEntry()` inside `models.ts` | Domain must not create catalog entries | INV-1, INV-2 |
| `createCatalogEntry()` inside `bots.ts` | Domain must not create catalog entries | INV-1, INV-2 |
| `createCatalogEntry()` inside `llm.ts` | Domain must not create catalog entries | INV-1, INV-2 |
| `status === "active"` without availability helper | Inlined availability check bypasses authority | INV-4, INV-5 |
| `reviewState === "approved"` without availability helper | Inlined availability check bypasses authority | INV-4, INV-5 |
| Direct import of provider SDK in agents/automation | Bypasses provider abstraction layer | Architecture boundary |
| Mutation using `protectedProcedure` instead of `governedProcedure` | Bypasses governance middleware | INV-8 |
| Modifying bundle snapshot after creation | Violates immutability guarantee | INV-7 |

---

## 4. Test Suite Enforcement

The following test suite validates these invariants against a real PostgreSQL database:

```
tests/integration/runtime-db/
  catalog-availability.db.test.ts    — Exhaustive 4x3 status/reviewState matrix
  catalog-lifecycle.db.test.ts       — Full lifecycle progression to availability
  runtime-authority.db.test.ts       — Runtime resolution, lineage, bundles
  helpers/db-harness.ts              — Shared test infrastructure
```

### What the tests verify:
- Every combination of `status` x `reviewState` produces the correct availability result
- Availability toggles correctly as entries move through states
- All five AI Type domains use the same availability rule
- `CATALOG_AVAILABILITY_FILTERS` returns only truly available entries
- Full lifecycle (draft -> approved -> published -> active -> available) works end-to-end
- Rejected entries are never available, even if force-activated
- Deprecated/disabled entries lose availability
- Bundle creation and supersession work correctly
- Version tracking creates proper records
- Deleted entries disappear from availability queries

### CI enforcement:
- Tests run in `.github/workflows/run-tests.yml` with a PostgreSQL service
- Failing any test blocks the pipeline

---

## 5. Static Analysis Enforcement

The script `scripts/governance/check-invariants.ts` scans source code for forbidden patterns:

1. `createCatalogEntry` calls in domain routers (violates INV-1, INV-2)
2. Inlined `status === "active"` checks in runtime paths without using the shared helper (violates INV-4, INV-5)
3. Direct provider SDK imports in agents/automation (architecture boundary violation)

This script runs in CI and fails the build on any violation.

---

## 6. Violation Examples

### Example A: Direct catalog entry creation in domain router

```typescript
// VIOLATION in server/routers/agents.ts
import { createCatalogEntry } from "../db";

// This is FORBIDDEN — agents router must NOT create catalog entries
const entry = await createCatalogEntry({ ... });
```

**Fix**: Use `importToCatalog` pattern that delegates to catalog-manage.

### Example B: Inlined availability check

```typescript
// VIOLATION — bypasses shared authority
const available = entries.filter(e => e.status === "active" && e.reviewState === "approved");
```

**Fix**: Use the shared helper:
```typescript
import { CATALOG_AVAILABILITY_FILTERS } from "../catalog/availability";
const available = await getCatalogEntries({ ...CATALOG_AVAILABILITY_FILTERS });
```

### Example C: Missing governed procedure

```typescript
// VIOLATION — mutation without governance middleware
update: protectedProcedure
  .input(...)
  .mutation(async ({ input }) => { ... });
```

**Fix**: Use `governedProcedure`:
```typescript
update: governedProcedure
  .input(...)
  .mutation(async ({ input }) => { ... });
```

---

## 7. Contract Enforcement Summary

| Mechanism | Scope | Blocks Merge |
|-----------|-------|-------------|
| Runtime DB tests | Availability, lifecycle, runtime authority | Yes |
| Static guard script | Forbidden code patterns | Yes |
| Governance gate CI | Architecture boundaries, secrets, eval | Yes |
| PR template | Governance impact disclosure | No (advisory) |
| Review guidelines | Human review criteria | No (advisory) |
| Contract headers in code | Developer awareness | No (advisory) |

---

This contract is permanent. Weakening any invariant requires explicit architectural review and amendment of this document.
