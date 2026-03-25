# MODULE_RUNTIME_REFERENCES — Culture Values

## Purpose

Maps the Culture Values governance domain to current runtime locations and integration paths.

---

## Current State

Culture Values is now a **first-class runtime module** (module key: `cv`).

---

## Runtime Locations

### Schema
- `drizzle/tables/culture-values.ts` — 7 tables (cvValueSets, cvValueDefinitions, cvBehaviorModels, cvNonNegotiables, cvValueTranslations, cvOperationalization, cvAuditLog)

### Server
- `server/culture-values/router.ts` — tRPC router with 8 sub-routers (valueSets, definitions, behaviors, nonNegotiables, translations, operationalization, audit, settings)
- `server/culture-values/lifecycle.ts` — ValueSet and ValueDef state machines
- `server/culture-values/validation.ts` — Publish readiness validation (3–7 values, behavior coverage, translation coverage)
- `server/culture-values/audit.ts` — Dedicated CV audit logging with 18 action types

### Frontend
- `client/src/pages/culture-values/CVPortfolioPage.tsx` — Overview, stats, health checks, value set list
- `client/src/pages/culture-values/CVWizardPage.tsx` — 6-step value definition wizard
- `client/src/pages/culture-values/CVSettingsPage.tsx` — Module feature flags
- `client/src/components/wizard/ModuleWizardShell.tsx` — Shared wizard framework (UI-only, no domain logic)

### Tests
- `server/culture-values/__tests__/cv.test.ts` — Lifecycle, validation, step flow, draft persistence tests

---

## Routes

- `/w/:workspaceId/cv` — CV Portfolio
- `/w/:workspaceId/cv/wizard` — Values Definition Wizard
- `/w/:workspaceId/cv/settings` — CV Settings

---

## Integration Points

### HR
- hiring (future — values-based screening)
- performance (future — values-aligned reviews)
- feedback (future — 360 with value markers)

### PM Central
- delivery behavior (future — project-level value expectations)
- project standards (future — values-driven conduct)

### Workspace
- execution norms (future — workspace-level values guidance)

### Governance
- enforcement hooks (future — governance engine integration)

---

## Module Registration

- Module key: `cv`
- Registered in: `drizzle/tables/workspace-modules.ts` (MODULE_KEYS)
- Presets: team, project, enterprise (`server/modules/registry.ts`)
- Router: `server/routers.ts` → `cultureValues`

---

## Notes

This file reflects Phase 1 runtime implementation. Integration points marked "future" will be addressed in subsequent phases.
