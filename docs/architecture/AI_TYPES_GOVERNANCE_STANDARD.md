# AI Types Governance Standard (LOCKED)

This document is the authoritative contract for authority boundaries across
AI Types, Domain entities, Catalog, and Security. All implementation must
conform to these rules. Violations must be rejected by Governance review.

---

## 1. Authority Model

### 1.1 AI Types — Orchestration Shell

AI Types is the **orchestration shell**. It coordinates, visualizes, and launches
but it is NOT the final authority on lifecycle or availability.

AI Types owns:
- Cross-type visibility (overview, relationships, dependency graph)
- Taxonomy management (classification, seeding)
- Validation scanning (completeness, consistency)
- Health dashboards (control panel)
- Admin maintenance actions (repair, sync, refresh)
- Launching correct domain creation flows

AI Types does NOT own:
- Domain entity creation logic (belongs to domain routers)
- Lifecycle state transitions (belongs to Catalog)
- Runtime availability decisions (belongs to Catalog)
- Full CRUD for individual entity types (belongs to domain routers)

### 1.2 Domain Routers — Creation and Lifecycle Logic

Each AI entity type has a dedicated domain router that owns creation and
type-specific lifecycle logic:

| Entity Type | Domain Router | Domain Table |
|-------------|---------------|--------------|
| Provider | `server/providers/router.ts` | `providers` |
| LLM | `server/routers/llm.ts` | `ai_type_llms` |
| Model | `server/routers/models.ts` | `ai_type_models` |
| Agent | `server/routers/agents.ts` | `agents` |
| Bot | `server/routers/bots.ts` | `bots` |

Domain routers own:
- Entity creation (INSERT to domain table)
- Type-specific field validation
- Type-specific lifecycle checks (e.g., agent governed-promotion)
- Type-specific configuration management

### 1.3 Catalog — Approval, Activation, Publish, Availability

Catalog (`server/routers/catalog-manage.ts`) is the **final authority** on:
- Intake (catalog entry creation/projection from domain)
- Review state (`needs_review` → `approved` → `rejected`)
- Stage reviews (`register`, `validate`, `publish`)
- Activation (`draft` → `active`)
- Publishing (immutable snapshot bundles)
- Recall (bundle withdrawal)
- **Runtime availability** — an asset is available for app use if and only if:
  `status === "active" AND reviewState === "approved"`
  (defined in `server/ai-types/availability.ts`)

### 1.4 Security — Deny-by-Default

Every mutation flows through the governance middleware stack:

| Procedure Type | Auth Level | Use Case |
|----------------|-----------|----------|
| `publicProcedure` | None | Health checks, static data |
| `protectedProcedure` | Logged in | Read operations |
| `governedProcedure` | Logged in + governance gate | Standard mutations |
| `adminProcedure` | Admin role | Admin-only reads/ops |
| `governedAdminProcedure` | Admin + governance gate | Authority ops (approve, publish, activate) |

The governance middleware (`requireGovernance` in `server/_core/trpc.ts`):
1. Checks system-wide freeze (`isFrozen`)
2. Resolves action key from tRPC path
3. Evaluates governance gate (policy engine, evidence, approvals)
4. Blocks if not allowed

---

## 2. Creation Path Contract

### 2.1 Preferred Path: Domain Write First → Catalog Projection Second

```
Caller → Domain Router (create entity in domain table)
       → AI Types Service (project to catalog_entries)
       → Catalog entry exists with sourceType + sourceId linkage
```

This is implemented in `server/ai-types/service.ts`:
- `createModel()` → writes to `ai_type_models` → calls `projectToCatalog()`
- `createLlm()` → writes to `ai_type_llms` → calls `projectToCatalog()`
- `createProviderWithProjection()` → writes to `providers` → calls `projectToCatalog()`

For agents and bots, the domain router (`agents.ts`, `bots.ts`) owns creation,
and catalog intake happens via import or projection.

### 2.2 Transitional: Direct Catalog-First Authoring

`catalogManageRouter.create` currently supports direct catalog entry creation
for providers and bots (where domain tables are pre-existing). For model/llm,
it calls domain-first and falls back to direct catalog write on failure.

**This fallback path is transitional.** The preferred path is always
domain-first. The fallback exists to avoid breaking existing flows during
migration but must not become the standard authoring path.

### 2.3 Forbidden: AI Types as Creation Bypass

AI Types must never provide a creation path that bypasses domain routers
and writes directly to catalog. AI Types orchestration endpoints should
launch users to the correct domain creation flow, not duplicate it.

---

## 3. Lifecycle Stage Chain

The creation-to-availability chain for all AI entity types follows this
order. Not all types require all stages, but no type may skip stages.

```
1. Domain Create        → entity exists in domain table
2. Catalog Projection   → catalog_entries row with sourceType/sourceId
3. Registration Review  → stageReviews.register = "approved"
4. Activation           → status = "active" (requires register approved)
5. Validation           → validationStatus = "passed"
6. Validation Review    → stageReviews.validate = "approved"
7. Publication          → immutable snapshot bundle created
8. Publication Review   → stageReviews.publish = "approved"
9. Available            → status=active + reviewState=approved
```

**No direct jump from creation to available.** Every asset must pass
through at minimum: create → register review → activation.

---

## 4. Invariants (Non-Negotiable)

1. **Catalog owns runtime availability.** No module may declare an asset
   "available for runtime" without Catalog confirming
   `status=active AND reviewState=approved`.

2. **Domain writes first.** New entities are created in their domain table
   before appearing in catalog. Catalog-only writes are legacy fallback.

3. **AI Types does not duplicate domain CRUD.** The orchestration shell
   reads and aggregates — it does not maintain parallel CRUD stacks.

4. **Security is deny-by-default.** Every mutation requires at minimum
   `governedProcedure`. Authority operations require `governedAdminProcedure`.

5. **Audit is blocking.** Governance transitions (approve, activate, publish,
   recall) persist audit events before returning to the caller.

6. **Provenance must survive projection.** When a domain entity projects to
   catalog, the `sourceType` and `sourceId` fields must be set so the
   catalog entry can be traced back to its domain origin.

7. **Stage reviews are irreversible.** Once a stage is approved, it cannot
   be re-approved. Each stage can only be approved once per entry version.

8. **Freeze blocks all governed mutations.** When `isFrozen(0)` returns
   true, all `governedProcedure` and `governedAdminProcedure` mutations
   are blocked immediately.

---

## 5. Module Boundary Rules

```
server/ai-types/        → INTERNAL: domain service, types, projection
server/routers/          → API: catalog-manage, domain routers
server/governance/       → GOVERNANCE: gates, stage review, audit
server/providers/        → DOMAIN: provider registry, lifecycle
shared/                  → CROSS-CUTTING: types, constants, lifecycle helpers
```

**Other modules MUST NOT:**
- Import from `server/ai-types/` (except through the tRPC router)
- Query `ai_type_models` or `ai_type_llms` directly
- Write to domain tables outside the AI Types service
- Create catalog entries without going through the proper creation path

**Other modules SHOULD:**
- Read from `catalog_entries` via `server/db/catalog.ts`
- Use `catalogManage.available` for runtime-available assets
- Use domain routers for entity-specific operations

---

## 6. Referenced By

This document is referenced by:
- `docs/architecture/README.md`
- `server/ai-types/availability.ts` (governance contract header)
- `server/routers/catalog-manage.ts` (governance contract header)
- `server/ai-types/service.ts` (boundary comment)

Any code file with a `GOVERNANCE CONTRACT (LOCKED)` header comment
must conform to this standard.
