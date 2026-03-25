# MODULE_OPEN_GAPS — Organization Management

## Purpose

Documents the current gaps for OM governance and implementation.

## Gaps

### G1 — ~~No runtime module yet~~ — RESOLVED
- **Status:** Implemented (Phase 1).
- **What exists:**
  - Schema: `drizzle/tables/organization-management.ts` — 8 tables (legal entities, org units, jobs, positions, reporting, cost centers, structure versions, audit log)
  - Lifecycle: `server/organization-management/lifecycle.ts` — 7 state machines
  - Enforcement: `server/organization-management/enforcement.ts` — acyclic hierarchy, frozen/closed guards
  - Validation: `server/organization-management/validation.ts` — cross-entity reference integrity
  - Authority: `server/organization-management/authority.ts` — OM hierarchy resolver
  - Audit: `server/organization-management/audit.ts` — 27 audit actions
  - Router: `server/organization-management/router.ts` — 10 sub-routers with CRUD + lifecycle
  - Tests: `server/organization-management/__tests__/om.test.ts` — 60+ test cases
- **Registered:** `organizationManagementRouter` in `server/routers.ts`, module key `"om"` in MODULE_KEYS

### G2 — ~~HR currently hosts OM-like capabilities~~ — MITIGATED
- **Status:** Mitigated. OM now has its own tables separate from HR.
- **Existing HR tables** (`hr_org_units`, `hr_job_families`, etc.) remain in HR.
- **OM tables** (`om_org_units`, `om_jobs`, `om_positions`, etc.) are OM-owned.
- **Migration:** Not yet performed. Both sets coexist. Future: HR consumers migrate to OM read-models.

### G3 — ~~No authority-chain enforcement yet~~ — RESOLVED
- **Status:** Implemented.
- **What exists:** `resolveOmAuthority()` walks reporting chain from target position upward.
- **Integration:** Workforce assignment bridge now delegates to OM authority when structure exists.
- **Fallback:** Role-based authority when no OM structure is defined for the workspace.

### G4 — ~~No bridge integration~~ — RESOLVED
- **Status:** Resolved. Bridge was implemented in Workforce Assignment Phase 4.
- **OM integration:** Authority resolver now used by bridge approval workflow.

### G5 — ~~No audit implementation~~ — RESOLVED
- **Status:** Implemented.
- **What exists:** `logOmAudit()` with 27 action types, dedicated `om_audit_log` table.

### G6 — No UI surfaces for OM
- **Status:** Not yet implemented.
- **What is needed:** Position / Job / Org Unit dedicated management pages under OM module.
- **Expected:** Phase 3 (Management Surfaces) of OM implementation.

### G7 — Migration from HR to OM
- **Status:** Not yet started.
- **What is needed:** Strategy to migrate HR consumers from `hr_org_units`/`hr_positions` to OM read-models.
- **Constraint:** Must not break existing HR flows during transition.
- **Approach:** OM provides read-only views; HR gradually switches to OM as source of structural truth.

## Status

G1-G5 resolved. G6 (UI) and G7 (migration) remain open and deferred to future phases.
