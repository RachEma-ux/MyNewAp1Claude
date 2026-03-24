# HR Phase 6/8 — Stabilization, Testing, and Rollout Readiness

## Document Status

- **Type:** Phase implementation record
- **Module:** Human Resources
- **Phase:** Phase 6/8 — Stabilization & Rollout Readiness
- **Last updated:** 2026-03-24

---

## 1. Phase Objective

Make the HR Carbon SideNav rollout **stable, testable, backward-compatible, governance-aligned, and ready for controlled rollout**.

This phase did not add new HR business capabilities. It stabilized and validated the work from Phases 1-5.

---

## 2. Rollout State Summary

| Metric | Value |
|---|---|
| Canonical nav config | `client/src/config/hrNavConfig.ts` |
| Total sections | 13 |
| Total leaf items | 68 |
| Live items | 32 (existing-page) |
| Placeholder items | 1 (tab-in-existing-page) |
| Not-yet-implemented items | 35 |
| Section landing routes | 13 (all mounted in App.tsx) |
| Flat backward-compat routes | 29 (all preserved in App.tsx) |
| Phase 4 deep routes | 6 (all mounted in App.tsx) |
| Total mounted routes | 48 |
| Route aliases | 28 (all in "documented" status) |
| HR module version | 8.0.0 |

---

## 3. Rollout Control Mechanism

The HR router settings endpoint (`hr.settings.get`) exposes feature flags that control rollout readiness:

| Flag | Value | Purpose |
|---|---|---|
| `carbonSideNavRollout` | `true` | Carbon SideNav grouping is active |
| `navConfigValidation` | `true` | Structural validation of nav config is available |
| `backwardCompatAliases` | `true` | Route alias map is loaded for backward compatibility |

These flags are read-only indicators. The Carbon SideNav is active by default. Rollback would require reverting to a pre-Phase 2 commit — no runtime toggle exists because the old flat sidebar was replaced incrementally across Phases 1-4 with full backward compatibility.

### Why No Runtime Toggle

A runtime toggle was evaluated and rejected because:
1. Both old flat routes AND new section routes coexist — no functionality was removed
2. The sidebar rendering already uses role-aware filtering from the nav config
3. Toggling between two nav systems at runtime would create more instability than it prevents
4. The route alias map provides a documented migration path for future redirect activation

---

## 4. Nav-to-Route Integrity

### Verification Results

| Check | Status |
|---|---|
| All 13 section routes mounted in App.tsx | Pass |
| All 29 flat routes mounted in App.tsx | Pass |
| All 6 Phase 4 deep routes mounted in App.tsx | Pass |
| Section routes mounted BEFORE flat routes (wouter first-match) | Pass |
| Deep routes mounted AFTER flat routes (more specific paths) | Pass |
| Every live item has a valid currentRoute or href | Pass |
| No live item has backedBy = "not-yet-implemented" | Pass |
| All not-started items have backedBy = "not-yet-implemented" | Pass |

### Route Ordering Strategy

wouter uses first-match-wins routing. The App.tsx route order is:

1. Section landing routes (`/hr/workforce-planning`, `/hr/talent-acquisition`, etc.)
2. Flat backward-compatible routes (`/hr/directory`, `/hr/timesheet`, etc.)
3. Phase 4 deep routes (`/hr/workforce-planning/job-architecture`, etc.)
4. HR home catch-all (`/hr`)

This ensures section landings take precedence for grouped paths while flat routes continue to resolve for old bookmarked URLs.

---

## 5. Backward Compatibility

### Strategy

Old flat `/hr/*` routes are **preserved alongside** new hierarchical routes. No routes have been removed or redirected.

### Route Alias Map

`client/src/config/hrRouteAliases.ts` documents 28 backward-compatible route mappings. All are in `"documented"` status — redirect activation is deferred.

| Status | Count |
|---|---|
| documented (redirect not active) | 28 |
| active-redirect | 0 |

### Future Redirect Plan

When redirects are activated:
1. Update alias status from `"documented"` to `"active-redirect"`
2. Add `<Redirect>` components in App.tsx using the alias map
3. Deprecation period: keep both routes working
4. Final: remove old route entries after deprecation

### No Routes Broken

All 29 original flat routes continue to work unchanged. The 13 new section routes and 6 deep routes are additive.

---

## 6. Automated Validation Coverage

### Nav Config Validator (`client/src/config/hrNavConfigValidator.ts`)

Pure validation utility that checks:
- Required fields on every item and section
- Route coherence (live items must have valid routes)
- Governance metadata completeness (scope, masking, audit)
- Section ID uniqueness
- Action string format consistency
- Route alias alignment with nav config sections

Returns structured `ValidationResult` with errors, warnings, and stats.

### Nav Validation Tests (`server/hr/__tests__/hr-nav-validation.test.ts`)

| Suite | Test Count | Coverage |
|---|---|---|
| A. Structural Integrity | 13 | Sections, items, fields, enums, counts |
| B. Route Coherence | 10 | Live routes, section routes, App.tsx mounting, route ordering |
| C. Backward Compatibility | 9 | Alias map, resolvers, deduplication |
| D. Governance Metadata | 8 | Masking, audit, scope, sensitive items |
| E. Role/Visibility Profiles | 7 | Employee, manager, hrbp, admin visibility |
| F. Scope Resolution | 4 | Client scope per role |
| G. Masking Classification | 5 | Masked/unmasked per role |
| H. Rollout Readiness | 5 | Version, feature flags, router composition |
| I. Consistency Layer | 5 | Validator utility, live routes, section routes |
| **Total** | **66** | — |

### Phase 6 Runtime Tests (`server/hr/__tests__/hr-phase6.test.ts`)

| Suite | Coverage |
|---|---|
| checkHrAccess | Permission + masking helper (admin, hrbp, manager, employee) |
| Compensation Router | Masking wiring, field coverage |
| Relations Router | Permission + masking, field coverage |
| Analytics Router | Permission enforcement |
| Seed Data | Enum correctness, numeric field types |
| Lifecycle | Task count bug fix |
| Role Differentiation | Permission matrix per role |
| Audit Coverage | logSensitiveRead, checkHrAccess in routers |
| Talent Masking | maskTalentFields, role-aware masking |
| Self-Service Scope | resolveDataScope in time/leave/performance |
| Frontend Role Gating | HrGate, useHrRole, MainLayout |

---

## 7. Section Landing Pages

All 13 sections have a landing page rendered by `HRSectionLandingPage`:
- Consumes the canonical nav config as source of truth
- Filters child items by user role (via `useHrRole().can()`)
- Shows "Coming soon" badge for not-yet-implemented items
- Shows "No accessible capabilities" empty state when user lacks all permissions
- Links to `currentRoute` (if set) or `href` for live items

---

## 8. Remaining Deferred Items

| Item | Status | Notes |
|---|---|---|
| Route alias redirects | Deferred | All 28 aliases in "documented" status |
| Mixed-scope items without scopeActions | Known gap | 6 live mixed-scope items lack fine-grained scopeActions |
| Runtime nav-mode toggle | Not needed | Backward compatibility makes toggle unnecessary |
| E2E tests | Deferred | No end-to-end tests for full HR workflows |
| Frontend component tests | Deferred | HR pages have no unit tests |
| 35 unimplemented nav items | Deferred | Each requires full governance review before implementation |

---

## 9. Governance Compliance

This phase followed the mandatory AGENTS.md orchestration:

**Planner** — Identified test bugs, governance doc gaps, rollout state
**Builder** — Fixed tests, created stabilization doc, updated governance docs
**Reviewer** — Verified all assertions match actual codebase state
**Tester** — Confirmed no runtime code changes; only tests and docs modified
**Governance** — Verified backward compatibility preserved, no permission/masking/scope weakening
