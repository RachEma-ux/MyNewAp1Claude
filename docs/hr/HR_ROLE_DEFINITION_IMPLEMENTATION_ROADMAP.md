# HR Role-Definition Implementation Roadmap

## Document Control

- **Document type:** Implementation roadmap + execution plan
- **Intended repo path:** `docs/hr/HR_ROLE_DEFINITION_IMPLEMENTATION_ROADMAP.md`
- **Related standards:** `docs/hr/HR_ROLE_DEFINITION_FRAMEWORK.md`, `docs/hr/HR_ROLE_VISIBILITY_MATRIX.md`, `docs/hr/HR_RACI_MODEL.md`
- **Module:** Human Resources (`hr`)
- **Status:** Draft, implementation-ready
- **Primary audience:** HR product owners, platform architects, backend engineers, frontend engineers, governance reviewers, QA, workspace owners
- **Primary objective:** Implement role definition as a governed, versioned, effective-dated HR capability inside MyNewAp1Claude without weakening current HR-module boundaries

---

## 1. Executive Summary

The HR module already exists as a broad, first-class domain. This roadmap is therefore **not** a greenfield plan to "add HR." It is an additive plan to implement **role definition as a canonical control surface** inside the existing HR domain.

The target end-state is:

- one authoritative role-definition record per organizational role
- versioned and effective-dated role definitions
- explicit separation between **role definition**, **position**, **person**, and **permission**
- runtime-enforced visibility and masking for sensitive role content
- approval, publication, and supersession lifecycle
- clean integration with positions, staffing, recruiting, performance, and workspace assignment
- auditable reads and mutations for restricted HR content

This roadmap intentionally avoids a full HR rewrite. It assumes the current HR domain, router seams, database layer, and UI shell remain in place and are extended in a disciplined way.

---

## 2. Why this roadmap is needed now

The role-definition framework establishes the policy and operating standard. The app now needs the implementation path that turns that standard into working product behavior.

Without this roadmap, the platform risks falling into one or more of these failure modes:

- role definition remains a static document instead of a structured HR object
- positions and roles drift apart
- permissions are inferred from job titles without formal policy
- managers write inconsistent role descriptions with no version control
- sensitive role data is visible through generic HR views
- recruitment, staffing, and performance consume different definitions of the same role

The roadmap exists to prevent that fragmentation.

---

## 3. Current-State Baseline

Implementation should begin from the current repo reality, not from theory.

### 3.1 What already exists

The repository already supports the major foundations needed for this work:

- a mandatory repo operating model with Planner -> Builder -> Reviewer -> Tester -> Governance for substantial work
- a layered architecture where governance sits between API and domain logic
- an HR module already positioned as an independent, workspace-consumable domain
- broad HR schema, routers, frontend pages, tests, and documentation across the module

### 3.2 What this implies for role-definition work

Because the broad HR domain already exists, the correct implementation posture is:

1. **Add a canonical role-definition layer**, do not rebuild the HR module.
2. **Reuse existing HR module seams**: schema, routers, policy gates, audit logging, workspace integration, UI patterns.
3. **Close runtime enforcement gaps** while introducing role-definition visibility and lifecycle controls.
4. **Avoid mixing semantics** between role definitions, positions, worker profiles, and permissions.

### 3.3 Known constraint from the current HR state

The HR module has already reached broad functional coverage, but earlier audit material noted that permission enforcement and some masking behavior were still advisory in parts of the runtime. Role-definition work should therefore include real enforcement, not documentation only.

---

## 4. Target End-State

At the end of this roadmap, the system should support the following operating model.

### 4.1 Canonical role-definition object

A role definition becomes a first-class HR record that can be:

- drafted
- reviewed
- approved
- published
- made effective on a date
- superseded by a new version
- retired without destructive overwrite

### 4.2 Clean data separation

The app must clearly distinguish:

- **Role definition:** reusable organizational definition
- **Position:** seat linked to the role definition
- **Worker / employee profile:** person-specific employment record
- **Workspace assignment:** contextual assignment into a workspace
- **Permission policy:** system access decision, not job title alone

### 4.3 Runtime visibility enforcement

The role-visibility model must be enforced in both backend and frontend:

- route-level access checks
- DTO shaping and field masking
- audit of sensitive reads where policy requires it
- no leakage of restricted rationale, succession notes, compensation notes, or case-linked content through generic role views

### 4.4 Integration outcomes

Approved role definitions should feed or support:

- positions and staffing
- recruiting requisitions and job descriptions
- onboarding and offboarding readiness
- performance baselines and role KPIs
- workspace approval and ownership mapping
- reporting and analytics

---

## 5. Repo Operating Rules for This Work

All implementation should follow the repository’s mandatory operating pattern.

### 5.1 Mandatory execution order

For this scope, use:

**Planner -> Builder -> Reviewer -> Tester -> Governance**

This work is architectural, lifecycle-related, policy-related, and boundary-sensitive. Governance must not be skipped.

### 5.2 Non-negotiable implementation rules

- Do not do unrelated refactors.
- Do not silently redesign the HR module.
- Do not couple role definitions directly to raw permission grants.
- Do not overwrite historical role versions destructively.
- Do not publish UI surfaces before backend visibility and lifecycle rules exist.
- Do not ship advisory-only masking for restricted role content.
- Do not partially migrate and leave mixed old/new semantics.

---

## 6. Delivery Strategy

This roadmap uses six coordinated workstreams delivered in phased order.

| Workstream | Focus | Primary outcome |
|---|---|---|
| **WS1** | Domain model and persistence | Canonical role-definition schema and version model |
| **WS2** | Contracts and backend lifecycle | API, validation, lifecycle, approval, publish flow |
| **WS3** | Security, visibility, and governance | Runtime access control, DTO masking, audit |
| **WS4** | UI and authoring experience | Authoring, review, publish, compare, browse |
| **WS5** | Integration and migration | Positions, staffing, recruiting, performance, workspace wiring |
| **WS6** | Validation and rollout | Tests, pilot, data backfill, release gates |

---

## 7. Recommended Phase Plan

## Phase 0 — Design Lock and Scope Freeze

### Goal

Lock the v1 shape before code changes begin.

### Primary outputs

- approved implementation scope
- canonical lifecycle states
- data model decision
- visibility model decision
- acceptance criteria and feature-flag strategy
- touched-file map for execution

### Core tasks

- Confirm that role-definition implementation is **additive** to the existing HR module.
- Confirm the v1 object boundary: role definition vs position vs worker vs permission.
- Choose the persistence strategy for v1:
  - **recommended:** relational identity table + version table + structured JSON blocks for nested sections
  - avoid over-normalizing every subsection in v1 unless there is proven query need
- Lock lifecycle states for v1:
  - `requested`
  - `discovery`
  - `draft`
  - `review`
  - `approval_pending`
  - `approved`
  - `published`
  - `effective`
  - `superseded`
  - `retired`
- Lock visibility classes used by role-definition records.
- Decide the route family and UI route naming.
- Decide feature-flag strategy for staged rollout.
- Define acceptance criteria and rollback conditions.

### Recommended touched areas

- `docs/hr/`
- `shared/`
- `schemas/`
- `server/hr/`
- `client/src/pages/`

### Exit criteria

- one approved v1 shape
- one approved lifecycle model
- one approved visibility model
- one approved execution order
- no unresolved ambiguity about what the new feature owns

---

## Phase 1 — Data Model and Persistence Foundation

### Goal

Create the canonical persistence model for role definitions.

### Design recommendation

For v1, prefer a **minimal but durable** schema:

### Recommended tables / entities

#### 1. `hrRoleDefinitions`
Holds stable identity-level fields.

Suggested fields:

- `id`
- `roleCode`
- `title`
- `departmentId`
- `jobFamilyId`
- `jobLevelId`
- `status`
- `currentVersionId`
- `ownerId`
- `createdAt`
- `updatedAt`

#### 2. `hrRoleDefinitionVersions`
Holds the effective-dated canonical content.

Suggested fields:

- `id`
- `roleDefinitionId`
- `version`
- `effectiveFrom`
- `effectiveTo`
- `purposeSummary`
- `reportingDescriptor`
- `directReportsScope`
- `accountabilitiesJson`
- `decisionRightsJson`
- `boundariesJson`
- `collaborationModelJson`
- `requirementsJson`
- `successMetricsJson`
- `riskComplianceNotesJson`
- `visibilityClass`
- `changeReason`
- `draftOwnerId`
- `approvedById`
- `approvedAt`
- `lastReviewedAt`
- `nextReviewAt`
- `createdAt`
- `updatedAt`

#### 3. `hrRoleDefinitionReviews` (optional in v1)
Use only if the review workflow requires explicit separate records beyond audit logs.

If the repo already has strong audit + lifecycle logs, v1 may defer this table and rely on structured audit events.

#### 4. Position linkage
Choose one of these models:

- add `roleDefinitionId` to the position record, or
- create a dedicated effective-dated link table if position-to-role historical transitions must be preserved separately

**Recommended v1:** add the direct FK if the current position model can absorb it cleanly.

### Core tasks

- Add Drizzle tables and migrations.
- Add indexes and unique rules where needed.
- Add effective-date integrity checks.
- Ensure historical supersession is non-destructive.
- Ensure the data model separates public/internal visible fields from restricted notes where needed.
- Add seed-safe defaults only if they are genuinely needed for demo mode.

### Guardrails

- Do not store restricted notes in the same payload as broadly visible narrative content unless DTO shaping is guaranteed.
- Do not duplicate person-specific employment data into role-definition records.
- Do not encode permission grants directly into the role definition table.

### Exit criteria

- migrations compile
- schema reflects canonical role-definition identity + versioning
- role-definition data can exist independently from positions and workers
- one position can reference one active role definition cleanly

---

## Phase 2 — Shared Schemas, Validation, and Contracts

### Goal

Make the role-definition model consumable by the app consistently.

### Core tasks

- Create shared enums and constants for:
  - lifecycle statuses
  - visibility classes
  - change types
  - review outcomes
- Add Zod validation for create, update, submit, approve, publish, retire, compare, and link flows.
- Define DTOs for:
  - public/internal summary view
  - manager view
  - HRBP view
  - admin/governance view
- Define stable API response shapes.
- Add helper functions for version resolution:
  - current effective version
  - future scheduled version
  - historical version list
- Add canonical diff helpers for version comparison.

### Recommended artifacts

- `shared/hr/roleDefinitions.ts`
- `schemas/hr/roleDefinition*.schema.json` where useful
- `server/hr/role-definitions/schema.ts` or equivalent module-local validation files

### Exit criteria

- all write paths validate consistently
- all views have explicit DTO shapes
- no router needs to invent its own role-definition payload shape

---

## Phase 3 — Backend Lifecycle and Router Implementation

### Goal

Implement the core HR role-definition backend feature set.

### Recommended router scope

Add a dedicated sub-router for role definitions under the HR domain.

### Minimum procedures for v1

#### Query procedures

- `listRoleDefinitions`
- `getRoleDefinitionById`
- `getRoleDefinitionVersion`
- `getRoleDefinitionHistory`
- `compareRoleDefinitionVersions`
- `searchRoleDefinitions`

#### Mutation procedures

- `createRoleDefinitionDraft`
- `updateRoleDefinitionDraft`
- `submitRoleDefinitionForReview`
- `requestRoleDefinitionChanges`
- `approveRoleDefinition`
- `publishRoleDefinition`
- `scheduleRoleDefinitionEffectiveDate`
- `supersedeRoleDefinition`
- `retireRoleDefinition`
- `linkRoleDefinitionToPosition`
- `unlinkRoleDefinitionFromPosition` if policy allows

### Lifecycle logic to enforce

- only drafts can be edited freely
- only reviewed items can enter approval-pending
- only approved items can be published
- only published items can become effective
- superseded versions remain readable historically
- retired roles are unavailable for new position assignment unless explicitly allowed

### Audit requirements

Every sensitive action should log:

- actor
- action
- target role definition
- old status
- new status
- version affected
- reason if required
- timestamp

### Exit criteria

- backend supports the full draft -> review -> approval -> publish flow
- lifecycle guards reject invalid transitions
- all sensitive mutations are auditable

---

## Phase 4 — Visibility, Permission Enforcement, and Governance Hardening

### Goal

Turn role-definition visibility into real runtime enforcement.

### Why this phase is critical

The repo’s broader HR state already showed that a matrix can exist on paper while runtime enforcement remains incomplete. This phase ensures role-definition work does not repeat that mistake.

### Core tasks

- Add role-based and scope-based permission checks to the new role-definition procedures.
- Use backend guards for all read/write operations involving restricted content.
- Implement DTO shaping by persona.
- Implement field masking for restricted notes and sensitive rationale.
- Add explicit sensitive-read audit events when restricted content is viewed.
- Add approval guardrails for strategic or executive roles.
- Ensure frontend hides unavailable actions based on resolved capabilities, but never relies on UI-only enforcement.

### Minimum persona model for v1

- employee
- manager
- HRBP
- admin
- governance reviewer, if surfaced distinctly

### Minimum visibility classes for v1

- `public_internal`
- `team_visible`
- `manager_visible`
- `hr_restricted`
- `admin_restricted`
- `confidential_case`

### Governance checks

- no direct raw access to restricted role-definition content without policy evaluation
- no approval bypass for material role changes
- no publish path without version, visibility class, and approver metadata

### Exit criteria

- route-level checks implemented
- DTO shaping implemented
- masking implemented
- restricted reads auditable
- no generic role-definition endpoint leaks restricted content

---

## Phase 5 — UI and Authoring Experience

### Goal

Expose role-definition workflows through a professional HR UI.

### Recommended route family

Use one consistent family, for example:

- `/hr/role-definitions`
- `/hr/role-definitions/:id`
- `/hr/role-definitions/:id/edit`
- `/hr/role-definitions/review`
- `/hr/role-definitions/:id/compare`

### Recommended pages

#### 1. Role-definition list page

Capabilities:

- search
- filters by department, family, level, status, visibility, review state
- badges for published / effective / draft / superseded / retired
- quick links to positions using the role

#### 2. Role-definition detail page

Capabilities:

- canonical summary
- accountabilities
- decision rights
- boundaries
- competencies
- metrics
- history/version timeline
- linked positions
- linked workspace usage summary where relevant

#### 3. Draft authoring page

Capabilities:

- sectioned editor aligned to the framework
- save draft
- validation feedback
- submit for review
- cancel / discard safeguards

#### 4. Review queue page

Capabilities:

- items awaiting HR review
- items awaiting business approval
- change-request loop
- reviewer comments / rationale

#### 5. Version compare page

Capabilities:

- side-by-side diff
- highlight of changed accountabilities, rights, KPIs, sensitivity class
- publish impact summary

### UI design rules

- reuse existing HR page shell and navigation patterns
- do not invent a separate visual language for this feature
- show visibility class and lifecycle state clearly
- show read-only mode when user lacks edit or review rights
- keep action surfaces aligned with backend permissions

### Exit criteria

- HR users can author and review role definitions end-to-end
- non-authorized users only see permitted summaries
- published role profiles are readable and stable

---

## Phase 6 — Integration with Existing HR and Workspace Features

### Goal

Wire role definitions into the rest of the platform without conflating them with adjacent objects.

### Integration areas

#### A. Positions

- Add or validate `roleDefinitionId` linkage.
- Ensure position creation can reference an approved active role definition.
- Prevent position creation from silently bypassing the role-definition layer once cutover is complete.

#### B. Recruiting

- Use approved role definitions to seed requisitions and job descriptions.
- Generate interview criteria from canonical accountabilities and requirements.
- Prevent stale job ads from diverging from approved role records.

#### C. Performance

- Seed role-level KPIs and expectations from the active role definition.
- Keep individual goals separate from role-level baseline standards.

#### D. Staffing and workspace assignment

- Allow workspace staffing flows to reference the worker’s underlying role definition.
- Use role-definition metadata to suggest approvers, owners, or participants when relevant.

#### E. Analytics

- Add reporting on:
  - roles by department/family/level
  - roles overdue for review
  - draft vs approved vs retired role counts
  - positions missing approved role definitions
  - role-definition drift indicators

#### F. Documents

- Allow narrative exports or generated documents, but ensure the structured record stays authoritative.

### Exit criteria

- key downstream HR flows consume role-definition data
- no downstream flow needs free-text-only role descriptions to work

---

## Phase 7 — Data Backfill, Migration, and Cutover

### Goal

Move the live HR model onto the new role-definition standard safely.

### Core tasks

- inventory existing positions, titles, and staffing patterns
- identify duplicate titles that actually represent different roles
- identify different titles that actually represent the same role
- create backfill mapping rules
- generate draft role definitions for the highest-priority active positions
- validate role mappings with HR and department owners
- publish approved initial versions in waves
- update existing positions to point to canonical role definitions

### Recommended backfill order

1. core corporate roles
2. HR and admin roles
3. manager roles
4. high-volume operational roles
5. specialist roles
6. executive or sensitive roles

### Cutover strategy

Use a feature-flagged phased rollout:

- **Stage 1:** backend model + admin-only visibility
- **Stage 2:** HR authoring and review
- **Stage 3:** position linkage and recruiting consumption
- **Stage 4:** manager-facing role browsing
- **Stage 5:** broader employee-visible summary views if approved

### Exit criteria

- all priority positions linked to approved active role definitions
- no destructive data migration
- rollback path documented

---

## 8. Reviewer, Tester, and Governance Gates

## Reviewer Gate

Reviewer should explicitly verify:

- the implementation follows the framework and not a simplified substitute
- role definition remains distinct from position, person, and permission
- no unrelated HR domains were refactored unnecessarily
- existing HR module patterns were reused coherently
- old and new semantics are not mixed

## Tester Gate

Tester should validate at least the following.

### Backend validation

- create draft
- update draft
- invalid transition rejection
- approve and publish flow
- future-dated effective version resolution
- superseded history retrieval
- restricted read masking
- audit events for sensitive actions

### Integration validation

- position linked to active approved role
- recruiting flow seeded from approved role definition
- manager and employee see different payload shapes where appropriate
- workspace staffing consumes role data without bypassing security

### UI validation

- list, detail, create, edit, review, compare
- disabled actions for unauthorized users
- proper state badges and error handling
- mutation error surfacing

## Governance Gate

Governance must explicitly confirm:

- lifecycle and approval boundaries are enforced
- restricted content does not leak through generic endpoints
- policy evaluation is not bypassed for sensitive operations
- role-definition publication cannot occur without required metadata
- architecture layering remains intact
- audit and history requirements are satisfied

---

## 9. Recommended Touched Repo Areas

This roadmap does not assume exact filenames beyond what should logically exist, but these are the main areas that should be impacted.

### Backend

- `server/hr/`
- `server/routers/` if root registration changes are required
- `server/services/` for policy and audit integration where needed
- `shared/` for enums and DTOs if repo convention uses shared cross-cutting types

### Persistence

- `drizzle/tables/`
- `migrations/`
- `drizzle/schema.ts` or equivalent exports

### Frontend

- `client/src/pages/`
- `client/src/components/`
- `client/src/lib/` for client hooks or API helpers

### Documentation

- `docs/hr/`
- optional implementation notes or ADRs where the repo uses them

### Tests

- `server/hr/__tests__/`
- frontend tests wherever existing HR UI tests live
- integration tests if the repo adds or expands them

---

## 10. Risk Register

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Role vs permission confusion** | Job titles may be misused as system grants | Keep permission resolution separate and policy-based |
| **Role vs position duplication** | Data becomes inconsistent across HR records | Make the role definition canonical and link positions to it |
| **Over-normalized schema** | Slow delivery and fragile implementation | Use relational identity + version table + structured JSON for v1 |
| **Advisory-only visibility** | Restricted content leaks through runtime | Enforce in backend guards and DTO shaping |
| **Destructive edits** | Historical role state is lost | Use effective-dated versioning and supersession |
| **Weak backfill quality** | Live positions map to wrong roles | Use manual HR/director validation before cutover |
| **UI shipped before policy** | Frontend exposes actions the backend should block | Implement backend permissions before broad UI rollout |
| **Hidden cross-module coupling** | HR becomes harder to evolve independently | Use contracts and links, not cross-table direct assumptions |

---

## 11. Delivery Sequence Summary

| Order | Phase | Outcome |
|---|---|---|
| **1** | Phase 0 | Scope, lifecycle, and model locked |
| **2** | Phase 1 | Persistence model live |
| **3** | Phase 2 | Shared contracts and DTOs live |
| **4** | Phase 3 | Backend lifecycle and router live |
| **5** | Phase 4 | Visibility and governance enforcement live |
| **6** | Phase 5 | UI authoring and review live |
| **7** | Phase 6 | Integrations live |
| **8** | Phase 7 | Backfill, pilot, and rollout complete |

---

## 12. Minimum Definition of Done

This roadmap is complete only when all of the following are true:

1. the system can store canonical role definitions as structured records
2. role definitions are versioned and effective-dated
3. role definitions are distinct from positions, workers, and permission grants
4. invalid lifecycle transitions are blocked at runtime
5. restricted role-definition content is masked and access-controlled at runtime
6. sensitive reads and material mutations are auditable
7. positions can reference approved active role definitions
8. recruiting and staffing can consume approved role-definition data
9. version history is preserved without destructive overwrite
10. the feature passes Reviewer, Tester, and Governance gates

---

## 13. Practical Starting Order for the First PR Wave

To keep scope disciplined, the first implementation wave should be narrow.

### PR Wave 1 — Foundation only

- schema tables and migration
- shared enums and validators
- minimal backend read/write draft flow
- no public UI beyond admin/HR-only surfaces

### PR Wave 2 — Lifecycle and approvals

- review/approve/publish/supersede logic
- audit hooks
- position linkage
- compare version helpers

### PR Wave 3 — Visibility and restricted content handling

- permission guards
- DTO shaping
- masking
- sensitive-read audit logging

### PR Wave 4 — Full UI and downstream integrations

- authoring pages
- review queue
- recruiting and staffing integrations
- analytics views

This keeps the early PRs coherent and easier to review.

---

## 14. Closing Direction

The correct implementation philosophy is:

**treat role definition as governed HR infrastructure, not as a document editor feature.**

If implemented this way, the app gains:

- clearer workforce architecture
- better staffing and recruiting consistency
- safer visibility handling
- cleaner integration with workspaces and approvals
- historical traceability for role changes

If implemented loosely, the platform will end up with another text field that no downstream feature can trust.

This roadmap exists to prevent that outcome.
