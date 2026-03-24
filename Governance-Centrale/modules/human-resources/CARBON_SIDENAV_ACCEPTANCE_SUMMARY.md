# HR Carbon SideNav — Final Acceptance Summary

## Document Status

- **Type:** Phase 9 rollout acceptance artifact
- **Module:** Human Resources
- **Date:** 2026-03-24
- **Version:** 9.0.0
- **Status:** Accepted for rollout at current scope — operationalization complete

---

## 1. Executive Summary

The HR Carbon SideNav rollout is **accepted** at the following scope:

- **13 sections** defined, all with at least one live capability
- **33 of 68 nav items** backed by real surfaces (32 live + 1 placeholder)
- **35 items** honestly deferred as "not-yet-implemented" — shown as "Coming soon" in section landing pages
- **48 total routes** mounted in App.tsx (13 section landing + 29 flat + 6 deep)
- **28 backward-compatible route aliases** documented, redirect activation deferred
- **All old flat `/hr/*` routes preserved** — no breakage
- **Full permission/visibility/scope/masking governance model** operational
- **~250 automated test assertions** across 9 test files covering all phases
- **Nav drift detection** — frozen baseline with automated comparison tests
- **Operational observability** — lightweight, privacy-safe navigation signal tracking
- **Dead-end/deferred UX improvements** — sorted cards, contextual guidance, section summaries

---

## 2. What Is Implemented

### 2.1 Navigation Infrastructure

| Component | Status | Source |
|---|---|---|
| Canonical nav config (13 sections, 68 items) | Live | `client/src/config/hrNavConfig.ts` |
| Nav config structural validator | Live | `client/src/config/hrNavConfigValidator.ts` |
| Route backward-compatibility map (28 aliases) | Documented | `client/src/config/hrRouteAliases.ts` |
| Client-side authorization helpers (11 functions) | Live | `client/src/lib/hrNavAuth.ts` |
| React hook for role/permission access | Live | `client/src/hooks/useHrRole.ts` |
| Section landing page (reusable for all 13 sections) | Live | `client/src/pages/hr/HRSectionLandingPage.tsx` |
| HR home page | Live | `client/src/pages/hr/HRHomePage.tsx` |

### 2.2 Live Leaf Items (32 items backed by existing pages)

| Section | Live Items | Page Components |
|---|---|---|
| Workforce Planning & Organization | 3 | HRJobArchitecturePage, HROrganizationPage, HRPositionsPage |
| Talent Acquisition | 1 | HRRecruitmentPage |
| Onboarding & Offboarding | 2 | HROnboardingPage, HROffboardingPage |
| Employee Records & Administration | 3 | HRDirectoryPage, HRWorkPermitsPage, HRLettersCertificatesPage |
| Compensation & Benefits | 2 | HRCompensationPage, HRBenefitsPage |
| Time & Attendance | 4 | HRTimesheetPage, HRLeavePage, HROvertimePage, HRShiftPlanningPage |
| Learning & Development | 3 | HRTrainingPage, HRSkillsPage, HRCertificationsPage |
| Performance & Talent Management | 3 | HRGoalsPage, HRPerformanceReviewsPage, HRTalentPage |
| Employee Relations | 2 | HRPoliciesPage, HRGrievancesPage |
| Well Being & Engagement | 2 | HRSurveysPage, HREngagementPage |
| HR Analytics & Reporting | 2 | HRAnalyticsDashboardPage, HRReportsPage |
| Security & Access | 2 (+1 tab) | HRAccessControlsPage, HRAuditLogsPage, HRSettingsPage (tab) |
| Compliance | 3 | HRIncidentsPage, HRComplianceMgmtPage, HRRiskManagementPage |

### 2.3 Backend Domain Routers (14 active)

All 14 domain sub-routers are operational: directory, organization, staffing, recruiting, lifecycle, time, learning, performance, compensation, relations, engagement, compliance, analytics, talent.

### 2.4 Permission/Governance Model

| Component | Count | Status |
|---|---|---|
| HR roles | 5 | Active (employee, manager, hrbp, admin, workspace_admin) |
| HR action constants | 60+ | Active |
| Field masking functions | 4 | Active (directory, compensation, relations, talent) |
| Sensitive-read audit items | 10 | Active |
| Scope resolution (self/team/all) | 6 items with scopeActions | Active |
| Self-approval prevention | 5 operations | Active |

---

## 3. What Is Reused

The following capabilities are delivered by reusing existing page components at new hierarchical routes:

| New Nav Href | Reused Component | Original Route |
|---|---|---|
| `/hr/workforce-planning/organization` | HROrganizationPage | `/hr/organization` |
| `/hr/workforce-planning/positions` | HRPositionsPage | `/hr/positions` |
| `/hr/talent-acquisition/requests` | HRRecruitmentPage | `/hr/recruitment` |
| `/hr/lifecycle/onboarding/checklist` | HROnboardingPage | `/hr/onboarding` |
| `/hr/lifecycle/offboarding/termination` | HROffboardingPage | `/hr/offboarding` |
| `/hr/employee-records/profile` | HRDirectoryPage | `/hr/directory` |
| `/hr/compensation-benefits/salary-structure` | HRCompensationPage | `/hr/compensation` |
| `/hr/compensation-benefits/health-insurance` | HRBenefitsPage | `/hr/benefits` |
| `/hr/time-attendance/time-tracking` | HRTimesheetPage | `/hr/timesheet` |
| `/hr/time-attendance/leave-management` | HRLeavePage | `/hr/leave` |
| `/hr/time-attendance/overtime` | HROvertimePage | `/hr/overtime` |
| `/hr/time-attendance/shifts` | HRShiftPlanningPage | `/hr/shifts` |
| `/hr/learning-development/catalog` | HRTrainingPage | `/hr/training` |
| `/hr/learning-development/skills` | HRSkillsPage | `/hr/skills` |
| `/hr/learning-development/certifications` | HRCertificationsPage | `/hr/certifications` |
| `/hr/performance-talent/goals` | HRGoalsPage | `/hr/goals` |
| `/hr/performance-talent/reviews` | HRPerformanceReviewsPage | `/hr/reviews` |
| `/hr/performance-talent/talent-reviews` | HRTalentPage | `/hr/talent` |
| `/hr/employee-relations/policies` | HRPoliciesPage | `/hr/policies` |
| `/hr/employee-relations/grievances` | HRGrievancesPage | `/hr/grievances` |
| `/hr/wellbeing-engagement/surveys` | HRSurveysPage | `/hr/surveys` |
| `/hr/wellbeing-engagement/programs` | HREngagementPage | `/hr/engagement` |
| `/hr/analytics-reporting/workforce-dashboards` | HRAnalyticsDashboardPage | `/hr/analytics` |
| `/hr/analytics-reporting/compliance-reports` | HRReportsPage | `/hr/reports` |
| `/hr/compliance/incidents` | HRIncidentsPage | `/hr/incidents` |
| `/hr/compliance/management` | HRComplianceMgmtPage | `/hr/compliance-mgmt` |

---

## 4. What Remains Deferred (35 items)

### By Section

| Section | Deferred Count | Item IDs |
|---|---|---|
| Workforce Planning | 2 | workforce-planning-core, headcount-budget |
| Talent Acquisition | 5 | job-posting-sourcing, candidate-pipeline, interview-management, offer-management, pre-boarding |
| Onboarding & Offboarding | 6 | onboarding-documents, onboarding-access, onboarding-orientation, offboarding-knowledge-transfer, offboarding-exit-interview, offboarding-access-removal |
| Employee Records | 2 | contracts-documents, employment-changes |
| Compensation & Benefits | 4 | annual-salary-review, bonus-incentives, pension-retirement, allowances-perks |
| Time & Attendance | 0 | (fully implemented) |
| Learning & Development | 2 | mandatory-training, learning-history |
| Performance & Talent | 2 | feedback-360, succession-planning |
| Employee Relations | 2 | disciplinary-actions, workplace-investigations |
| Well Being & Engagement | 2 | wellbeing-resources, recognition-programs |
| Analytics & Reporting | 3 | attrition-retention, diversity-inclusion, custom-analytics |
| Security & Access | 2 | data-privacy-settings, security-policies |
| Compliance | 3 | policy-management, audit-reporting, privacy-access-controls |

### Deferred Item Behavior

All deferred items:
- Have `implementationStatus: "not-started"` and `backedBy: "not-yet-implemented"`
- Appear as "Coming soon" cards in their parent section landing page
- Do NOT have dead-end navigation (no routes pointing to empty pages)
- Do NOT have page components on disk
- Do NOT imply completed business capability

---

## 5. Rollout/Readiness State

### Feature Flags

| Flag | Value | Purpose |
|---|---|---|
| `carbonSideNavRollout` | `true` | Carbon SideNav model is active |
| `navConfigValidation` | `true` | Config validator is available |
| `backwardCompatAliases` | `true` | Route alias map is available |
| `navDriftDetection` | `true` | Frozen baseline drift detection (Phase 9) |
| `navHealthSummary` | `true` | Nav health summary available (Phase 9) |
| `navObservability` | `true` | Navigation event tracking active (Phase 9) |
| `deferredItemTracking` | `true` | Deferred item click tracking active (Phase 9) |

### Rollout Control

There is no separate feature-flag toggle for enabling/disabling the Carbon SideNav at runtime. The nav model is always active — it is the nav config itself. The feature flags above are informational markers in `hr.settings.get`, not runtime switches.

**This is intentional.** The Carbon SideNav is the only nav model for HR. There is no "old nav" to fall back to. The rollout strategy is:

1. Old flat routes remain mounted and functional
2. New section routes are mounted alongside them
3. Section landing pages present the Carbon-style grouped navigation
4. Route alias redirects remain in "documented" status (not yet active)
5. Future: activate redirects from old routes to new canonical routes when ready

### Backward Compatibility

- All 29 original flat `/hr/*` routes continue to work
- 28 route aliases are documented for future redirect activation
- No existing bookmarks, documentation links, or integrations are broken

---

## 6. Main Remaining Risks

| Risk | Severity | Status |
|---|---|---|
| Not all router endpoints enforce role-based access via `checkHrAccess()` | High | Open — mitigation: Phase 8 tests verify action coverage |
| `reminders.ts` references non-existent schema columns | Critical | Open — does not affect nav rollout |
| 35 nav items point to unimplemented capabilities | Medium | Accepted — shown as "Coming soon" |
| Route alias redirects not yet active | Low | Deferred by design |
| No export audit trail | Medium | Open — planned for when export is implemented |
| Permission boundary tests incomplete for all endpoints | Medium | Open — nav/visibility tests comprehensive |

---

## 7. Test Coverage Summary

| Test File | Phase | Focus | Assertion Count |
|---|---|---|---|
| `hr-module.test.ts` | 1 | Core: directory, organization, staffing, skills | ~20 |
| `hr-lifecycle.test.ts` | 2 | Recruiting, onboarding, offboarding | ~20 |
| `hr-phase3.test.ts` | 3 | Time, learning, performance | ~20 |
| `hr-phase4.test.ts` | 4 | Compensation, relations, engagement, compliance | ~20 |
| `hr-phase5.test.ts` | 5 | Cross-phase integration, analytics, reminders | ~20 |
| `hr-phase6.test.ts` | 6-7 | Hardening, permission enforcement, masking, scope, seed data | ~50 |
| `hr-nav-validation.test.ts` | 6-8 | Nav config integrity, routes, visibility, scope, masking, rollout | ~50 |
| `hr-phase8.test.ts` | 8 | Final acceptance: reality alignment, compatibility, governance | ~50 |
| `hr-phase9.test.ts` | 9 | Drift detection, health, dead-ends, domains, observability, maintainability | ~50 |

---

## 8. What Phase 9 Added (Operationalization)

| Capability | Purpose | Source |
|---|---|---|
| Frozen baseline snapshot | Detect unintentional nav config drift | `client/src/config/hrNavBaseline.ts` |
| Drift detection tests | Automated baseline comparison | `server/hr/__tests__/hr-phase9.test.ts` section A |
| Nav health summary | Section completion stats, overall health | `hrNavConfigValidator.ts` |
| Backend domain constants | Prevent string-typo drift in backendDomain fields | `hrNavConfig.ts` `HR_BACKEND_DOMAINS` |
| Observability event tracking | Privacy-safe section visit / deferred click / dead-end signals | `client/src/lib/hrNavObservability.ts` |
| Improved deferred UX | Live-first sorting, contextual guidance, section summary | `HRSectionLandingPage.tsx` |
| Dead-end prevention | "Back to HR Home" on empty sections, dead-end detection | `HRSectionLandingPage.tsx`, `hrNavConfigValidator.ts` |
| Maintainability helpers | `getImplementationBreakdown()`, `findUnknownBackendDomains()` | `hrNavConfig.ts` |

---

## 9. What Should Come Next After Phase 9

1. **Permission enforcement audit** — systematically verify every router endpoint calls `checkHrAccess()` or `requireHrPermission()` (addresses Risk R1)
2. **Fix reminders.ts** — correct schema column references and status enum values (addresses Risk R2)
3. **Activate route alias redirects** — change alias status from "documented" to "active-redirect" and add `<Redirect>` components
4. **Implement next tranche of deferred items** — Time & Attendance is fully done; next targets: Learning & Development (2 remaining), Performance & Talent (2 remaining)
5. **Add export audit logging** — implement `logHrAudit()` with category `"export"` when CSV/download features are added
6. **Frontend component tests** — add unit/integration tests for HR page components
7. **E2E tests** — add end-to-end tests for critical HR workflows
8. **Persist observability signals** — when a backend telemetry store is available, persist nav event buffer for trend analysis

---

## 10. Acceptance Decision

The HR Carbon SideNav rollout is **accepted** at Phase 9 scope for the following reasons:

1. The canonical nav config is the single source of truth and passes all structural/governance validation
2. 33 of 68 items are backed by real surfaces — no empty/theater pages
3. 35 deferred items are honestly represented as "Coming soon" — no false completion claims
4. All original routes are preserved — no backward compatibility breakage
5. Permission, visibility, scope, and masking models are coherent and tested
6. Governance documentation is complete and truthful
7. The rollout does not introduce route sprawl, backend fragmentation, or architectural violations
8. Nav drift detection provides automated protection against unintentional config changes
9. Operational observability gives visibility into navigation patterns without PII exposure
10. Dead-end handling and deferred UX guide users to available capabilities

**Signed off by Governance pass — Phase 9 complete.**
