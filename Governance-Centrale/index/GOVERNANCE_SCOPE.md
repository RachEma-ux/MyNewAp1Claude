# Governance Scope

## Document Status

- **Type:** Governance boundary definition
- **Date:** 2026-03-24
- **Version:** 1.1.0 (Phase 13 — enforcement and compliance)

---

## What Governance-Centrale Covers

### 1. Module Navigation Governance

Governance-Centrale owns the platform standard for how modules define, structure, and govern their navigation configurations. This includes:

- The shared type contract (`client/src/navigation/moduleNavTypes.ts`)
- The module nav standard and governance rules
- The adoption checklist and templates
- Per-module governance packs documenting nav scope, risks, and gaps

### 2. Module Governance Packs

Each module that participates in governance tracking has a governance pack under `modules/<module>/`. A governance pack includes:

- Module governance profile (identity, classification)
- Control surface inventory (APIs, routes, nav items)
- Audit model (what is logged, when, how)
- Risk register
- Open gaps and deferred items
- Runtime references (source-of-truth file map)
- Periodic check checklists

### 3. Platform-Wide Policies

Global policies that apply to all modules are documented under `global/`. Currently:

- Module navigation standard
- Module navigation governance rules
- Module navigation adoption checklist
- Module navigation enforcement policy (Phase 13)
- Module navigation exception registry (Phase 13)
- Module navigation compliance report (Phase 13)

### 4. Templates

Reusable templates for governance artifacts are under `templates/`. These are copy-ready starting points for new module adoption.

---

## What Governance-Centrale Does NOT Cover

| Area | Where It Lives Instead |
|---|---|
| Code implementation | Source files in `client/`, `server/`, `shared/` |
| Database schema | `drizzle/` directory |
| Build configuration | `package.json`, `vite.config.ts`, etc. |
| CI/CD pipelines | `.github/workflows/` |
| Runtime configuration | Environment variables, `.env` files |
| Test execution | Test files co-located with source |
| Agent orchestration rules | `AGENTS.md` (repo root) |
| Architecture layer definitions | `ARCHITECTURE.md` (repo root) |

---

## Governance Boundaries

### Module Boundary

Each module's governance pack is self-contained under `modules/<module>/`. A module governance pack documents only that module's own governance surface. Cross-module dependencies are noted in the module's risk register.

### Standard Boundary

Platform-wide standards in `global/` define rules that all modules must follow. Standards are versioned and changes require governance review.

### Template Boundary

Templates in `templates/` are copy-ready starting points. Modules may extend templates with module-specific fields. Templates do not contain module-specific data.

---

## Current Module Coverage

| Module | Governance Pack | Nav Config | Status |
|---|---|---|---|
| Human Resources | `modules/human-resources/` | `client/src/config/hrNavConfig.ts` | Reference implementation |
| PM Central | `modules/pm-central/` | `client/src/config/pmNavConfig.ts` | Pilot (Phase 11) |
| Automation | `modules/automation/` | `client/src/config/automationNavConfig.ts` | Wave 1 (Phase 12) |

See [MODULE_NAV_ADOPTION_REGISTRY.md](../global/MODULE_NAV_ADOPTION_REGISTRY.md) for the full platform inventory.

---

## Enforcement & Compliance (Phase 13)

### Enforcement

The module-nav standard is enforced via:

- **Enforcement policy:** Defines compliant, partially-compliant, and exempt states
- **Machine validation:** `server/__tests__/module-nav-compliance.test.ts` (runs in `npm test`)
- **Exception registry:** Formal tracking of all deviations from the standard

### Compliance Visibility

- Compliance status is tracked in the code-facing registry (`moduleNavRegistry.ts`)
- A human-readable compliance report is maintained at `global/MODULE_NAV_COMPLIANCE_REPORT.md`
- Future module-nav work must follow governance-first rules (see enforcement policy)

---

## How to Extend This Scope

1. New modules: create a governance pack under `modules/<module>/`
2. New global policies: create a document under `global/` and update the governance index
3. New templates: add to `templates/` and update the governance index
4. Register in `client/src/navigation/moduleNavRegistry.ts` with compliance state
5. If not fully compliant, create an exception in `global/MODULE_NAV_EXCEPTION_REGISTRY.md`
6. Changes to scope itself: update this document and get governance review
