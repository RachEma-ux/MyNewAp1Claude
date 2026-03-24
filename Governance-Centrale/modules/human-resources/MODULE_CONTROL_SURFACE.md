# HR Module — Control Surface

## Document Status

- **Type:** API, route, and navigation inventory
- **Module:** Human Resources
- **Last updated:** 2026-03-24

---

## 1. Backend Router Surface

### Root HR Router (`server/hr/router.ts`)

The HR module exposes 14 domain sub-routers + 2 config routers under the `hr.*` tRPC namespace:

| Sub-Router | Namespace | Source File | Procedure Level |
|---|---|---|---|
| Directory | `hr.directory.*` | `server/hr/directory/router.ts` | protected + governed |
| Organization | `hr.organization.*` | `server/hr/organization/router.ts` | protected + governed |
| Staffing | `hr.staffing.*` | `server/hr/staffing/router.ts` | protected + governed |
| Recruiting | `hr.recruiting.*` | `server/hr/recruiting/router.ts` | protected + governed |
| Lifecycle | `hr.lifecycle.*` | `server/hr/lifecycle/router.ts` | protected + governed |
| Time | `hr.time.*` | `server/hr/time/router.ts` | protected + governed |
| Learning | `hr.learning.*` | `server/hr/learning/router.ts` | protected + governed |
| Performance | `hr.performance.*` | `server/hr/performance/router.ts` | protected + governed |
| Compensation | `hr.compensation.*` | `server/hr/compensation/router.ts` | protected + governed |
| Relations | `hr.relations.*` | `server/hr/relations/router.ts` | protected + governed |
| Engagement | `hr.engagement.*` | `server/hr/engagement/router.ts` | protected + governed |
| Compliance | `hr.compliance.*` | `server/hr/compliance/router.ts` | protected + governed |
| Analytics | `hr.analytics.*` | `server/hr/analytics/router.ts` | protected + governed |
| Talent | `hr.talent.*` | `server/hr/talent/router.ts` | protected + governed |
| Settings | `hr.settings.*` | `server/hr/router.ts` (inline) | protected + admin |
| Me | `hr.me.*` | `server/hr/router.ts` (inline) | protected |

### Procedure Levels Used

| Level | Used For |
|---|---|
| `protectedProcedure` | All reads, authenticated access |
| `governedProcedure` | Write mutations with policy gate |
| `adminProcedure` | Admin-only operations (seed demo, settings) |

---

## 2. Frontend Route Surface

### Section Landing Routes (13 routes — Phase 2)

| Route | Section ID | Component |
|---|---|---|
| `/hr/workforce-planning` | workforce-planning | HRSectionLandingPage |
| `/hr/talent-acquisition` | talent-acquisition | HRSectionLandingPage |
| `/hr/lifecycle` | onboarding-offboarding | HRSectionLandingPage |
| `/hr/employee-records` | employee-records | HRSectionLandingPage |
| `/hr/compensation-benefits` | compensation-benefits | HRSectionLandingPage |
| `/hr/time-attendance` | time-attendance | HRSectionLandingPage |
| `/hr/learning-development` | learning-development | HRSectionLandingPage |
| `/hr/performance-talent` | performance-talent | HRSectionLandingPage |
| `/hr/employee-relations` | employee-relations | HRSectionLandingPage |
| `/hr/wellbeing-engagement` | wellbeing-engagement | HRSectionLandingPage |
| `/hr/analytics-reporting` | analytics-reporting | HRSectionLandingPage |
| `/hr/security-access` | security-access | HRSectionLandingPage |
| `/hr/compliance` | compliance | HRSectionLandingPage |

### Flat Page Routes (29 routes — existing)

| Route | Page Component | Backend Domain |
|---|---|---|
| `/hr` | HRHomePage | — |
| `/hr/directory` | HRDirectoryPage | directory |
| `/hr/organization` | HROrganizationPage | organization |
| `/hr/positions` | HRPositionsPage | staffing |
| `/hr/staffing` | HRStaffingPage | staffing |
| `/hr/skills` | HRSkillsPage | staffing |
| `/hr/recruitment` | HRRecruitmentPage | recruiting |
| `/hr/onboarding` | HROnboardingPage | lifecycle |
| `/hr/offboarding` | HROffboardingPage | lifecycle |
| `/hr/timesheet` | HRTimesheetPage | time |
| `/hr/leave` | HRLeavePage | time |
| `/hr/overtime` | HROvertimePage | time |
| `/hr/shifts` | HRShiftPlanningPage | time |
| `/hr/training` | HRTrainingPage | learning |
| `/hr/certifications` | HRCertificationsPage | learning |
| `/hr/goals` | HRGoalsPage | performance |
| `/hr/reviews` | HRPerformanceReviewsPage | performance |
| `/hr/compensation` | HRCompensationPage | compensation |
| `/hr/benefits` | HRBenefitsPage | compensation |
| `/hr/policies` | HRPoliciesPage | relations |
| `/hr/grievances` | HRGrievancesPage | relations |
| `/hr/surveys` | HRSurveysPage | engagement |
| `/hr/engagement` | HREngagementPage | engagement |
| `/hr/incidents` | HRIncidentsPage | compliance |
| `/hr/compliance-mgmt` | HRComplianceMgmtPage | compliance |
| `/hr/analytics` | HRAnalyticsDashboardPage | analytics |
| `/hr/talent` | HRTalentPage | talent |
| `/hr/reports` | HRReportsPage | analytics |
| `/hr/settings` | HRSettingsPage | analytics |

### Phase 4 Deep Routes (6 routes)

| Route | Page Component | Backend Domain |
|---|---|---|
| `/hr/workforce-planning/job-architecture` | HRJobArchitecturePage | organization |
| `/hr/employee-records/work-permits` | HRWorkPermitsPage | compliance |
| `/hr/employee-records/letters-certificates` | HRLettersCertificatesPage | directory |
| `/hr/compliance/risk-management` | HRRiskManagementPage | compliance |
| `/hr/security-access/audit-logs` | HRAuditLogsPage | analytics |
| `/hr/security-access/access-controls` | HRAccessControlsPage | analytics |

### Route Totals

| Category | Count |
|---|---|
| Section landing routes | 13 |
| Flat page routes | 29 |
| Phase 4 deep routes | 6 |
| **Total mounted routes** | **48** |

---

## 3. Navigation Surface (Carbon SideNav)

### Canonical Source

`client/src/config/hrNavConfig.ts`

### Structure

- **13 sections** with purpose, icon, required action, visibility mode
- **68 leaf items** with full governance metadata per item

### Implementation Status Breakdown

| Status | Count | Percentage |
|---|---|---|
| `existing-page` (live) | 32 | 47% |
| `tab-in-existing-page` (placeholder) | 1 | 1% |
| `not-yet-implemented` | 35 | 52% |
| **Total** | **68** | 100% |

### Nav-to-Capability Mapping

Full mapping documented in [hr-nav-architecture.md](hr-nav-architecture.md), Section 2.

### Visibility Mode Distribution

| Mode | Count | Behavior |
|---|---|---|
| `show` | 13 items | Always visible (self-service) |
| `hide-if-no-access` | 55 items | Hidden if user lacks permission |
| `show-disabled` | 0 items | Currently unused |
| `redirect-to-parent` | 0 items | Currently unused |

### Scope Type Distribution

| Scope | Count |
|---|---|
| `self` | 4 |
| `team` | 0 |
| `all` | 25 |
| `sensitive` | 20 |
| `mixed` | 19 |

---

## 4. Route Compatibility Layer

### Strategy

Old flat routes (`/hr/directory`, `/hr/compensation`, etc.) coexist with new hierarchical routes (`/hr/workforce-planning`, `/hr/employee-records/work-permits`).

### Route Alias Map

`client/src/config/hrRouteAliases.ts` documents 28 backward-compatible route mappings. All aliases are in `"documented"` status — redirect activation is deferred.

### Migration Plan

1. Phase 1-3: Old routes stay mounted, new section routes added alongside
2. Future: Old routes converted to `<Redirect>` components using alias map
3. Final: Old route entries removed after deprecation period

### No Routes Broken

No existing routes have been removed or modified. All 29 original flat routes continue to work.

---

## 5. Client-Side Authorization Layer

### Source

`client/src/lib/hrNavAuth.ts`

### Functions

11 exported pure functions for nav visibility and scope resolution. These operate on the nav config + user's allowed actions — no backend calls.

| Function | Purpose |
|---|---|
| `resolveItemVisibility()` | Determine if nav item is visible/disabled |
| `resolveSectionVisibility()` | Determine if section should appear |
| `getVisibleSections()` | Get all visible sections with filtered items |
| `getVisibleItemsForSection()` | Get visible items in a specific section |
| `canAccessRoute()` | Check if user can access a route path |
| `wouldSeeMaskedData()` | Check if user would see masked fields |
| `getMaskedItemsForUser()` | Get accessible items with masked fields |
| `getUnmaskedItemsForUser()` | Get items with full data access |
| `resolveClientScope()` | Determine client-side scope |
| `getSectionAccessSummaries()` | Per-section access summary |
| `getItemScopeInfo()` | Detailed scope/masking info for an item |

---

## 6. Nav Config Validation Layer (Phase 8)

### Source

`client/src/config/hrNavConfigValidator.ts`

### Functions

3 exported functions for structural and governance integrity validation.

| Function | Purpose |
|---|---|
| `validateHrNavConfig()` | Run all validation checks, return errors/warnings/stats |
| `getLiveRoutes()` | Get all live items with their resolved route paths |
| `getSectionRoutes()` | Get all section landing route paths |

### Validation Categories

| Category | Checks Performed |
|---|---|
| `missing-field` | Required fields on sections and items |
| `invalid-value` | Enum membership, action format, route prefix |
| `route-coherence` | Live items have valid routes, backedBy alignment |
| `duplicate` | Section and item ID uniqueness |
| `alias-mismatch` | Route aliases target existing sections |
| `governance-metadata` | Masking ↔ fieldSet, scope ↔ scopeActions coherence |

---

## 7. Automated Test Surface (Phase 8)

### Source

`server/hr/__tests__/hr-nav-validation.test.ts`

### Test Groups

| Group | Focus | Assertions |
|---|---|---|
| A | Structural integrity | 13 sections, 68 items, field completeness, enum validity |
| B | Route coherence | App.tsx mounting, route ordering, section alignment |
| C | Backward compatibility | 28 aliases, resolve helpers, section targeting |
| D | Governance metadata | Masking ↔ fieldSet, audit ↔ sensitiveAction, scope coherence |
| E | Role/visibility profiles | Per-role visibility for employee, manager, hrbp, admin |
| F | Scope resolution | Client-side scope per role (self, team, all, none) |
| G | Masking classification | Per-role masking for compensation, relations, talent |
| H | Rollout readiness | Feature flags, version, router composition |
| I | Validation utility | Self-test of validateHrNavConfig() |
