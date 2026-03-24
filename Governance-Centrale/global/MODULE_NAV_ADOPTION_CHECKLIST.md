# Module Navigation — Adoption Checklist

## Document Status

- **Type:** Platform-wide adoption guide
- **Date:** 2026-03-24
- **Version:** 1.0.0
- **Reference:** HR Carbon SideNav (Phases 1-10)

---

## Prerequisites

- [ ] Read `Governance-Centrale/global/MODULE_NAV_STANDARD.md`
- [ ] Read `Governance-Centrale/global/MODULE_NAV_GOVERNANCE_RULES.md`
- [ ] Review the HR reference implementation: `client/src/config/hrNavConfig.ts`
- [ ] Review `client/src/config/moduleNavTypes.ts` (shared contract)

---

## Phase 1: Governance Analysis

- [ ] Identify all capabilities the module should expose through navigation
- [ ] Group capabilities into purpose-driven sections (4-15 sections recommended)
- [ ] Define permission actions for every section and item (`<module>.<domain>.<operation>`)
- [ ] Classify scope for every item (self/team/all/sensitive/mixed)
- [ ] Determine visibility mode for every item
- [ ] Identify which items need field masking
- [ ] Identify which items trigger sensitive-read audit
- [ ] Determine implementation status for every item (live vs. deferred)
- [ ] Document open gaps and risks
- [ ] Fill out `MODULE_NAV_GOVERNANCE_REVIEW.template.md`
- [ ] Get governance review approval

---

## Phase 2: Nav Config Implementation

- [ ] Create the canonical nav config file (e.g., `client/src/config/<module>NavConfig.ts`)
- [ ] Import shared types from `client/src/config/moduleNavTypes.ts`
- [ ] Define module-specific type extensions if needed (e.g., masking field sets)
- [ ] Export the config as a single const
- [ ] Export derived helper functions (getAllItems, getByStatus, etc.)
- [ ] Verify the config conforms to `ModuleNavConfig` interface shape

---

## Phase 3: Route Setup

- [ ] Define section landing routes in `App.tsx`
- [ ] Mount section landing page component for each section
- [ ] If migrating from flat routes, create a route alias map
- [ ] Ensure all old routes remain mounted (backward compatibility)
- [ ] Mount section routes BEFORE flat routes (wouter first-match-wins)
- [ ] Verify deep routes are mounted AFTER flat routes

---

## Phase 4: Permission & Visibility Layer

- [ ] Define module role matrix (at minimum: basic user, manager, admin)
- [ ] Define module action constants
- [ ] Implement client-side auth helpers (following `hrNavAuth.ts` pattern)
- [ ] Implement `resolveItemVisibility()` for the module
- [ ] Implement `resolveSectionVisibility()` for the module
- [ ] Implement `getVisibleSections()` and `getVisibleItemsForSection()`
- [ ] Verify admin sees all items, basic user sees only self-service items

---

## Phase 5: Masking & Audit (if applicable)

- [ ] Define masking field sets for the module
- [ ] Implement masking functions on the backend
- [ ] Implement sensitive-read audit logging for sensitive items
- [ ] Verify masking coherence: `maskingRequired` items have masking functions
- [ ] Verify audit coherence: `sensitiveReadAudit` items have `sensitiveAction`

---

## Phase 6: Validation & Testing

- [ ] Run `validateModuleNavConfig()` against the module config — must pass with zero errors
- [ ] Add structural integrity tests (section count, item count, unique IDs)
- [ ] Add route coherence tests (live items have routes)
- [ ] Add backward compatibility tests (old routes preserved)
- [ ] Add governance metadata tests (scope, masking, visibility completeness)
- [ ] Add role/visibility profile tests (per-role visibility behavior)
- [ ] Add config-to-reality tests (page files exist for live items)

---

## Phase 7: Governance Documentation

- [ ] Create `Governance-Centrale/modules/<module>/README.md`
- [ ] Create `Governance-Centrale/modules/<module>/MODULE_GOVERNANCE_PROFILE.md`
- [ ] Create `Governance-Centrale/modules/<module>/MODULE_CONTROL_SURFACE.md`
- [ ] Create `Governance-Centrale/modules/<module>/MODULE_RISKS.md`
- [ ] Create `Governance-Centrale/modules/<module>/MODULE_OPEN_GAPS.md`
- [ ] Update `Governance-Centrale/index/GOVERNANCE_INDEX.md`
- [ ] Update `Governance-Centrale/README.md`

---

## Phase 8: Final Review

- [ ] Run full test suite — all tests pass
- [ ] Reviewer agent pass — implementation matches plan
- [ ] Governance agent pass — no policy violations
- [ ] Update module version in router settings
- [ ] Document acceptance status

---

## Post-Adoption Maintenance

- [ ] Any nav config changes follow the governance-first rule
- [ ] Material changes trigger governance review
- [ ] Governance-Centrale module pack is kept in sync
- [ ] Tests are updated when nav config changes
- [ ] Open gaps are tracked and honestly reported
