# Module Nav Wave Plan

## Document Status

- **Type:** Platform-wide rollout plan
- **Date:** 2026-03-24
- **Last updated:** Phase 12

---

## Wave Timeline

### Completed

| Wave | Phase | Modules | Status |
|---|---|---|---|
| Reference | 1-10 | Human Resources | Complete |
| Pilot | 11 | PM Central | Complete |
| Wave 1 | 12 | Automation | Complete |

### Planned

| Wave | Target | Candidates | Notes |
|---|---|---|---|
| Wave 2 | Phase 13+ | Digital HQ, Governance Center | Low effort, clear structures |
| Wave 3 | Phase 14+ | AI Types | Complex multi-level nav, needs careful design |

---

## Wave Selection Criteria

Modules are selected for each wave based on:

1. **Visibility**: Module is visible in the app sidebar with a meaningful nav structure
2. **Route maturity**: Module has existing routes and page components
3. **Section fit**: Module naturally groups into purpose-driven sections
4. **Backend independence**: Module can adopt the standard without backend redesign
5. **Risk level**: Module does not handle PII or require complex masking (for early waves)
6. **Cross-domain proof**: Module represents a different domain than prior adoptions

## Wave 1 Selection Rationale (Automation)

Automation was selected as the Wave 1 module because:

- **7 existing live routes** — all functional, no new pages needed
- **3 natural sections** — Workflows, Components, Configuration
- **No PII** — simplest possible governance model
- **Different domain** — proves the standard works beyond people management (HR) and project management (PM Central)
- **No backend impact** — purely frontend nav structure
- **Good section boundaries** — clear separation between workflow execution, component stores, and configuration

## Deferred Modules

| Module | Reason for Deferral |
|---|---|
| Infrastructure | Placeholder pages (software/item1-7), no real domain logic |
| WS Sandbox | Small surface (5 items), lower organizational priority |
| Communication | Only 3 items, too small for section-based nav benefit |
| Wiki | Single-page module with content-based sub-routing |
| Resources | Single-page monitor |
