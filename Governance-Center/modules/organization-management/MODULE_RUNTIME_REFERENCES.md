# MODULE_RUNTIME_REFERENCES — Organization Management

## Current Status

**Runtime implementation is live.** Phase 1 core runtime complete. All structural components operational.

## Runtime Components

| Component | Path | Status |
|---|---|---|
| DB Schema (8 tables) | `drizzle/tables/organization-management.ts` | Implemented |
| Lifecycle state machines (7) | `server/organization-management/lifecycle.ts` | Implemented |
| Enforcement guards | `server/organization-management/enforcement.ts` | Implemented |
| Structural validation | `server/organization-management/validation.ts` | Implemented |
| OM authority resolver | `server/organization-management/authority.ts` | Implemented |
| Audit logging | `server/organization-management/audit.ts` | Implemented |
| tRPC Router (10 sub-routers) | `server/organization-management/router.ts` | Implemented |
| Tests (60+) | `server/organization-management/__tests__/om.test.ts` | Implemented |
| Schema export | `drizzle/schema.ts` (re-exports organization-management) | Registered |
| App router | `server/routers.ts` → `organizationManagement` | Registered |
| Module key | `drizzle/tables/workspace-modules.ts` → `MODULE_KEYS` includes `"om"` | Registered |
| Module presets | `server/modules/registry.ts` → team/project/enterprise include `"om"` | Registered |

## API Namespace

All OM procedures live under `organizationManagement.*`:

```
organizationManagement.legalEntities.list          — List legal entities
organizationManagement.legalEntities.get           — Get single entity
organizationManagement.legalEntities.create        — Create entity (governed)
organizationManagement.legalEntities.update        — Update entity (governed)
organizationManagement.legalEntities.changeStatus  — Change status (governed)

organizationManagement.orgUnits.list          — List org units (filterable)
organizationManagement.orgUnits.get           — Get single org unit
organizationManagement.orgUnits.create        — Create org unit (governed)
organizationManagement.orgUnits.update        — Update org unit (governed)
organizationManagement.orgUnits.changeStatus  — Change status (governed)

organizationManagement.jobs.list          — List jobs (filterable by family)
organizationManagement.jobs.get           — Get single job
organizationManagement.jobs.create        — Create job (governed)
organizationManagement.jobs.update        — Update job (governed)
organizationManagement.jobs.changeStatus  — Change status (governed)

organizationManagement.positions.list          — List positions (filterable)
organizationManagement.positions.get           — Get single position
organizationManagement.positions.create        — Create position (governed)
organizationManagement.positions.update        — Update position (governed)
organizationManagement.positions.changeStatus  — Change status (governed)

organizationManagement.reporting.list          — List reporting relationships
organizationManagement.reporting.create        — Create relationship (governed)
organizationManagement.reporting.changeStatus  — Change status (governed)

organizationManagement.costCenters.list          — List cost centers
organizationManagement.costCenters.create        — Create cost center (governed)
organizationManagement.costCenters.update        — Update cost center (governed)
organizationManagement.costCenters.changeStatus  — Change status (governed)

organizationManagement.structureVersions.list    — List versions
organizationManagement.structureVersions.get     — Get single version
organizationManagement.structureVersions.create  — Create draft version (governed)
organizationManagement.structureVersions.publish — Publish version + snapshot (governed)
organizationManagement.structureVersions.archive — Archive version (governed)

organizationManagement.authority.resolve — Resolve authority for actor
organizationManagement.authority.chain   — Get full authority chain for position

organizationManagement.audit.list    — Query audit log
organizationManagement.settings.get  — Get module settings
```

## Cross-Module Integration

| Integration Point | Description | Status |
|---|---|---|
| Workforce Assignment bridge | Authority resolver now delegates to OM when structure exists | Implemented |
| HR module | OM tables separate from HR tables; coexist without conflict | Separated |
| Module registry | `"om"` in MODULE_KEYS; enabled in team/project/enterprise presets | Registered |
| Governance engine | All mutations use `governedProcedure` | Enforced |
| Activity logging | All mutations emit `logActivity()` with `moduleKey: "om"` | Implemented |

## Tables

| Table | Purpose |
|---|---|
| `om_legal_entities` | Companies, subsidiaries, holding structures |
| `om_org_units` | Departments, divisions, teams, business units |
| `om_jobs` | Job definitions with family/level classification |
| `om_positions` | Approved organizational seats |
| `om_reporting_relationships` | Explicit reporting chains (direct/dotted/functional) |
| `om_cost_centers` | Financial responsibility units |
| `om_structure_versions` | Draft/publish/version model for structure snapshots |
| `om_audit_log` | Dedicated audit trail for all OM mutations |
