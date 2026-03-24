# HR Module — Runtime References

## Document Status

- **Type:** Source-of-truth file map
- **Module:** Human Resources
- **Last updated:** 2026-03-24

---

## 1. Canonical Configuration Files

| File | Purpose | Authoritative For |
|---|---|---|
| `client/src/config/hrNavConfig.ts` | HR Carbon SideNav definition | 13 sections, 68 leaf items, governance metadata |
| `client/src/config/hrNavConfigValidator.ts` | Nav config validation | Structural integrity, route coherence, governance metadata, drift detection, health summary (Phase 8-9) |
| `client/src/config/hrRouteAliases.ts` | Route backward compatibility map | 28 old→new route mappings |
| `server/hr/permissions.ts` | Permission model | HR_ROLES, HR_ACTIONS, HR_ROLE_PERMISSIONS matrix, masking functions, scope resolution |

---

## 2. Backend Source Files

### Root

| File | Purpose |
|---|---|
| `server/hr/router.ts` | Root HR tRPC router composing 14 sub-routers + settings + me |
| `server/hr/permissions.ts` | Roles, actions, permission matrix, masking, scope resolution, SoD |
| `server/hr/audit.ts` | Audit logging functions (logHrAudit, logSensitiveRead, logStatusChange) |
| `server/hr/seed.ts` | Demo data seeding function |

### Domain Routers

| File | Domain | Key Functions |
|---|---|---|
| `server/hr/directory/router.ts` | Employee records | CRUD, maskDirectoryFields, letters |
| `server/hr/organization/router.ts` | Org structure | Org units, job families, job levels |
| `server/hr/staffing/router.ts` | Positions & staffing | Positions, assignments, skills |
| `server/hr/recruiting/router.ts` | Talent acquisition | Recruitment requests |
| `server/hr/lifecycle/router.ts` | Onboarding/offboarding | Cases, tasks, checklists |
| `server/hr/time/router.ts` | Time & attendance | Time entries, leave, overtime, shifts |
| `server/hr/learning/router.ts` | Learning & development | Training, certifications |
| `server/hr/performance/router.ts` | Performance management | Goals, reviews, cycles |
| `server/hr/compensation/router.ts` | Compensation & benefits | Salary, benefits, masking, audit |
| `server/hr/relations/router.ts` | Employee relations | Policies, grievances, masking, audit |
| `server/hr/engagement/router.ts` | Well being & engagement | Surveys, programs |
| `server/hr/compliance/router.ts` | Compliance | Incidents, work permits, risk |
| `server/hr/analytics/router.ts` | Analytics & reporting | Dashboards, reports, access controls |
| `server/hr/talent/router.ts` | Talent management | Talent reviews, succession, masking, audit |

---

## 3. Frontend Source Files

### Configuration and Helpers

| File | Purpose |
|---|---|
| `client/src/config/hrNavConfig.ts` | Canonical nav config (13 sections, 68 items) |
| `client/src/config/hrNavConfigValidator.ts` | Nav config validation + drift detection + health summary (Phase 8-9) |
| `client/src/config/hrRouteAliases.ts` | Route backward compatibility mappings |
| `client/src/lib/hrNavAuth.ts` | Client-side authorization helpers (11 pure functions) |
| `client/src/lib/hrNavObservability.ts` | Lightweight nav event tracking — section visits, deferred clicks, dead ends (Phase 9) |
| `client/src/config/hrNavBaseline.ts` | Frozen baseline snapshot for drift detection (Phase 9) |
| `client/src/hooks/useHrRole.ts` | React hook for HR role/permission access |

### Key Page Components

| File | Route | Purpose |
|---|---|---|
| `client/src/pages/hr/HRHomePage.tsx` | `/hr` | HR home/dashboard |
| `client/src/pages/hr/HRSectionLandingPage.tsx` | `/hr/<section>` | Reusable section landing (13 instances) |
| `client/src/pages/hr/HRDirectoryPage.tsx` | `/hr/directory` | Employee directory |
| `client/src/pages/hr/HROrganizationPage.tsx` | `/hr/organization` | Org structure |
| `client/src/pages/hr/HRPositionsPage.tsx` | `/hr/positions` | Position management |
| `client/src/pages/hr/HRStaffingPage.tsx` | `/hr/staffing` | Workspace staffing |
| `client/src/pages/hr/HRCompensationPage.tsx` | `/hr/compensation` | Salary structure |
| `client/src/pages/hr/HRBenefitsPage.tsx` | `/hr/benefits` | Benefits management |
| `client/src/pages/hr/HRTimesheetPage.tsx` | `/hr/timesheet` | Time tracking |
| `client/src/pages/hr/HRLeavePage.tsx` | `/hr/leave` | Leave management |
| `client/src/pages/hr/HRGoalsPage.tsx` | `/hr/goals` | Goal setting |
| `client/src/pages/hr/HRPerformanceReviewsPage.tsx` | `/hr/reviews` | Performance reviews |
| `client/src/pages/hr/HRPoliciesPage.tsx` | `/hr/policies` | HR policies |
| `client/src/pages/hr/HRGrievancesPage.tsx` | `/hr/grievances` | Grievances |
| `client/src/pages/hr/HRTalentPage.tsx` | `/hr/talent` | Talent reviews |
| `client/src/pages/hr/HRAnalyticsDashboardPage.tsx` | `/hr/analytics` | Analytics dashboards |
| `client/src/pages/hr/HRSettingsPage.tsx` | `/hr/settings` | HR settings/access |

### Phase 4 Page Components

| File | Route | Purpose |
|---|---|---|
| `client/src/pages/hr/HRJobArchitecturePage.tsx` | `/hr/workforce-planning/job-architecture` | Job families & levels |
| `client/src/pages/hr/HRWorkPermitsPage.tsx` | `/hr/employee-records/work-permits` | Work permits |
| `client/src/pages/hr/HRLettersCertificatesPage.tsx` | `/hr/employee-records/letters-certificates` | HR letters |
| `client/src/pages/hr/HRRiskManagementPage.tsx` | `/hr/compliance/risk-management` | Risk management |
| `client/src/pages/hr/HRAuditLogsPage.tsx` | `/hr/security-access/audit-logs` | Audit logs |
| `client/src/pages/hr/HRAccessControlsPage.tsx` | `/hr/security-access/access-controls` | Access controls |

---

## 4. Database Schema Files

| File | Tables |
|---|---|
| `drizzle/tables/hr-core.ts` | hr_people, hr_worker_profiles, hr_employment_records, hr_letters |
| `drizzle/tables/hr-organization.ts` | hr_org_units, hr_job_families, hr_job_levels, hr_positions |
| `drizzle/tables/hr-staffing.ts` | hr_workspace_assignments, hr_worker_skills, hr_worker_certifications |
| `drizzle/tables/hr-recruiting.ts` | hr_recruitment_requests, hr_candidates |
| `drizzle/tables/hr-lifecycle.ts` | hr_onboarding_cases, hr_onboarding_tasks, hr_offboarding_cases, hr_offboarding_tasks |
| `drizzle/tables/hr-time.ts` | hr_time_entries, hr_leave_types, hr_leave_requests, hr_overtime_requests, hr_shift_plans |
| `drizzle/tables/hr-learning.ts` | hr_training_catalog, hr_learning_assignments, hr_learning_history |
| `drizzle/tables/hr-performance.ts` | hr_goals, hr_performance_cycles, hr_performance_reviews |
| `drizzle/tables/hr-compensation.ts` | hr_salary_bands, hr_compensation_records, hr_bonus_records, hr_benefit_plans, hr_employee_benefits |
| `drizzle/tables/hr-relations.ts` | hr_policy_documents, hr_grievances, hr_disciplinary_actions, hr_investigations |
| `drizzle/tables/hr-engagement.ts` | hr_surveys, hr_survey_responses, hr_engagement_programs |
| `drizzle/tables/hr-compliance.ts` | hr_incidents, hr_compliance_checks, hr_risk_assessments, hr_work_permits |
| `drizzle/tables/hr-analytics.ts` | hr_headcount_snapshots, hr_custom_report_definitions |
| `drizzle/tables/hr-talent.ts` | hr_talent_reviews, hr_succession_plans, hr_succession_candidates |

---

## 5. Test Files

| File | Coverage |
|---|---|
| `server/hr/__tests__/hr-module.test.ts` | Phase 1 core (directory, organization, staffing, skills) |
| `server/hr/__tests__/hr-lifecycle.test.ts` | Phase 2 (recruiting, onboarding, offboarding) |
| `server/hr/__tests__/hr-phase3.test.ts` | Phase 3 (time, learning, performance) |
| `server/hr/__tests__/hr-phase4.test.ts` | Phase 4 (compensation, relations, engagement, compliance) |
| `server/hr/__tests__/hr-phase5.test.ts` | Phase 5 (cross-phase integration, analytics, reminders) |
| `server/hr/__tests__/hr-phase6.test.ts` | Phase 6 (hardening, permission enforcement, bug fixes) |
| `server/hr/__tests__/hr-nav-validation.test.ts` | Phase 6-9 (nav config integrity, route coherence, role/visibility, rollout, drift detection, health) |
| `server/hr/__tests__/hr-phase8.test.ts` | Phase 8 (final acceptance: reality alignment, compatibility, governance, deferred consistency) |
| `server/hr/__tests__/hr-phase9.test.ts` | Phase 9 (drift detection, health summary, dead-end/deferred analysis, backend domains, observability, maintainability, baseline integrity, feature flags) |

---

## 6. Phase 0 Governance Package

| File | Purpose |
|---|---|
| `Governance-Centrale/modules/human-resources/CARBON_SIDENAV_PHASE0_GOVERNANCE_IMPACT_NOTE.md` | Governance impact analysis |
| `Governance-Centrale/modules/human-resources/CARBON_SIDENAV_CAPABILITY_INVENTORY.md` | Full 68-item capability inventory |
| `Governance-Centrale/modules/human-resources/CARBON_SIDENAV_ROUTE_VISIBILITY_CLASSIFICATION.md` | Visibility model definition |
| `Governance-Centrale/modules/human-resources/CARBON_SIDENAV_PERMISSION_MAP.md` | Permission-to-nav mapping |
| `Governance-Centrale/modules/human-resources/CARBON_SIDENAV_SCOPE_MAP.md` | Data scope classification |
| `Governance-Centrale/modules/human-resources/CARBON_SIDENAV_SENSITIVITY_MAP.md` | Masking and sensitivity classification |
| `Governance-Centrale/modules/human-resources/CARBON_SIDENAV_AUDIT_EXPECTATIONS.md` | Per-item audit expectations |
| `Governance-Centrale/modules/human-resources/CARBON_SIDENAV_PHASE0_SUMMARY.md` | Phase 0 completion summary |

---

## 7. Governance Documents

| File | Purpose |
|---|---|
| `Governance-Centrale/modules/human-resources/README.md` | Governance pack index |
| `Governance-Centrale/modules/human-resources/MODULE_GOVERNANCE_PROFILE.md` | Governance identity card |
| `Governance-Centrale/modules/human-resources/MODULE_CONTROL_SURFACE.md` | API/route/nav inventory |
| `Governance-Centrale/modules/human-resources/MODULE_AUDIT_MODEL.md` | Audit and compliance model |
| `Governance-Centrale/modules/human-resources/MODULE_PERIODIC_CHECKS.md` | Recurring review checklist |
| `Governance-Centrale/modules/human-resources/MODULE_RISKS.md` | Risk register |
| `Governance-Centrale/modules/human-resources/MODULE_OPEN_GAPS.md` | Gap list and deferred items |
| `Governance-Centrale/modules/human-resources/MODULE_RUNTIME_REFERENCES.md` | This file — source-of-truth map |
| `Governance-Centrale/modules/human-resources/hr-nav-architecture.md` | Phase 1+3 nav architecture doc |
| `Governance-Centrale/modules/human-resources/hr-phase2-section-landing-pages.md` | Phase 2 section landing pages doc |
| `Governance-Centrale/modules/human-resources/hr-phase4-backend-expansion.md` | Phase 4 backend expansion doc |
| `Governance-Centrale/modules/human-resources/hr-phase6-stabilization.md` | Phase 6/8 stabilization and rollout readiness doc |
| `Governance-Centrale/modules/human-resources/hr-phase9-operationalization.md` | Phase 9 operationalization and maintainability doc |
| `Governance-Centrale/modules/human-resources/CARBON_SIDENAV_ACCEPTANCE_SUMMARY.md` | Phase 9 final rollout acceptance status |

---

## 7. Related Non-HR Files

| File | Relevance to HR |
|---|---|
| `client/src/App.tsx` | Route registration for all `/hr/*` routes |
| `client/src/components/MainLayout.tsx` | Sidebar navigation rendering for HR sections |
| `server/routers.ts` | Root tRPC router — mounts `hr` namespace |
| `drizzle/schema.ts` | Schema barrel — exports all HR tables |
| `AGENTS.md` | Mandatory 5-agent orchestration model |
| `ARCHITECTURE.md` | Platform layer architecture |
| `HR/HR_MODULE_IMPLEMENTATION_ROADMAP.md` | Full strategic roadmap |
| `HR/HR_MODULE_REPO_SCAFFOLD.md` | Repo-aligned implementation scaffold |
| `HR/HR_MODULE_PHASE1_PR_PLAN.md` | Phase 1 PR breakdown |
| `HR/HR_MODULE_AUDIT_REPORT.md` | Post-Phase 5 acceptance audit |
