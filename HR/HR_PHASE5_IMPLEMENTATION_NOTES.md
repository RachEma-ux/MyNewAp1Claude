# HR Phase 5 — Implementation Notes

## Overview

Phase 5 is the **stabilization and cross-phase integration** pass. It does NOT add new HR domains; it makes all existing phases (1–4) work as one coherent, stable, workspace-ready module.

## What Was Implemented

### D. Permission/Privacy Hardening
- **Role → Permission Matrix** (`HR_ROLE_PERMISSIONS`) in `server/hr/permissions.ts`
  - 5 roles: employee, manager, hrbp, admin, workspace_admin
  - Employee: self-read only (directory, time, leave, performance, learning)
  - Manager: team-read + approvals (time, leave, overtime, performance)
  - HRBP: broad read + sensitive access (compensation, relations, talent)
  - Admin/WS Admin: full access
- **`hasPermission(role, action)`** helper for runtime checks
- **`maskCompensationFields()`** and **`maskRelationsFields()`** utility functions
  - Complement existing `maskDirectoryFields()`
  - All three use a shared generic `maskFields()` helper
  - Non-mutating (returns new object)

### D. Audit Improvements
- Enhanced `server/hr/audit.ts`:
  - **Audit categories**: mutation, sensitive_read, status_change, assignment, approval, export, system
  - **`logSensitiveRead()`** — tracks who accesses restricted data (compensation, relations, talent)
  - **`logStatusChange()`** — tracks state machine transitions with from/to status
  - Metadata enriched with `_category` and `_ts` fields

### E. Automation/Reminder Hooks
- New `server/hr/jobs/reminders.ts` with 6 checkers:
  1. `checkCertificationExpiry(daysAhead)` — employee certs expiring within N days
  2. `checkOverdueTraining()` — learning assignments past due date
  3. `checkReviewsDue(daysAhead)` — performance reviews approaching deadline
  4. `checkPendingLeaveApprovals()` — unapproved leave requests
  5. `checkSalaryReviewDeadlines(daysAhead)` — open salary review cycles ending soon
  6. `checkComplianceDeadlines(daysAhead)` — compliance obligations approaching due date
- `getAllReminders()` — runs all 6 in parallel, returns combined `Reminder[]`
- Exposed via `hr.analytics.getReminders` tRPC endpoint

### F. Analytics/Dashboard Hardening
- Expanded `getDashboardSummary` with 4 new real-data metrics:
  - `onLeave`, `terminated` (worker status breakdown)
  - `pendingLeave`, `overdueTraining`, `pendingReviews`, `expiringCerts`
- New `getWorkforceBreakdown` endpoint: worker distribution by type, category, and status
- New `getReminders` endpoint: live reminders from all HR domains

### G. Frontend Consistency
- **HR Home Page** (`HRHomePage.tsx`):
  - KPIs sourced from `hr.analytics.getDashboardSummary` (not just directory summary)
  - Critical reminder badge linking to analytics page
  - Loading skeleton state
  - Error card display
- **HR Analytics Dashboard** (`HRAnalyticsDashboardPage.tsx`):
  - 8 core KPI tiles + 4 operational KPI tiles
  - Reminders tab (default) with urgency badges
  - Workforce Breakdown tab with 3 distribution cards
  - Reports and Metrics tabs preserved
  - Back navigation arrow
  - Loading skeleton + error states
- **All Phase 4 pages** normalized with:
  - Back arrow (`ArrowLeft`) linking to `/hr`
  - Loading skeleton (animate-pulse)
  - Error card (border-red-500)
  - Consistent header structure (flex row with back button + title)
  - Pages updated: Compensation, Benefits, Policies, Grievances, Surveys, Engagement, Incidents, Compliance, Analytics, Talent

### I. Seed Data
- New `server/hr/seed.ts` with `seedHrDemoData()`:
  - 6 people (4 active, 1 on_leave, 1 terminated)
  - 3 org units (Engineering, HR, Sales)
  - 4 positions across org units
  - 6 worker profiles with manager relationships
  - 6 employment records
  - 3 training catalog entries + 3 learning assignments
  - 2 certifications + 2 employee certifications
  - 1 performance cycle + 2 goals
  - 3 leave types + 2 leave requests
  - 4 salary bands + 3 compensation records
  - 3 benefit plans
  - 3 HR policies
  - 2 compliance obligations
  - 3 report definitions
- Exposed via `hr.settings.seedDemo` governed mutation
- Idempotent: skips if data already exists

### H. Tests
- New `server/hr/__tests__/hr-phase5.test.ts` with ~30 tests covering:
  - Permission matrix completeness (all 5 roles)
  - Employee/Manager/HRBP/Admin permission boundaries
  - hasPermission helper
  - Field masking (directory, compensation, relations)
  - Non-mutation guarantee for masking
  - Audit module exports
  - Reminder module exports
  - Analytics router procedure completeness
  - Workspace module integration (MODULE_KEYS, PRESETS, router)
  - Root router composition (14 sub-routers + settings)
  - Schema barrel exports (30+ tables)
  - Permission action coverage per domain

### C. Router Version Bump
- `server/hr/router.ts` bumped to v5.0.0
- Settings endpoint reports Phase 5 feature flags: `reminders`, `workforceBreakdown`, `rolePermissionMatrix`, `sensitiveAuditLogging`

## Route Map

| Route | Page | Domain |
|---|---|---|
| `/hr` | HRHomePage | Landing |
| `/hr/directory` | HRDirectoryPage | Phase 1 |
| `/hr/organization` | HROrganizationPage | Phase 1 |
| `/hr/positions` | HRPositionsPage | Phase 1 |
| `/hr/staffing` | HRStaffingPage | Phase 1 |
| `/hr/skills` | HRSkillsPage | Phase 1 |
| `/hr/recruitment` | HRRecruitmentPage | Phase 2 |
| `/hr/onboarding` | HROnboardingPage | Phase 2 |
| `/hr/offboarding` | HROffboardingPage | Phase 2 |
| `/hr/timesheet` | HRTimesheetPage | Phase 3 |
| `/hr/leave` | HRLeavePage | Phase 3 |
| `/hr/overtime` | HROvertimePage | Phase 3 |
| `/hr/shifts` | HRShiftPlanningPage | Phase 3 |
| `/hr/training` | HRTrainingPage | Phase 3 |
| `/hr/certifications` | HRCertificationsPage | Phase 3 |
| `/hr/goals` | HRGoalsPage | Phase 3 |
| `/hr/reviews` | HRPerformanceReviewsPage | Phase 3 |
| `/hr/compensation` | HRCompensationPage | Phase 4 |
| `/hr/benefits` | HRBenefitsPage | Phase 4 |
| `/hr/policies` | HRPoliciesPage | Phase 4 |
| `/hr/grievances` | HRGrievancesPage | Phase 4 |
| `/hr/surveys` | HRSurveysPage | Phase 4 |
| `/hr/engagement` | HREngagementPage | Phase 4 |
| `/hr/incidents` | HRIncidentsPage | Phase 4 |
| `/hr/compliance-mgmt` | HRComplianceMgmtPage | Phase 4 |
| `/hr/analytics` | HRAnalyticsDashboardPage | Phase 4/5 |
| `/hr/talent` | HRTalentPage | Phase 4 |
| `/hr/reports` | HRReportsPage | Config |
| `/hr/settings` | HRSettingsPage | Config |

## Known Gaps / Future Work
- Permission enforcement is advisory (matrix defined, not yet enforced at procedure level)
- Reminders are pull-based (no push notifications or cron scheduling)
- Seed data is basic; no grievance, incident, or talent review fixtures
- Phase 1-3 frontend pages not yet normalized with back nav + loading/error (only Phase 4+ pages updated)
- No E2E integration tests (would require running DB)
- Masking is per-function, not middleware-level — future improvement could add tRPC middleware
