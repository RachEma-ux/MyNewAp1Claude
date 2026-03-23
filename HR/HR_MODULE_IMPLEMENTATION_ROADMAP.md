# HR Module Implementation Roadmap

## Document Status

- **Document type:** Architecture + implementation roadmap
- **Target repo path:** `docs/hr/HR_MODULE_IMPLEMENTATION_ROADMAP.md`
- **Module name:** Human Resources (`hr`)
- **Module posture:** Fully independent domain module, workspace-consumable, extractable later if needed

---

## 1. Executive Summary

Human Resources should be implemented as a **first-class, independent module** inside the app, not as a loose collection of screens.

The correct implementation strategy is:

1. Treat HR as a **bounded domain** with its own backend services, router namespace, database tables, policies, schemas, jobs, and UI shell.
2. Make HR the **system of record** for workforce data.
3. Let workspaces and other domains consume HR through **APIs, projections, and events**, not through direct table reads.
4. Integrate HR into the existing **workspace module registry** so it can be enabled, seeded, governed, and permissioned like other modules.
5. Build in phases, starting with the **workforce backbone** before advanced HR features.

This approach keeps the module clean, reusable, secure, and aligned with the app’s current architecture.

---

## 2. What the Current Repo Already Gives Us

The current app already has the main structural seams needed for a proper HR module:

- `client/` for the frontend application.
- `server/` for backend domains, routers, middleware, services, and infrastructure.
- `drizzle/` and `migrations/` for PostgreSQL schema evolution.
- `schemas/` for reusable JSON schemas.
- `docs/` for architecture and product documentation.
- `policies/` for governance-oriented assets.
- `server/modules/` for workspace-scoped module registration and enablement.

That means HR can be implemented as a **native module**, not a special-case subsystem.

---

## 3. Strategic Positioning of HR in This App

### 3.1 HR must be a domain, not a utility

HR is not just a contact list.
It is the workforce authority for:

- people
- employees
- employment lifecycle
- positions
- org structure
- staffing to workspaces
- skills and certifications
- onboarding/offboarding
- HR compliance
- role visibility
- RACI-linked workflow ownership

### 3.2 HR must be independent, but platform-integrated

HR should:

- own its own records and rules
- integrate with workspace assignment
- integrate with access control
- integrate with governance and audit
- integrate with orchestration workflows
- integrate with document storage

It should **not** be tightly coupled to PM, Agents, Collaboration, or Knowledge.
Those modules should consume HR through contracts.

### 3.3 HR must support two operating modes

#### Mode A — HR as internal system of record
Used when the platform directly manages employee/workforce data.

#### Mode B — HR as workforce directory and staffing layer
Used when the platform needs to assign humans to workspaces, workflows, approvals, and domain tasks.

For this app, the initial implementation should cover **both**, but prioritize **Mode B-compatible architecture** from day one.

---

## 4. Core Design Principles

1. **Bounded domain:** HR owns HR data.
2. **Workspace-aware:** HR can assign humans to workspace domains.
3. **Policy-aware:** every sensitive mutation passes policy and audit.
4. **Schema-first:** backend contracts and events are versioned.
5. **History-preserving:** employment and assignment changes are effective-dated.
6. **Privacy-segmented:** sensitive data lives in restricted tables and restricted DTOs.
7. **Module-native:** HR is registered in the module registry and seeded per workspace.
8. **Extractable:** structure it so it can become its own service later.

---

## 5. Functional Scope

### 5.1 Full target module scope

The full HR suite includes:

1. Workforce Planning & Organization
2. Talent Acquisition
3. Onboarding & Offboarding
4. Employee Records & Administration
5. Compensation & Benefits
6. Time & Attendance
7. Learning & Development
8. Performance & Talent Management
9. Employee Relations
10. Well Being & Engagement
11. HR Analytics & Reporting
12. Security & Access
13. Compliance

### 5.2 Recommended implementation scope by stage

#### Stage 1 — Workforce Backbone
Build first:

- employee directory
- person/employee profile backbone
- organization structure
- job architecture
- positions
- workspace staffing assignments
- core access model
- document metadata
- audit trail
- basic analytics

#### Stage 2 — Lifecycle Operations
Then add:

- recruitment requests
- candidate pipeline
- offer workflow
- preboarding
- onboarding
- offboarding

#### Stage 3 — Workforce Operations
Then add:

- time tracking
- leave management
- overtime
- shift planning
- training
- certifications
- learning history
- performance basics

#### Stage 4 — Sensitive and Advanced Functions
Finally add:

- compensation
- benefits
- employee relations
- advanced compliance
- risk management
- succession planning
- advanced HR analytics

---

## 6. Canonical Domain Model

Do **not** model HR as one `employees` table.
The correct backbone is:

- **Person**
- **Worker Profile**
- **Employment Record**
- **Position**
- **Org Unit**
- **Workspace Assignment**
- **Access Mapping**
- **Lifecycle Events**

### 6.1 Person
Represents the human identity.

Fields:

- `id`
- `tenant_id`
- `external_ref`
- `first_name`
- `last_name`
- `display_name`
- `preferred_name`
- `primary_email`
- `primary_phone`
- `status`
- `created_at`
- `updated_at`

### 6.2 Worker Profile
Represents the platform-facing workforce identity.

Fields:

- `id`
- `person_id`
- `employee_number`
- `worker_type` (`employee`, `contractor`, `intern`, `consultant`)
- `legal_entity_id`
- `home_org_unit_id`
- `manager_worker_id`
- `primary_location_id`
- `employment_category`
- `default_workspace_visibility`
- `status`

### 6.3 Employment Record
Represents the legal/employment relationship over time.

Fields:

- `id`
- `worker_id`
- `contract_type`
- `employment_status`
- `start_date`
- `end_date`
- `probation_end_date`
- `termination_reason`
- `fte_ratio`
- `effective_from`
- `effective_to`
- `version`

### 6.4 Position
Represents the approved organizational seat.

Fields:

- `id`
- `position_code`
- `title`
- `job_family_id`
- `job_level_id`
- `org_unit_id`
- `cost_center_id`
- `headcount_budget_id`
- `status`
- `filled_by_worker_id`

### 6.5 Org Unit
Represents organizational structure.

Fields:

- `id`
- `code`
- `name`
- `type`
- `parent_org_unit_id`
- `manager_worker_id`
- `status`

### 6.6 Workspace Assignment
This is the most important bridge to the rest of the app.

Fields:

- `id`
- `worker_id`
- `workspace_id`
- `domain_role`
- `allocation_percent`
- `start_date`
- `end_date`
- `staffing_status`
- `assignment_source`
- `approval_status`
- `visibility_scope`

### 6.7 Skills and Certifications
Used for staffing and eligibility.

Fields and entities:

- `skills`
- `worker_skills`
- `certifications`
- `worker_certifications`
- `mandatory_training_rules`

### 6.8 Lifecycle Cases
Workflow-driven records.

Entities:

- `recruitment_requests`
- `candidates`
- `offers`
- `onboarding_cases`
- `onboarding_tasks`
- `offboarding_cases`
- `offboarding_tasks`

---

## 7. Repo-Aligned Placement Strategy

## 7.1 Recommended backend placement

```text
server/
  hr/
    router.ts
    procedures.ts
    types.ts
    constants.ts

    people/
      service.ts
      repository.ts
      schemas.ts
      mapper.ts

    organization/
      service.ts
      repository.ts
      schemas.ts
      mapper.ts

    positions/
      service.ts
      repository.ts
      schemas.ts

    staffing/
      service.ts
      repository.ts
      schemas.ts

    recruiting/
      service.ts
      repository.ts
      schemas.ts

    lifecycle/
      onboarding-service.ts
      offboarding-service.ts
      repository.ts
      schemas.ts

    records/
      service.ts
      repository.ts
      schemas.ts

    learning/
      service.ts
      repository.ts
      schemas.ts

    performance/
      service.ts
      repository.ts
      schemas.ts

    relations/
      service.ts
      repository.ts
      schemas.ts

    compliance/
      service.ts
      repository.ts
      schemas.ts

    analytics/
      service.ts
      repository.ts
      schemas.ts

    policies/
      access.ts
      field-visibility.ts
      mutation-rules.ts

    jobs/
      probation-reminders.ts
      certification-expiry.ts
      onboarding-sync.ts
      offboarding-sync.ts
      projection-refresh.ts

    events/
      publisher.ts
      schemas.ts
```

## 7.2 Recommended frontend placement

```text
client/src/
  pages/
    HRPage.tsx
    HREmployeeDirectoryPage.tsx
    HREmployeeProfilePage.tsx
    HROrganizationPage.tsx
    HRPositionsPage.tsx
    HRWorkspaceStaffingPage.tsx
    HRRecruitmentPage.tsx
    HROnboardingPage.tsx
    HROffboardingPage.tsx
    HRRecordsPage.tsx
    HRLearningPage.tsx
    HRPerformancePage.tsx
    HRAnalyticsPage.tsx
    HRSecurityPage.tsx
    HRCompliancePage.tsx

  features/hr/
    api/
    components/
    hooks/
    tables/
    forms/
    filters/
    panels/
    tabs/
    permissions/
    mappers/
```

## 7.3 Recommended persistence placement

```text
drizzzle/
  tables/
    hr-people.ts
    hr-organization.ts
    hr-positions.ts
    hr-staffing.ts
    hr-recruiting.ts
    hr-lifecycle.ts
    hr-records.ts
    hr-learning.ts
    hr-performance.ts
    hr-relations.ts
    hr-compliance.ts
    hr-analytics.ts

migrations/
  00xx_create_hr_people.sql
  00xx_create_hr_organization.sql
  00xx_create_hr_positions.sql
  00xx_create_hr_staffing.sql
  ...
```

## 7.4 Recommended schema placement

```text
schemas/
  hr.employee-summary.schema.json
  hr.employee-profile.schema.json
  hr.workspace-assignment.schema.json
  hr.eligible-workers-query.schema.json
  hr.onboarding-case.schema.json
  hr.leave-request.schema.json
  hr.performance-review.schema.json
  hr.audit-event.schema.json
```

## 7.5 Recommended documentation placement

```text
docs/
  hr/
    HR_MODULE_IMPLEMENTATION_ROADMAP.md
    HR_DOMAIN_MODEL.md
    HR_API_SPEC.md
    HR_ROLE_VISIBILITY_MATRIX.md
    HR_RACI_MODEL.md
    HR_SECURITY_AND_COMPLIANCE.md
```

---

## 8. Backend Architecture

### 8.1 Router strategy

Add a dedicated HR tRPC router and mount it in the root `appRouter`.

Recommended namespace:

- `hr.people`
- `hr.organization`
- `hr.positions`
- `hr.staffing`
- `hr.recruiting`
- `hr.lifecycle`
- `hr.records`
- `hr.learning`
- `hr.performance`
- `hr.relations`
- `hr.compliance`
- `hr.analytics`
- `hr.security`

### 8.2 Procedure levels

Use the existing protected/governed/admin patterns.

Recommended procedure classes:

- `publicProcedure` only for public-safe directory or job posting views if ever needed
- `protectedProcedure` for normal authenticated HR reads
- `governedProcedure` for policy-sensitive HR mutations
- `adminProcedure` for system-level security/configuration actions

### 8.3 Service-layer rule

Every request should follow this flow:

```text
route/procedure
  -> input validation
  -> workspace/tenant resolution
  -> permission + field visibility checks
  -> service layer
  -> repository layer
  -> DB / event / audit write
```

No frontend page should rely on raw DB shapes.
No route should bypass service and policy logic.

### 8.4 Cross-domain integration points

HR should integrate with:

- workspace registry
- workspace guards
- module registry
- policy gate
- audit logger
- document/file storage
- orchestrator
- notifications
- identity/auth

---

## 9. Database Strategy

### 9.1 Recommended logical split

Use HR-prefixed tables and segment highly sensitive data.

Recommended logical grouping:

- `hr_people`
- `hr_worker_profiles`
- `hr_employment_records`
- `hr_org_units`
- `hr_positions`
- `hr_workspace_assignments`
- `hr_skills`
- `hr_worker_skills`
- `hr_certifications`
- `hr_worker_certifications`
- `hr_recruitment_requests`
- `hr_candidates`
- `hr_interviews`
- `hr_offers`
- `hr_onboarding_cases`
- `hr_onboarding_tasks`
- `hr_offboarding_cases`
- `hr_offboarding_tasks`
- `hr_documents`
- `hr_employment_changes`
- `hr_letters`
- `hr_time_entries`
- `hr_leave_requests`
- `hr_shift_plans`
- `hr_learning_history`
- `hr_goals`
- `hr_reviews`
- `hr_grievances`
- `hr_disciplinary_actions`
- `hr_investigations`
- `hr_policy_acknowledgements`
- `hr_compliance_checks`
- `hr_risk_assessments`

### 9.2 Sensitive data split

Highly sensitive data should be isolated from general directory reads.

Suggested restricted tables:

- `hr_private_identity_docs`
- `hr_private_salary_records`
- `hr_private_benefit_enrollments`
- `hr_private_case_notes`
- `hr_private_bank_details`

### 9.3 Core conventions

Every important transactional table should include:

- `id`
- `tenant_id`
- `created_at`
- `created_by`
- `updated_at`
- `updated_by`
- `status`
- `effective_from`
- `effective_to`
- `version`
- `source`

### 9.4 History model

Do not overwrite sensitive historical facts.
Use effective-dating and append-only history for:

- manager changes
- promotions
- transfers
- workspace assignments
- compensation changes
- termination lifecycle
- role visibility changes

---

## 10. Schema and Contract Strategy

### 10.1 API contracts

Use stable DTOs rather than raw table objects.

Canonical DTOs:

- `EmployeeSummary`
- `EmployeeProfile`
- `EmploymentRecordView`
- `OrgUnitSummary`
- `PositionSummary`
- `WorkspaceAssignmentSummary`
- `EligibleWorkerSearchRequest`
- `EligibleWorkerSearchResult`
- `OnboardingCaseView`
- `OffboardingCaseView`
- `LeaveRequestView`
- `LearningRecordView`
- `PerformanceReviewView`
- `ComplianceIssueView`

### 10.2 Validation stack

- tRPC input validation with Zod
- JSON schemas in `schemas/`
- frontend form schemas reused from shared contracts where possible

### 10.3 Event contracts

Recommended internal event set:

- `hr.person.created`
- `hr.worker.created`
- `hr.worker.activated`
- `hr.worker.updated`
- `hr.position.created`
- `hr.position.filled`
- `hr.workspace_assignment.created`
- `hr.workspace_assignment.changed`
- `hr.workspace_assignment.ended`
- `hr.onboarding.started`
- `hr.onboarding.completed`
- `hr.offboarding.started`
- `hr.offboarding.completed`
- `hr.leave.approved`
- `hr.certification.expiring`
- `hr.compliance.issue.opened`

These should be versioned from the start.

---

## 11. Frontend Architecture

### 11.1 UI shell strategy

HR should be a dedicated app/module experience inside the existing shell, with Carbon-style information architecture and dense enterprise navigation.

Primary left-nav groups:

1. Workforce Planning & Organization
2. Talent Acquisition
3. Onboarding & Offboarding
4. Employee Records & Administration
5. Compensation & Benefits
6. Time & Attendance
7. Learning & Development
8. Performance & Talent Management
9. Employee Relations
10. Well Being & Engagement
11. HR Analytics & Reporting
12. Security & Access
13. Compliance

### 11.2 Page composition pattern

Each major page should follow this pattern:

- page header
- KPIs / summary strip
- search + filters toolbar
- primary grid/table
- detail panel / side sheet
- tabs inside detail pages
- audit and activity section where relevant

### 11.3 Key frontend screens

Build at minimum:

- Employee Directory
- Employee Profile
- Organization Tree
- Position Management
- Workspace Staffing Board
- Recruitment Requests
- Onboarding Cases
- Offboarding Cases
- Document Center
- Leave and Time dashboard
- Learning dashboard
- Performance dashboard
- Compliance dashboard

### 11.4 Profile page tabs

Recommended tabs:

- Overview
- Employment
- Organization
- Workspace Assignments
- Skills & Certifications
- Documents
- Learning
- Performance
- Access
- History

### 11.5 Visibility handling

UI must respect both route-level and field-level visibility.

Example:

- Managers can see team assignment and learning status.
- Managers cannot automatically see salary or confidential disciplinary notes.
- Employees can see self-service documents and training.
- HRBP can see broader lifecycle data.
- Admin can manage configuration and security policy.

---

## 12. Role Visibility Model

### 12.1 Canonical platform roles

Use these baseline personas:

- Employee
- Manager
- HRBP
- Admin

### 12.2 Access strategy

Use combined **RBAC + contextual ABAC**.

Access should depend on:

- actor role
- self vs team vs org scope
- workspace relationship
- legal entity or tenant scope
- field sensitivity
- action sensitivity
- active employment state

### 12.3 Field sensitivity tiers

Recommended data classes:

- `public_internal`
- `team_visible`
- `manager_visible`
- `hr_restricted`
- `admin_restricted`
- `confidential_case`

This field classification should drive both backend DTO shaping and frontend rendering.

---

## 13. Workspace Integration Strategy

This is the most important app-specific requirement.

The HR module must provide workforce availability and assignment services to the rest of the platform.

### 13.1 What other domains need from HR

Other domains should be able to ask:

- who is assigned to this workspace?
- who can be assigned?
- who is manager / owner / reviewer here?
- who has the required skills?
- who is available?
- who is onboarding / offboarding?
- who should approve this action?

### 13.2 Required cross-domain reads

Recommended HR query surfaces:

- `getWorkspaceStaff(workspaceId)`
- `searchEligibleWorkers(workspaceId, criteria)`
- `getWorkerAssignmentSummary(workerId)`
- `getWorkerSkills(workerId)`
- `getAvailability(workerId | workspaceId)`
- `getApproverChain(workerId | workspaceId)`

### 13.3 Integration rule

No other module should directly read HR tables.
Consumption must happen through:

- HR tRPC procedures
- read models/projections
- events

---

## 14. Security, Privacy, and Compliance

### 14.1 Security requirements

HR contains sensitive workforce data, so it must be treated as a high-sensitivity domain.

Minimum controls:

- route-level auth enforcement
- field-level visibility filtering
- mutation-level policy gate checks
- audit logging for sensitive reads and writes
- encrypted secrets and restricted documents
- controlled export capability
- admin-only security configuration
- retention and archival rules

### 14.2 Compliance requirements

The module should be designed to support:

- GDPR-style privacy controls
- labor compliance tracking
- work permit expiry tracking
- policy acknowledgement tracking
- incident and grievance logging
- auditable lifecycle actions

### 14.3 Audit requirements

Sensitive actions that must be audited:

- profile updates
- employment changes
- assignment changes
- compensation changes
- access changes
- disciplinary case access
- document download
- offboarding execution
- admin overrides

---

## 15. Recommended Routes

### 15.1 Frontend routes

Suggested UI routes:

```text
/hr
/hr/directory
/hr/employees/:employeeId
/hr/organization
/hr/positions
/hr/workspace-staffing
/hr/recruitment
/hr/recruitment/requests
/hr/recruitment/candidates
/hr/onboarding
/hr/offboarding
/hr/records
/hr/time
/hr/learning
/hr/performance
/hr/relations
/hr/analytics
/hr/security
/hr/compliance
```

### 15.2 Backend router namespace

Suggested tRPC namespace:

```text
hr.people.list
hr.people.getById
hr.people.search
hr.organization.listUnits
hr.organization.getTree
hr.positions.list
hr.positions.create
hr.staffing.listWorkspaceAssignments
hr.staffing.searchEligibleWorkers
hr.staffing.assignWorker
hr.staffing.endAssignment
hr.recruiting.listRequests
hr.recruiting.createRequest
hr.lifecycle.createOnboardingCase
hr.lifecycle.createOffboardingCase
hr.records.getDocuments
hr.records.createEmploymentChange
hr.learning.listAssignments
hr.performance.listReviews
hr.relations.createCase
hr.compliance.listIssues
hr.analytics.getDashboard
hr.security.listRoles
```

---

## 16. Server Runtime and Jobs

### 16.1 Runtime components needed

- API server
- PostgreSQL
- background worker
- scheduler/cron runner
- object storage for documents
- optional search index later

### 16.2 Jobs to implement

- probation review reminders
- contract expiry reminders
- certification expiry reminders
- work permit expiry reminders
- onboarding task sync
- offboarding access-removal coordination
- monthly workforce snapshot generation
- analytics projection refresh

---

## 17. Canonical RACI Handling in the Product

The source material contains the same responsibilities expressed as:

- visibility matrix
- RACI tables
- visual diagram
- hierarchical tree
- swimlane
- mind map
- XMind layout

For the repo, do **not** store all of those as equal authorities.

Use this documentation hierarchy:

### 17.1 Canonical authority

- `HR_ROLE_VISIBILITY_MATRIX.md`
- `HR_RACI_MODEL.md`

### 17.2 Optional visualization appendix

- mind map / swimlane / XMind exports can exist as derived views
- derived views must state they are **non-canonical visualizations**

This avoids documentation drift.

---

## 18. Implementation Roadmap

## Phase 0 — Discovery and Architecture Freeze

### Goals

- confirm HR scope for v1
- define canonical domain model
- define security classes
- define role visibility model
- define workspace integration model

### Deliverables

- `docs/hr/HR_MODULE_IMPLEMENTATION_ROADMAP.md`
- `docs/hr/HR_DOMAIN_MODEL.md`
- `docs/hr/HR_ROLE_VISIBILITY_MATRIX.md`
- `docs/hr/HR_RACI_MODEL.md`
- `docs/hr/HR_SECURITY_AND_COMPLIANCE.md`

### Tasks

- identify HR source-of-truth boundaries
- define entities and naming conventions
- define field sensitivity levels
- decide whether compensation ships in v1 or later
- decide whether recruitment and offboarding ship together or sequentially
- map existing workspace roles to HR personas
- define canonical workspace assignment model
- add `hr` to module taxonomy

---

## Phase 1 — Module Registration and Skeleton

### Goals

Create the HR module as a first-class app module.

### Deliverables

- `server/hr/` module skeleton
- `server/hr/router.ts`
- `server/hr/types.ts`
- `server/hr/constants.ts`
- `client/src/pages/HRPage.tsx`
- initial navigation entry
- module registry update for `hr`

### Tasks

- add `hr` module key to workspace module model
- add `hr` to module presets where appropriate
- extend `server/modules/registry.ts`
- extend module management UI/API so HR can be enabled/disabled per workspace
- mount `hrRouter` in `server/routers.ts`
- add `/hr` route in `client/src/App.tsx`
- create placeholder pages for major HR sections

### Exit criteria

- HR appears as a module in workspace/module management
- HR route loads inside authenticated shell
- HR can be toggled per workspace

---

## Phase 2 — Database Foundation

### Goals

Build the backbone tables required for directory + organization + staffing.

### Deliverables

- HR table definitions in Drizzle
- migrations for core tables
- repositories for people, organization, and staffing

### Tasks

- create tables for people, worker profiles, employment records, org units, positions, workspace assignments
- create indices for search and staffing queries
- create audit-linked columns
- implement effective-dating strategy
- add seed utilities where needed
- write migration rollback/verification notes

### Exit criteria

- DB can persist employee directory and workspace assignments
- history-aware changes work without destructive overwrites

---

## Phase 3 — API and Contract Layer

### Goals

Expose stable HR read/write contracts.

### Deliverables

- people router
- organization router
- positions router
- staffing router
- JSON schemas
- shared DTO mappers

### Tasks

- create Zod inputs/outputs
- create employee summary/profile DTOs
- create list/search/get-by-id procedures
- create workspace assignment procedures
- create eligible worker search API
- create permission-aware field masking in mappers
- define event payload schemas

### Exit criteria

- frontend can query HR through stable contracts
- field visibility is enforced in backend responses

---

## Phase 4 — Frontend Foundation

### Goals

Ship the first usable HR UI layer.

### Deliverables

- Employee Directory page
- Employee Profile page
- Organization page
- Position Management page
- Workspace Staffing page

### Tasks

- create HR landing page
- create Carbon-style left-nav grouping
- add data tables with filter/search/pagination
- create employee detail panel and full profile page
- create organization tree/table view
- create staffing assignment UI
- connect pages to tRPC queries and mutations
- implement loading, empty, error, and permission-denied states

### Exit criteria

- users can browse employees, see profiles, and manage workspace staffing

---

## Phase 5 — Security, Policy, and Audit Hardening

### Goals

Make HR safe enough for real data.

### Deliverables

- field sensitivity policy map
- governed mutation wrappers
- audit coverage for critical actions
- export restrictions

### Tasks

- classify fields by sensitivity tier
- add route/procedure authorization rules
- add audit events for sensitive reads and writes
- gate dangerous actions behind governed procedures
- add masking for confidential fields
- add admin-only configuration surfaces
- test fail-closed behavior on sensitive paths

### Exit criteria

- sensitive data is not exposed through broad list endpoints
- all critical actions are audited

---

## Phase 6 — Lifecycle Workflows

### Goals

Add recruiting, onboarding, and offboarding.

### Deliverables

- recruitment request flow
- candidate pipeline basics
- onboarding cases and tasks
- offboarding cases and tasks
- access-removal coordination hooks

### Tasks

- create recruiting tables and APIs
- create onboarding/offboarding case models
- integrate document collection workflow
- integrate equipment/access task generation
- integrate exit interview and knowledge transfer steps
- emit lifecycle events
- connect to orchestrator for task execution and reminders

### Exit criteria

- hiring and exit lifecycle runs as structured cases, not ad hoc notes

---

## Phase 7 — Workforce Operations

### Goals

Add time, learning, and performance basics.

### Deliverables

- leave requests
- overtime requests
- training assignments
- certifications tracking
- goals and reviews basics

### Tasks

- add time/leave tables and APIs
- add learning history and catalog structures
- add mandatory training tracking
- add certification expiry jobs
- add goals and review cycles MVP

### Exit criteria

- employee operational lifecycle is covered beyond static records

---

## Phase 8 — Compliance and Advanced Functions

### Goals

Add higher-sensitivity and governance-heavy functionality.

### Deliverables

- grievance and investigation handling
- policy acknowledgements
- compliance issue tracking
- risk management basics
- advanced analytics
- optional compensation foundation

### Tasks

- add employee relations records and procedures
- add policy acknowledgement model
- add compliance dashboard
- add incident reporting flow
- add regulatory/evidence-oriented exports
- add advanced role visibility audits
- add compensation only when privacy model is mature enough

### Exit criteria

- HR supports governed compliance operations and advanced reporting

---

## 19. Testing Strategy

### 19.1 Backend tests

- repository tests
- router/procedure tests
- permission boundary tests
- field masking tests
- audit emission tests
- migration tests
- effective-date history tests

### 19.2 Frontend tests

- route access tests
- permission-based rendering tests
- table/filter state tests
- forms and validation tests
- profile/tab rendering tests

### 19.3 End-to-end tests

Critical E2E scenarios:

- create worker and assign to workspace
- manager can see team-scoped data only
- employee can access self-service views only
- HRBP can manage lifecycle cases
- admin can manage security settings
- offboarding triggers access-removal task generation

---

## 20. Immediate Next Build Order

If implementation starts now, the exact order should be:

1. Add `hr` to module registry and workspace presets.
2. Add HR route shell and placeholder UI pages.
3. Create core HR tables.
4. Build employee directory and profile APIs.
5. Build organization and positions APIs.
6. Build workspace staffing APIs.
7. Build directory/profile/staffing UI.
8. Add field visibility and audit hardening.
9. Build onboarding/offboarding lifecycle cases.
10. Expand to learning, time, performance, compliance.

---

## 21. Recommendation for V1 Cut

The best V1 for this app is:

- Employee Directory
- Employee Profile
- Org Structure
- Position Management
- Workspace Staffing
- Document metadata
- Role visibility model
- Audit coverage
- Basic onboarding/offboarding case handling

This gives immediate value to every workspace while keeping the first release manageable.

---

## 22. Final Recommendation

Implement HR as a **workspace-aware, policy-aware, domain-native module**.

Do not treat it as:

- a simple employee list
- a front-end menu pack
- a loose admin page collection
- a direct DB extension of another module

The right model is:

- **independent HR domain**
- **module registry integration**
- **workspace staffing bridge**
- **governed mutation model**
- **history-preserving data model**
- **phased rollout**

That is the cleanest path to a real HR module that fits this app’s architecture and can scale with the rest of the platform.
