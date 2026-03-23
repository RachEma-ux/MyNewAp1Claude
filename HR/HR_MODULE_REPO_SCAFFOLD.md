# HR Module Repo Scaffold

## Document Status

- **Document type:** Repo implementation scaffold + phased execution plan
- **Target repo path:** `docs/hr/HR_MODULE_REPO_SCAFFOLD.md`
- **Module key:** `hr`
- **Target app:** `MyNewAp1Claude`
- **Intent:** Add Human Resources as a first-class, workspace-aware, independently governed module

---

## 1. Purpose of This Document

This document translates the HR strategy into a repo-ready implementation scaffold for the current app.

It is meant to answer:

- where HR should live in the repo
- which files need to be added or updated
- how HR plugs into the current module registry and workspace system
- what DB tables and schemas are required
- what routes and pages are needed
- how to phase delivery safely

This is **not** a final code implementation.
It is the execution blueprint for implementing HR in the existing codebase.

---

## 2. Current Repo Anchors HR Must Align With

Based on the current repo, HR must align with these existing structures:

- `client/src/App.tsx` is the central frontend route registry.
- `client/src/components/MainLayout.tsx` owns the left navigation model.
- `client/src/components/workspace-shell/WorkspaceExecutionShell.tsx` is the context-first workspace shell.
- `server/routers.ts` is the root tRPC composition point.
- `server/modules/router.ts` aggregates workspace modules under `modules.*`.
- `server/modules/registry.ts` handles module enablement, presets, and guard-backed workspace activity logging.
- `drizzle/schema.ts` is the schema barrel file.
- `drizzle/tables/workspace-modules.ts` contains `MODULE_KEYS` and workspace module bindings.
- `policies/` already exists and should also carry HR-specific policy assets.
- `docs/` is the correct place for HR docs and implementation references.

That means HR should be implemented in **two aligned forms**:

1. **Global HR module surface**
   - HR directory, employee records, staffing, analytics, admin, etc.
   - root namespace: `hr.*`
2. **Workspace-consumable HR surface**
   - staffing lookup, assignment, availability, role mapping, approval routing
   - module namespace: `modules.hr.*`

---

## 3. Mandatory Repo Changes

The minimum mandatory changes are:

1. Add `hr` to the workspace module system.
2. Add HR database tables under `drizzle/tables/`.
3. Export HR tables from `drizzle/schema.ts`.
4. Add HR backend domain code under `server/hr/`.
5. Add a root HR router and mount it in `server/routers.ts`.
6. Add a workspace-module HR router and mount it in `server/modules/router.ts`.
7. Add frontend HR routes in `client/src/App.tsx`.
8. Add HR nav entry in `client/src/components/MainLayout.tsx`.
9. Add HR feature pages/components under `client/src/features/hr/` and/or `client/src/pages/hr/`.
10. Add JSON schemas and policy assets for HR.
11. Add migrations.
12. Add tests.

Without these 12 pieces, HR will not behave like a native module.

---

## 4. Recommended Directory Layout

## 4.1 Backend

```text
server/
  hr/
    router.ts
    permissions.ts
    constants.ts
    errors.ts
    events.ts
    dto.ts

    shared/
      audit.ts
      masking.ts
      selectors.ts
      validators.ts

    directory/
      router.ts
      service.ts
      repository.ts
      schemas.ts
      mapper.ts

    organization/
      router.ts
      service.ts
      repository.ts
      schemas.ts

    staffing/
      router.ts
      service.ts
      repository.ts
      schemas.ts
      availability.ts

    recruiting/
      router.ts
      service.ts
      repository.ts
      schemas.ts

    lifecycle/
      router.ts
      service.ts
      repository.ts
      schemas.ts

    records/
      router.ts
      service.ts
      repository.ts
      schemas.ts

    time/
      router.ts
      service.ts
      repository.ts
      schemas.ts

    learning/
      router.ts
      service.ts
      repository.ts
      schemas.ts

    performance/
      router.ts
      service.ts
      repository.ts
      schemas.ts

    compensation/
      router.ts
      service.ts
      repository.ts
      schemas.ts

    relations/
      router.ts
      service.ts
      repository.ts
      schemas.ts

    analytics/
      router.ts
      service.ts
      repository.ts
      schemas.ts

    security/
      router.ts
      service.ts
      repository.ts
      schemas.ts

    compliance/
      router.ts
      service.ts
      repository.ts
      schemas.ts

    jobs/
      reminders.ts
      projections.ts
      expiries.ts
      snapshots.ts
```

### Why this shape

This mirrors the repo’s existing domain-oriented backend structure and avoids building HR as one oversized router.

---

## 4.2 Frontend

```text
client/src/
  features/
    hr/
      api/
        queries.ts
        mutations.ts
        keys.ts

      components/
        HRShell.tsx
        HRPageHeader.tsx
        HRStatTiles.tsx
        EmployeeTable.tsx
        EmployeeFilters.tsx
        EmployeeProfileDrawer.tsx
        AssignmentTable.tsx
        OrgChartPanel.tsx
        PositionTable.tsx
        StaffingSearchPanel.tsx
        RaciMatrixPanel.tsx
        VisibilityMatrixPanel.tsx

      pages/
        HRHomePage.tsx
        HRDirectoryPage.tsx
        HREmployeePage.tsx
        HROrganizationPage.tsx
        HRPositionsPage.tsx
        HRStaffingPage.tsx
        HRRecruitmentPage.tsx
        HROnboardingPage.tsx
        HROffboardingPage.tsx
        HRTimeAttendancePage.tsx
        HRLearningPage.tsx
        HRPerformancePage.tsx
        HRCompensationPage.tsx
        HRRelationsPage.tsx
        HRAnalyticsPage.tsx
        HRSecurityPage.tsx
        HRCompliancePage.tsx

      hooks/
        useEmployees.ts
        useEmployee.ts
        useWorkspaceStaffing.ts
        useEligibleWorkers.ts

      schemas/
        employee.ts
        assignment.ts
        org.ts
        position.ts

      state/
        hr-ui-store.ts
```

### Page placement note

The repo already uses `client/src/pages/*`, but for a module of this size a dedicated `features/hr/` area is cleaner.

Recommended pattern:

- keep route entry pages in `client/src/pages/hr/*`
- keep reusable HR-specific internals in `client/src/features/hr/*`

If you want stricter locality, HR can also live fully in `client/src/features/hr/` and expose page adapters.

---

## 4.3 Database

```text
drizzle/
  tables/
    hr-core.ts
    hr-organization.ts
    hr-staffing.ts
    hr-recruiting.ts
    hr-lifecycle.ts
    hr-records.ts
    hr-time.ts
    hr-learning.ts
    hr-performance.ts
    hr-compensation.ts
    hr-relations.ts
    hr-analytics.ts
    hr-security.ts
    hr-compliance.ts
```

---

## 4.4 Schemas and Policies

```text
schemas/
  hr/
    employee-summary.schema.json
    employee-profile.schema.json
    workspace-assignment.schema.json
    org-unit.schema.json
    position.schema.json
    recruitment-request.schema.json
    onboarding-case.schema.json
    leave-request.schema.json
    performance-review.schema.json
    compensation-summary.schema.json

policies/
  hr/
    field-visibility.policy.json
    role-visibility-matrix.json
    raci-matrix.json
    document-retention.policy.json
    compensation-access.policy.json
    investigation-access.policy.json
    workspace-staffing.policy.json
```

---

## 5. Exact Existing Files to Update

## 5.1 `drizzle/tables/workspace-modules.ts`

### Change
Add `hr` to `MODULE_KEYS`.

### Current shape
Current module keys are:

- `pmt`
- `knowledge`
- `agents`
- `collaboration`
- `reporting`

### Target

```ts
export const MODULE_KEYS = [
  "pmt",
  "knowledge",
  "agents",
  "collaboration",
  "reporting",
  "hr",
] as const;
```

### Why
Without this, HR cannot be seeded or enabled per workspace.

---

## 5.2 `server/modules/registry.ts`

### Change
Add `hr` to appropriate presets.

### Recommended preset logic

- `personal`: likely no HR by default
- `team`: optional HR depending on your product strategy
- `project`: maybe read-only staffing, not full HR admin
- `enterprise`: include HR
- `sandbox`: optional lightweight HR

### Recommended target presets

```ts
personal: ["pmt", "knowledge", "reporting"],
team: ["pmt", "knowledge", "agents", "collaboration", "reporting"],
project: ["pmt", "knowledge", "agents", "collaboration", "reporting"],
research: ["knowledge", "reporting"],
enterprise: ["pmt", "knowledge", "agents", "collaboration", "reporting", "hr"],
sandbox: ["pmt", "knowledge", "agents"],
readonly: ["reporting"],
```

If you want staffing available in project workspaces, add `hr` to `project` too.

### Best product rule
Use **two-layer enablement**:

- workspace-level module enablement (`hr` on/off)
- HR sub-capability controls inside HR (`directory.read`, `staffing.assign`, `compensation.read`, etc.)

---

## 5.3 `server/modules/router.ts`

### Change
Add `hr` module router.

### Target

```ts
import { hrModuleRouter } from "./hr/router";

export const modulesRouter = router({
  manage: moduleManageRouter,
  pmt: pmtRouter,
  knowledge: knowledgeRouter,
  agentOrch: agentOrchRouter,
  collaboration: collaborationRouter,
  reporting: reportingRouter,
  hr: hrModuleRouter,
});
```

### Why
This creates the workspace-module surface:

- `modules.hr.staffing.*`
- `modules.hr.directory.*`
- `modules.hr.assignments.*`

This is how other workspace flows should consume HR.

---

## 5.4 `server/routers.ts`

### Change
Add root HR router.

### Target

```ts
import { hrRouter } from "./hr/router";

export const appRouter = router({
  // ...existing routers
  hr: hrRouter,
});
```

### Why
This creates the global HR namespace for admin, directory, organization, security, analytics, and compliance surfaces.

---

## 5.5 `drizzle/schema.ts`

### Change
Export all HR tables.

### Target

```ts
export * from './tables/hr-core';
export * from './tables/hr-organization';
export * from './tables/hr-staffing';
export * from './tables/hr-recruiting';
export * from './tables/hr-lifecycle';
export * from './tables/hr-records';
export * from './tables/hr-time';
export * from './tables/hr-learning';
export * from './tables/hr-performance';
export * from './tables/hr-compensation';
export * from './tables/hr-relations';
export * from './tables/hr-analytics';
export * from './tables/hr-security';
export * from './tables/hr-compliance';
```

---

## 5.6 `client/src/App.tsx`

### Change
Add HR route entries.

### Recommended route family

```text
/hr
/hr/directory
/hr/employees/:id
/hr/organization
/hr/positions
/hr/staffing
/hr/recruitment
/hr/onboarding
/hr/offboarding
/hr/time
/hr/learning
/hr/performance
/hr/compensation
/hr/relations
/hr/analytics
/hr/security
/hr/compliance
```

### Also add workspace-aware entry points later if needed

```text
/w/:id/hr
/w/:id/hr/staffing
/w/:id/hr/people
```

### Why
The repo already centralizes route declarations in `App.tsx`, so HR must register here to behave like a first-class area.

---

## 5.7 `client/src/components/MainLayout.tsx`

### Change
Add Human Resources to left navigation.

### Recommended placement
Place **Human Resources** near:

- Digital HQ
- Governance Center
- PM Central
- Collaboration

This is closer to how workforce management relates to the rest of the platform than burying it under generic resources.

### Recommended nav shape

```text
Human Resources
  - Directory
  - Organization
  - Positions
  - Staffing
  - Recruitment
  - Onboarding
  - Offboarding
  - Records
  - Time & Attendance
  - Learning
  - Performance
  - Compensation
  - Relations
  - Analytics
  - Security
  - Compliance
```

### Carbon-style note
Keep the left nav at two levels only.
Do not create deep third-level nesting inside the global sidebar.
Use page-level tabs inside HR detail pages instead.

---

## 6. Proposed Backend Composition

## 6.1 Root Router Shape

```ts
export const hrRouter = router({
  directory: hrDirectoryRouter,
  organization: hrOrganizationRouter,
  staffing: hrStaffingRouter,
  recruiting: hrRecruitingRouter,
  lifecycle: hrLifecycleRouter,
  records: hrRecordsRouter,
  time: hrTimeRouter,
  learning: hrLearningRouter,
  performance: hrPerformanceRouter,
  compensation: hrCompensationRouter,
  relations: hrRelationsRouter,
  analytics: hrAnalyticsRouter,
  security: hrSecurityRouter,
  compliance: hrComplianceRouter,
});
```

## 6.2 Workspace Module Router Shape

```ts
export const hrModuleRouter = router({
  directory: hrDirectoryWorkspaceRouter,
  staffing: hrStaffingWorkspaceRouter,
  assignments: hrAssignmentsWorkspaceRouter,
  approvals: hrApprovalWorkspaceRouter,
  lookup: hrLookupWorkspaceRouter,
});
```

### Separation rule
- `hr.*` = HR-owned global operations
- `modules.hr.*` = workspace-consumable HR operations

---

## 7. Database Table Plan

## 7.1 Core Backbone Tables

`drizzle/tables/hr-core.ts`

- `hr_people`
- `hr_person_contacts`
- `hr_person_addresses`
- `hr_emergency_contacts`
- `hr_worker_profiles`
- `hr_employment_records`
- `hr_employment_events`
- `hr_locations`
- `hr_legal_entities`

## 7.2 Organization Tables

`drizzle/tables/hr-organization.ts`

- `hr_org_units`
- `hr_org_unit_relations`
- `hr_job_families`
- `hr_job_levels`
- `hr_positions`
- `hr_position_budgets`

## 7.3 Staffing Tables

`drizzle/tables/hr-staffing.ts`

- `hr_workspace_assignments`
- `hr_workspace_assignment_history`
- `hr_workspace_roles`
- `hr_availability_snapshots`
- `hr_employee_skills`
- `hr_skill_catalog`
- `hr_employee_certifications`
- `hr_certification_catalog`

## 7.4 Recruiting Tables

`drizzle/tables/hr-recruiting.ts`

- `hr_recruitment_requests`
- `hr_job_postings`
- `hr_candidates`
- `hr_candidate_stages`
- `hr_interviews`
- `hr_offers`
- `hr_preboarding_cases`

## 7.5 Lifecycle Tables

`drizzle/tables/hr-lifecycle.ts`

- `hr_onboarding_cases`
- `hr_onboarding_tasks`
- `hr_offboarding_cases`
- `hr_offboarding_tasks`
- `hr_knowledge_transfer_items`

## 7.6 Records Tables

`drizzle/tables/hr-records.ts`

- `hr_documents`
- `hr_document_requirements`
- `hr_contracts`
- `hr_employment_changes`
- `hr_work_permits`
- `hr_hr_letters`

## 7.7 Time Tables

`drizzle/tables/hr-time.ts`

- `hr_leave_types`
- `hr_leave_requests`
- `hr_time_entries`
- `hr_overtime_requests`
- `hr_shift_plans`

## 7.8 Learning Tables

`drizzle/tables/hr-learning.ts`

- `hr_training_catalog`
- `hr_learning_assignments`
- `hr_learning_history`
- `hr_mandatory_training_rules`

## 7.9 Performance Tables

`drizzle/tables/hr-performance.ts`

- `hr_goals`
- `hr_performance_cycles`
- `hr_review_forms`
- `hr_feedback_entries`
- `hr_talent_reviews`
- `hr_succession_plans`

## 7.10 Compensation Tables

`drizzle/tables/hr-compensation.ts`

- `hr_salary_bands`
- `hr_compensation_records`
- `hr_bonus_records`
- `hr_benefit_plans`
- `hr_employee_benefits`

## 7.11 Relations Tables

`drizzle/tables/hr-relations.ts`

- `hr_policy_documents`
- `hr_policy_acknowledgements`
- `hr_grievances`
- `hr_disciplinary_actions`
- `hr_investigations`

## 7.12 Analytics Tables

`drizzle/tables/hr-analytics.ts`

- `hr_headcount_snapshots`
- `hr_attrition_snapshots`
- `hr_compliance_snapshots`
- `hr_custom_report_definitions`

## 7.13 Security and Compliance Tables

`drizzle/tables/hr-security.ts`

- `hr_field_access_policies`
- `hr_access_audit_logs`
- `hr_data_export_jobs`

`drizzle/tables/hr-compliance.ts`

- `hr_incident_reports`
- `hr_compliance_checks`
- `hr_risk_register`
- `hr_retention_rules`

---

## 8. Data Modeling Rules

Use these rules from the start:

1. **Never flatten person + employment + workspace membership into one table.**
2. **Use effective dating** for changes that must preserve history.
3. **Separate sensitive data** from directory-safe data.
4. **Expose DTOs, not ORM rows**.
5. **Use append-only event/history tables** for critical lifecycle changes.
6. **Do not hard-delete employment records**.
7. **Store file metadata in DB, file content in storage service**.

---

## 9. Contracts and Schemas

## 9.1 Backend contracts

Every public HR API should expose stable DTOs such as:

- `EmployeeSummary`
- `EmployeeProfile`
- `EmploymentRecord`
- `OrgUnit`
- `Position`
- `WorkspaceAssignment`
- `EligibleWorkerSearchInput`
- `OnboardingCase`
- `OffboardingCase`
- `LeaveRequest`
- `LearningRecord`
- `PerformanceReview`
- `CompensationSummary`
- `ComplianceIssue`

## 9.2 Validation stack

Recommended pattern:

- Drizzle for persistence model
- Zod for tRPC input/output validation
- JSON Schema for portable documentation and policy-linked validation
- frontend Zod mirrors for forms and tables

---

## 10. Security Model

HR cannot rely on plain auth only.

## 10.1 Roles

At minimum:

- `employee`
- `manager`
- `hrbp`
- `hr_admin`
- `comp_admin`
- `compliance_officer`
- `auditor`
- `workspace_admin`

## 10.2 Capability examples

- `hr.directory.read`
- `hr.directory.write`
- `hr.organization.manage`
- `hr.staffing.read`
- `hr.staffing.assign`
- `hr.records.read.team`
- `hr.records.read.self`
- `hr.compensation.read`
- `hr.compensation.manage`
- `hr.relations.manage`
- `hr.audit.read`
- `hr.compliance.manage`

## 10.3 Field masking examples

Sensitive fields should be gated separately:

- salary
- bank data
- disciplinary notes
- investigation notes
- ID numbers
- permit data
- private contact data

---

## 11. Frontend UX Rules

## 11.1 Shell behavior

HR should use the existing platform shell conventions:

- global left nav from `MainLayout`
- page-level sections inside HR
- workspace shell when HR is used inside workspace context
- right-side detail panel or drawer for frequent record inspection/editing

## 11.2 Table-first design

Most HR pages should be table-driven:

- directory
- positions
- recruitment requests
- onboarding cases
- leave requests
- training assignments
- performance cycles
- compliance issues

## 11.3 Detail pages

Employee detail page should use page-level tabs:

- Overview
- Employment
- Organization
- Assignments
- Skills
- Documents
- Learning
- Performance
- Access
- History

## 11.4 Avoid

- giant create/edit modals
- deeply nested left-nav levels
- direct exposure of sensitive fields in general list APIs
- one mega HR page with all domains mixed together

---

## 12. API Plan

## 12.1 Root HR API examples

```text
hr.directory.list
hr.directory.search
hr.directory.getById
hr.organization.listOrgUnits
hr.organization.listPositions
hr.staffing.listAssignments
hr.staffing.searchEligibleWorkers
hr.recruiting.createRequest
hr.lifecycle.createOnboardingCase
hr.records.getEmployeeDocuments
hr.time.submitLeaveRequest
hr.learning.assignTraining
hr.performance.startReviewCycle
hr.compensation.getSummary
hr.relations.createGrievance
hr.analytics.headcountSummary
hr.security.listAuditLogs
hr.compliance.listIssues
```

## 12.2 Workspace module API examples

```text
modules.hr.directory.lookupWorkspacePeople
modules.hr.staffing.listWorkspaceAssignments
modules.hr.staffing.searchEligibleWorkers
modules.hr.staffing.assignWorkerToWorkspace
modules.hr.approvals.getApproverChain
modules.hr.lookup.getManagerForWorker
```

---

## 13. Event and Job Plan

HR will need jobs even in the first implementation.

## 13.1 Jobs

- probation reminders
- contract expiry reminders
- work permit expiry reminders
- certification expiry reminders
- onboarding task reminders
- offboarding deprovision reminders
- monthly headcount snapshots
- staffing availability projection refresh

## 13.2 Domain events

Recommended events:

- `hr.worker.created`
- `hr.worker.activated`
- `hr.worker.updated`
- `hr.position.filled`
- `hr.workspace.assignment.created`
- `hr.workspace.assignment.ended`
- `hr.manager.changed`
- `hr.leave.approved`
- `hr.onboarding.started`
- `hr.offboarding.started`
- `hr.worker.deactivated`

---

## 14. Recommended Phase Plan

## Phase 0 — Foundation Design

### Deliverables
- this scaffold doc
- canonical domain model
- HR permissions matrix
- HR route map
- initial schema plan

### Exit criteria
- HR scope approved
- module key decision approved
- table grouping approved
- route naming approved

---

## Phase 1 — Native Module Registration

### Changes
- add `hr` to `MODULE_KEYS`
- update presets in `server/modules/registry.ts`
- create `server/modules/hr/router.ts`
- add HR to `modulesRouter`
- add docs folder and schemas folder

### Exit criteria
- workspace can enable `hr`
- module guards recognize `hr`
- no UI yet required beyond smoke checks

---

## Phase 2 — HR Backbone Backend

### Changes
- add `server/hr/*`
- add core Drizzle tables
- add migrations
- add root `hrRouter`
- mount `hr` in `appRouter`
- add audit + permission enforcement

### Scope
- people
- worker profiles
- employment records
- org units
- positions
- workspace assignments

### Exit criteria
- backend CRUD working
- protected routes validated
- workspace staffing queries working

---

## Phase 3 — HR Backbone Frontend

### Changes
- add HR routes in `client/src/App.tsx`
- add nav section in `MainLayout.tsx`
- add HR Directory, Employee Profile, Organization, Positions, Staffing pages

### Exit criteria
- HR visible in nav
- directory works
- employee profile works
- org and staffing views work

---

## Phase 4 — Lifecycle Workflows

### Changes
- recruitment
- onboarding
- offboarding
- document collection
- assignment approvals

### Exit criteria
- lifecycle cases can be opened and tracked
- reminders/jobs functioning
- audit logs generated

---

## Phase 5 — Operations and Development

### Changes
- time & attendance
- learning
- performance
- certifications

### Exit criteria
- leave, learning, and performance flows operational

---

## Phase 6 — Sensitive Domains

### Changes
- compensation
- benefits
- relations
- compliance
- advanced security views

### Exit criteria
- high-sensitivity sections gated and audited
- field-level masking enforced

---

## Phase 7 — Analytics and Hardening

### Changes
- snapshot jobs
- dashboards
- exports
- E2E coverage
- load/perf checks

### Exit criteria
- strategic HR dashboards available
- test coverage acceptable
- auditability acceptable

---

## 15. Recommended PR Breakdown

## PR 1 — Module Registration
- `drizzle/tables/workspace-modules.ts`
- `server/modules/registry.ts`
- `server/modules/router.ts`
- `docs/hr/*`

## PR 2 — Core Tables + Migrations
- `drizzle/tables/hr-core.ts`
- `drizzle/tables/hr-organization.ts`
- `drizzle/tables/hr-staffing.ts`
- `drizzle/schema.ts`
- migrations

## PR 3 — Root HR Backend
- `server/hr/router.ts`
- `server/hr/directory/*`
- `server/hr/organization/*`
- `server/hr/staffing/*`
- `server/routers.ts`

## PR 4 — HR Frontend Backbone
- `client/src/App.tsx`
- `client/src/components/MainLayout.tsx`
- `client/src/features/hr/*`
- `client/src/pages/hr/*`

## PR 5 — Recruiting + Lifecycle
- recruiting and lifecycle tables/routes/pages/jobs

## PR 6 — Time + Learning + Performance
- time/learning/performance tables/routes/pages

## PR 7 — Compensation + Relations + Compliance
- high-sensitivity domains and policies

## PR 8 — Analytics + Hardening
- snapshot jobs, exports, audit views, E2E tests

---

## 16. Acceptance Criteria for “HR Module Exists”

HR should only be considered implemented when all of the following are true:

1. `hr` is a real module key in workspace bindings.
2. `hr` can be enabled/disabled per workspace.
3. root HR routes exist in `appRouter`.
4. workspace HR routes exist in `modulesRouter`.
5. at least the workforce backbone tables are migrated.
6. employee directory UI exists.
7. employee profile UI exists.
8. workspace staffing assignment flow exists.
9. permissions and field masking exist.
10. audit logging exists for sensitive mutations.
11. at least one expiry/reminder job exists.
12. tests cover core HR read/write paths.

---

## 17. What to Build First in Code

If implementation starts immediately, the best first coding sequence is:

1. add `hr` to module keys
2. add `hr` to module presets
3. create `drizzle/tables/hr-core.ts`
4. create `drizzle/tables/hr-organization.ts`
5. create `drizzle/tables/hr-staffing.ts`
6. export them from `drizzle/schema.ts`
7. create `server/hr/router.ts`
8. create `server/hr/directory/router.ts`
9. create `server/hr/organization/router.ts`
10. create `server/hr/staffing/router.ts`
11. mount `hr` in `server/routers.ts`
12. create `server/modules/hr/router.ts`
13. mount `hr` in `server/modules/router.ts`
14. add `/hr/*` routes in `client/src/App.tsx`
15. add HR nav section in `MainLayout.tsx`
16. implement Directory → Employee Profile → Staffing UI in that order

That is the shortest path to getting a native HR backbone into the app without creating rework.

---

## 18. Final Recommendation

For this repo, HR should be implemented as:

- a **native top-level domain** on the backend
- a **workspace-aware module** in `modules.*`
- a **table-first Carbon-style UI area** on the frontend
- a **history-preserving, policy-enforced workforce system of record**
- a **staffing provider for other app domains and workspaces**

The safest rollout path is:

**module registration → core tables → root backend → workspace router → frontend backbone → lifecycle → sensitive domains → analytics/hardening**

That sequence aligns with the repo’s current architecture and avoids building HR as a disconnected subsystem.
