# HR Module — Runtime References (Reviewer Map)

## Purpose

This file maps the HR module governance documentation to the actual implementation files. A reviewer should be able to move from any governance claim to the corresponding code or historical document.

---

## Canonical Nav Config (Single Source of Truth)

| File | Purpose |
|---|---|
| `client/src/config/hrNavConfig.ts` | **THE** canonical HR navigation model — 13 sections, 69 items, scope/masking/status metadata |

All sidebar rendering, route resolution, permission gating, and governance documentation derives from this file.

## Route Registration

| File | What It Does |
|---|---|
| `client/src/App.tsx` | Registers all HR routes (wouter). All `/hr/*` paths are defined here. |

## Sidebar Consumption

| File | What It Does |
|---|---|
| `client/src/components/MainLayout.tsx` | L0 toggle — "Human Resources" expandable menu in global sidebar. Renders `<HRSideNav>` when expanded (line ~399–404). |
| `client/src/components/HRSideNav.tsx` | L1/L2 Carbon-style 3-level accordion nav. Consumes `HR_NAV_CONFIG`, filters by role via `getVisibleSections()`, tracks observability. |
| `client/src/components/DirectoryDropdown.tsx` | Directory quick-access dropdown component. |
| `client/src/lib/hrNavAuth.ts` | `getVisibleSections()` — filters nav sections/items by user's allowed actions. |
| `client/src/lib/hrIconMap.ts` | `resolveHrIcon()` — maps `iconHint` strings to Lucide icon components. |
| `client/src/lib/hrNavObservability.ts` | `trackSectionVisit()` / `trackItemClick()` — client-side nav observability tracking. |
| `client/src/hooks/useHrRole.ts` | `useHrRole()` hook — provides current user's HR role and allowed actions to components. |

## HR Page Components (41 files)

Located in `client/src/pages/hr/`. Key pages:

| Page | Nav Item | Route |
|---|---|---|
| `HRHomePage.tsx` | HR landing page | `/hr` |
| `HRSectionLandingPage.tsx` | Section landing template | `/hr/:section` |
| `HRDirectoryPage.tsx` | Employee Profile | `/hr/directory` |
| `HROrganizationPage.tsx` | Organizational Structure | `/hr/organization` |
| `HRPositionsPage.tsx` | Position Management | `/hr/positions` |
| `HRJobArchitecturePage.tsx` | Job Architecture | `/hr/workforce-planning/job-architecture` |
| `HRRoleDefinitionsPage.tsx` | Role Definitions | `/hr/role-definitions` |
| `HRRecruitmentPage.tsx` | Recruitment Requests | `/hr/recruitment` |
| `HROnboardingPage.tsx` | Onboarding Checklist | `/hr/onboarding` |
| `HROffboardingPage.tsx` | Offboarding / Termination | `/hr/offboarding` |
| `HRCompensationPage.tsx` | Salary Structure | `/hr/compensation` |
| `HRBenefitsPage.tsx` | Health & Insurance | `/hr/benefits` |
| `HRTimesheetPage.tsx` | Time Tracking | `/hr/timesheet` |
| `HRLeavePage.tsx` | Leave Management | `/hr/leave` |
| `HROvertimePage.tsx` | Overtime Requests | `/hr/overtime` |
| `HRShiftPlanningPage.tsx` | Shift Planning | `/hr/shifts` |
| `HRTrainingPage.tsx` | Training Catalog | `/hr/training` |
| `HRSkillsPage.tsx` | Skill Development | `/hr/skills` |
| `HRCertificationsPage.tsx` | Certifications | `/hr/certifications` |
| `HRGoalsPage.tsx` | Goal Setting | `/hr/goals` |
| `HRPerformanceReviewsPage.tsx` | Performance Reviews | `/hr/reviews` |
| `HRTalentPage.tsx` | Talent Reviews | `/hr/talent` |
| `HRPoliciesPage.tsx` | HR Policies | `/hr/policies` |
| `HRGrievancesPage.tsx` | Grievances & Complaints | `/hr/grievances` |
| `HRSurveysPage.tsx` | Employee Surveys | `/hr/surveys` |
| `HREngagementPage.tsx` | Engagement Programs | `/hr/engagement` |
| `HRAnalyticsDashboardPage.tsx` | Workforce Dashboards | `/hr/analytics` |
| `HRReportsPage.tsx` | Compliance Reports | `/hr/reports` |
| `HRAccessControlsPage.tsx` | Access Controls | `/hr/security-access/access-controls` |
| `HRAuditLogsPage.tsx` | Audit Logs | `/hr/security-access/audit-logs` |
| `HRIncidentsPage.tsx` | Incident Reporting | `/hr/incidents` |
| `HRComplianceMgmtPage.tsx` | Compliance Management | `/hr/compliance-mgmt` |
| `HRRiskManagementPage.tsx` | Risk Management | `/hr/compliance/risk-management` |
| `HRWorkPermitsPage.tsx` | Work Permits | `/hr/employee-records/work-permits` |
| `HRLettersCertificatesPage.tsx` | HR Letters & Certificates | `/hr/employee-records/letters-certificates` |
| `HRSettingsPage.tsx` | HR Settings | `/hr/settings` |
| `HRStaffingPage.tsx` | Staffing | `/hr/staffing` |
| `HRRoleDefinitionDetailPage.tsx` | Role Definition Detail | `/hr/role-definitions/:id` |
| `HRRoleDefinitionEditPage.tsx` | Role Definition Edit | `/hr/role-definitions/:id/edit` |
| `HRRoleDefinitionReviewPage.tsx` | Role Definition Review | `/hr/role-definitions/:id/review` |
| `HRRoleDefinitionComparePage.tsx` | Role Definition Compare | `/hr/role-definitions/:id/compare` |

## Backend — Root Router

| File | Purpose |
|---|---|
| `server/hr/router.ts` | Composes all 15 domain sub-routers + settings + me into `hrRouter`. Declares module version 9.0.0 and all feature flags. |

## Backend — Sub-Routers (15)

| Sub-Router | File |
|---|---|
| directory | `server/hr/directory/router.ts` |
| organization | `server/hr/organization/router.ts` |
| staffing | `server/hr/staffing/router.ts` |
| recruiting | `server/hr/recruiting/router.ts` |
| lifecycle | `server/hr/lifecycle/router.ts` |
| time | `server/hr/time/router.ts` |
| learning | `server/hr/learning/router.ts` |
| performance | `server/hr/performance/router.ts` |
| compensation | `server/hr/compensation/router.ts` |
| relations | `server/hr/relations/router.ts` |
| engagement | `server/hr/engagement/router.ts` |
| compliance | `server/hr/compliance/router.ts` |
| analytics | `server/hr/analytics/router.ts` |
| talent | `server/hr/talent/router.ts` |
| role-definitions | `server/hr/role-definitions/router.ts` |

## Backend — Permission & Governance Helpers

| File | Purpose |
|---|---|
| `server/hr/permissions.ts` | HR_ROLES, HR_ACTIONS, HR_ROLE_PERMISSIONS matrix, masking functions (8), scope resolution, self-approval prevention, worker status state machine |
| `server/hr/seed.ts` | `seedHrDemoData()` — 28-employee demo dataset |

## Tests

| Location | Purpose |
|---|---|
| `server/hr/__tests__/` | HR-specific test files |

## Historical / Audit Documents (`HR/`)

| File | Purpose |
|---|---|
| `HR/HR_MODULE_IMPLEMENTATION_ROADMAP.md` | Original phased roadmap (Phases 1–9) |
| `HR/HR_MODULE_REPO_SCAFFOLD.md` | Initial project scaffold plan |
| `HR/HR_MODULE_PHASE1_PR_PLAN.md` | Phase 1 pull request plan |
| `HR/HR_PHASE5_IMPLEMENTATION_NOTES.md` | Phase 5 cross-integration notes |
| `HR/HR_ROLE_DEFINITION_FRAMEWORK.md` | Role definition lifecycle design |
| `HR/HR_MODULE_AUDIT_REPORT.md` | Module governance audit report |
| `HR/HR_GOVERNANCE_COMPLIANCE_AUDIT.md` | Governance compliance audit |
| `HR/HR_V72_REAUDIT.md` | Phase 7.2 re-audit |
| `HR/HR_GOVERNANCE_COMPLIANCE_REAUDIT_FINAL.md` | Final governance re-audit |
| `HR/HR_FINAL_ACCEPTANCE_AUDIT.md` | Final acceptance audit |
| `HR/GOVERNANCE_HR_COMPATIBILITY_ASSESSMENT.md` | Governance compatibility assessment |
| `HR/HR_DEEP_COMPATIBILITY_ANALYSIS.md` | Deep compatibility analysis |

## Carbon SideNav Documentation

| File | Purpose |
|---|---|
| `Governance-Centrale/modules/human-resources/DIRECTORY_DROPDOWN_COMPONENT.md` | Directory dropdown component spec |

## Global Governance Doctrine (cross-links)

| File | Relevance |
|---|---|
| `Governance-Center/global/GOVERNANCE_MODEL.md` | Platform governance architecture — HR uses `governedProcedure` |
| `Governance-Center/global/SECURITY_MODEL.md` | Platform security — HR extends with field masking |
| `Governance-Center/global/AUDIT_MODEL.md` | Platform audit — HR has parallel `logHrAudit` |
| `Governance-Center/global/OPERATIONAL_COMPLIANCE_MODEL.md` | Review cadence — HR periodic checks |
| `Governance-Center/global/CONTROL_MATRIX.md` | Platform controls — HR is most complete module |
| `Governance-Center/global/GOVERNANCE_COVERAGE_MATRIX.md` | Coverage matrix — HR has full mutation+read coverage |
