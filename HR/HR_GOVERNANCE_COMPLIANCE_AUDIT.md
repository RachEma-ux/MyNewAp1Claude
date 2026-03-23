# HR / RH Module — Governance Compliance Audit Report

**Date:** 2026-03-23
**Auditor:** Governance Agent (Claude Opus 4.6)
**Repo:** RachEma-ux/MyNewAp1Claude
**Scope:** Full governance compliance audit of the HR/RH module
**Mode:** Audit-only — no code changes

---

## 1. Executive Verdict

### **NON-COMPLIANT**

The HR module has significant structural governance investment (permissions model, audit helpers, state machines, masking utilities, module registration) but **critical enforcement gaps** prevent it from meeting the repo's governance requirements. The permission system is defined but only enforced in 4 of 14 sub-routers. The global `hr.*` tRPC namespace bypasses the workspace module enablement system entirely. Multiple sensitive-data domains (talent, compliance, lifecycle, time, performance, engagement, recruiting, organization, staffing, learning) are readable by any authenticated user without HR-role differentiation.

---

## 2. Governance Scorecard

| Dimension | Score |
|---|---|
| A. Repo Governance Alignment | 7/10 |
| B. Module Governance | 5/10 |
| C. Access Control | 3/10 |
| D. Sensitive Data Governance | 5/10 |
| E. Auditability | 6/10 |
| F. Runtime/State Governance | 8/10 |
| G. Schema/Persistence Governance | 7/10 |
| H. API/Contract Governance | 5/10 |
| I. Frontend Governance Alignment | 3/10 |
| J. Documentation Traceability | 7/10 |
| K. Production Governance Readiness | 2/10 |
| **Overall** | **5/10** |

---

## 3. Governance Compliance Matrix

### A. Repo Governance Alignment — PASS WITH GAPS

**Evidence:**
- `AGENTS.md` mandates governed, bounded module design. HR is implemented as a bounded domain with its own directory (`server/hr/`), schema files (`drizzle/tables/hr-*.ts` — 14 tables), and router namespace.
- HR docs (`HR/HR_MODULE_IMPLEMENTATION_ROADMAP.md`) explicitly demand governance-first design: "every sensitive mutation passes policy and audit" (line 93).
- Phase 6 hardening was specifically scoped to "Permission enforcement, role-aware masking, audit coverage" (`server/hr/router.ts:10`).

**Gap:** Phase 6 hardening was only applied to 4 of 14 sub-routers (compensation, relations, analytics, directory-masking). The remaining 10 sub-routers were not hardened.

---

### B. Module Governance — PASS WITH GAPS

**Evidence:**
- HR is registered in `MODULE_KEYS` (`drizzle/tables/workspace-modules.ts:25`: `["pmt", "knowledge", "agents", "collaboration", "reporting", "hr"]`).
- HR is included in workspace presets (`server/modules/registry.ts:23-24`: team, project, enterprise presets include "hr").
- A workspace-facing module router exists at `server/modules/hr/router.ts` with proper `requireModule(workspaceId, "hr")` and `requireWorkspaceAccess()` guards.
- The module management router (`server/modules/router.ts:87`) correctly mounts `hr: hrModuleRouter`.

**Gap:** The **global** `hr.*` router is mounted at `server/routers.ts:85` as `hr: hrRouter`, completely **outside** the module system. This global namespace (`hr.directory.*`, `hr.compensation.*`, etc.) does not call `requireModule()` or `requireWorkspaceAccess()` on any of its 14 sub-routers. The workspace module boundary is therefore **bypassed** for all direct `hr.*` calls.

---

### C. Access Control — FAIL

**Evidence:**
- A comprehensive permission system exists in `server/hr/permissions.ts`:
  - 5 HR roles defined (employee, manager, hrbp, admin, workspace_admin) — line 7
  - 60+ granular HR actions defined (`HR_ACTIONS`) — lines 10-104
  - Role-permission matrix (`HR_ROLE_PERMISSIONS`) — lines 137-231
  - `checkHrAccess()`, `requireHrPermission()`, `hasPermission()` helpers — lines 236-333
- However, these are only called in **4 of 14 sub-routers**:
  - `compensation/router.ts` — `checkHrAccess()` on all reads/writes
  - `relations/router.ts` — `checkHrAccess()` on all reads/writes
  - `analytics/router.ts` — `checkHrAccess()` on all reads/writes
  - `directory/router.ts` — `maskDirectoryFields()` only (NO `checkHrAccess` on reads)
- **10 sub-routers have zero HR permission enforcement:**
  - `lifecycle/router.ts`, `compliance/router.ts`, `talent/router.ts`, `engagement/router.ts`, `recruiting/router.ts`, `organization/router.ts`, `staffing/router.ts`, `learning/router.ts`, `performance/router.ts`, `time/router.ts`
- `getHrRoleForUser()` (`permissions.ts:283-289`) maps from platform `user.role` directly. Comment says "Wire to a dedicated user-HR-role mapping table in a future phase." Since the platform auth only distinguishes `admin` vs non-admin (`trpc.ts:47-51`), only "admin" and "employee" roles are reachable in practice. The "manager", "hrbp", "workspace_admin" roles are **unreachable** in the current platform auth model.

---

### D. Sensitive Data Governance — PASS WITH GAPS

**Evidence:**
- Masking utilities exist and are applied in practice:
  - `maskCompensationFields()` applied in compensation router reads — `compensation/router.ts:91,103,178,228,296,367,418`
  - `maskRelationsFields()` applied in relations router reads — `relations/router.ts:222,234,315,387`
  - `maskDirectoryFields()` applied in directory router reads — `directory/router.ts:57,93,126`
- `MASKED_COMPENSATION_FIELDS`: baseSalary, amount, budgetPercent, employerContribution, employeeContribution
- `MASKED_RELATIONS_FIELDS`: description, resolutionNotes, findings, recommendation, appealNotes
- Sensitive read logging (`logSensitiveRead()`) is called in compensation and relations routers.

**Gap:** Talent router returns full talent reviews (performance ratings, potential ratings, retention risk, 9-box positions, development areas) to any authenticated user without masking or sensitive-read logging. Compliance router returns incident reports (data breaches, security incidents) without masking or sensitive-read logging. No masking is defined for talent, compliance, or engagement data.

---

### E. Auditability — PASS WITH GAPS

**Evidence:**
- Dedicated HR audit infrastructure (`server/hr/audit.ts`):
  - `logHrAudit()` — general audit logging with categories
  - `logSensitiveRead()` — tracks access to restricted data
  - `logStatusChange()` — tracks state machine transitions
  - Persistent storage in `hr_audit_log` table (`drizzle/tables/hr-core.ts:109`)
- Mutation audit logging is comprehensive — all governed mutations across all 14 routers call `logHrAudit()`.
- Status change logging uses `logStatusChange()` in compensation, relations, lifecycle routers.

**Gap:**
- Sensitive read logging is only in compensation and relations routers. Talent, compliance, performance, engagement reads are not audited.
- Knowledge transfer items (`lifecycle/router.ts:493-530`) and exit interview updates (`lifecycle/router.ts:578-598`) have no audit logging.
- Directory reads (potentially containing personal data) are not audited.

---

### F. Runtime/State Governance — PASS

**Evidence:**
- State machines are defined and enforced in **all** sub-routers that have stateful entities:
  - Onboarding/offboarding: `ONBOARDING_STATUS_FLOW`, `OFFBOARDING_STATUS_FLOW`, `TASK_STATUS_FLOW`
  - Recruiting: `REQUEST_STATUS_FLOW`, `CANDIDATE_STAGE_FLOW`, `OFFER_STATUS_FLOW`
  - Time: `TIME_ENTRY_STATUS_FLOW`, `LEAVE_REQUEST_STATUS_FLOW`, `OVERTIME_STATUS_FLOW`, `SHIFT_PLAN_STATUS_FLOW`, `SHIFT_ASSIGNMENT_STATUS_FLOW`
  - Performance: `CYCLE_STATUS_FLOW`, `GOAL_STATUS_FLOW`, `REVIEW_STATUS_FLOW`
  - Compensation: `SALARY_REVIEW_STATUS_FLOW`, `BONUS_STATUS_FLOW`, `ENROLLMENT_STATUS_FLOW`
  - Relations: `POLICY_STATUS_FLOW`, `GRIEVANCE_STATUS_FLOW`, `DISCIPLINARY_STATUS_FLOW`, `INVESTIGATION_STATUS_FLOW`
  - Compliance: `INCIDENT_STATUS_FLOW`, `OBLIGATION_STATUS_FLOW`, `RISK_STATUS_FLOW`
  - Engagement: `SURVEY_STATUS_FLOW`, `ENGAGEMENT_PROGRAM_STATUS_FLOW`, `RECOGNITION_STATUS_FLOW`
  - Talent: `TALENT_REVIEW_STATUS_FLOW`, `SUCCESSION_PLAN_STATUS_FLOW`, `SUCCESSION_CANDIDATE_STATUS_FLOW`
- All transition mutations validate against these flow maps with `validateTransition()` which throws `BAD_REQUEST` on illegal transitions.
- `governedProcedure` middleware applies governance freeze check and OPA-based governance evaluation on all mutations.

**Minor gap:** `directory/router.ts` update mutation accepts `status` as a freeform string (`z.string().max(30)`) without state machine validation — line 221. Worker status changes bypass transition governance.

---

### G. Schema/Persistence Governance — PASS WITH GAPS

**Evidence:**
- 14 dedicated schema files in `drizzle/tables/hr-*.ts` — proper separation by domain.
- Foreign keys and relationships are structurally defined (e.g., `hrWorkerProfiles.personId -> hrPeople.id`, `hrWorkspaceAssignments.workerId -> hrWorkerProfiles.id`).
- `createdBy`/`updatedBy` audit fields present on all mutable entities.
- `createdAt`/`updatedAt` timestamps present.
- Effective dating present on compensation records (`effectiveFrom`/`effectiveTo`).
- Separate `hr_audit_log` table for audit trail.

**Gap:** No unique constraint visible for business-governed uniqueness (e.g., employee number uniqueness, one active compensation record per worker). Seed data does not validate these assumptions either.

---

### H. API/Contract Governance — PASS WITH GAPS

**Evidence:**
- Mutation endpoints consistently use `governedProcedure` (governance middleware).
- Read endpoints consistently use `protectedProcedure` (auth middleware).
- Zod input validation on all endpoints.
- Workspace-facing router (`server/modules/hr/router.ts`) provides narrower, workspace-scoped surfaces.

**Gap:**
- All read endpoints return raw DB rows (via `.select()` directly), not governed DTOs. Only directory, compensation, and relations apply any field-level control.
- The global `hr.*` namespace exposes the full HR API surface to any authenticated user without workspace scoping.
- `hr.settings.get` returns module feature flags to any authenticated user — may leak internal configuration.

---

### I. Frontend Governance Alignment — FAIL

**Evidence:**
- 28 HR pages in `client/src/pages/hr/` — all registered in `App.tsx` (lines 93-124, 225-248).
- All HR routes use `ProtectedRoute` — which only checks authentication (`App.tsx:159`), not HR role or module enablement.
- Compensation page (`HRCompensationPage.tsx`) calls `trpc.hr.compensation.*` endpoints directly — backend masking protects sensitive fields, but the page itself renders all available fields without frontend access checks.
- Grievances, investigations, disciplinary, incidents, talent reviews, succession plans — all pages are accessible in navigation to any logged-in user.
- No module-enablement gate in the frontend — HR pages render even if the HR module is disabled for the current workspace.

---

### J. Documentation Traceability — PASS WITH GAPS

**Evidence:**
- Comprehensive planning docs exist:
  - `HR/HR_MODULE_IMPLEMENTATION_ROADMAP.md` — architecture roadmap
  - `HR/HR_MODULE_REPO_SCAFFOLD.md` — code scaffold plan
  - `HR/HR_MODULE_PHASE1_PR_PLAN.md` — Phase 1 PR plan
  - `HR/HR_PHASE5_IMPLEMENTATION_NOTES.md` — Phase 5 implementation notes
  - `HR/HR_MODULE_AUDIT_REPORT.md` — previous audit
  - `HR/HR_FINAL_ACCEPTANCE_AUDIT.md` — acceptance audit
- Phase comments in `server/hr/router.ts` trace each phase (1-6).

**Gap:** Phase 6 hardening notes claim "API permission enforcement" and "role-aware masking" but these are only partially implemented. Governance docs do not note this partiality.

---

### K. Production Governance Readiness — FAIL

The HR module cannot be used with sensitive HR data in production. See Section 9.

---

## 4. Critical Governance Findings

### CRITICAL-01: HR Permission Enforcement Missing in 10 of 14 Sub-Routers

**Severity:** Critical
**Evidence:** `server/hr/` — lifecycle, compliance, talent, engagement, recruiting, organization, staffing, learning, performance, time routers contain zero calls to `checkHrAccess()` or `requireHrPermission()`. Confirmed via grep across all router files — only compensation, relations, analytics, and directory (masking only) import from `../permissions`.
**Violation:** The `HR_ROLE_PERMISSIONS` matrix defines restricted access (e.g., employees should only see self-data, managers only team-data), but these restrictions are NOT enforced in runtime. Any `protectedProcedure` user (any authenticated user) can read all talent reviews, performance reviews, all time entries, all leave requests, all recruiting data, all compliance incidents, all grievances via unprotected routers.
**Recommended correction:** Apply `checkHrAccess(ctx.user, HR_ACTIONS.*)` to every read endpoint across all 14 sub-routers. Apply `requireHrPermission()` on mutations where needed.

---

### CRITICAL-02: Global `hr.*` Namespace Bypasses Workspace Module System

**Severity:** Critical
**Evidence:** `server/routers.ts:85` mounts `hr: hrRouter` at the app root level. None of the 14 sub-routers call `requireModule()` or `requireWorkspaceAccess()`. The workspace-scoped module router at `server/modules/hr/router.ts` (with proper guards) is a **parallel, limited** surface — it only exposes `listStaff`, `searchWorkers`, `assignWorker`, `endAssignment`, `getWorkspaceCoverage`. The full 14-router `hr.*` API is accessible regardless of whether HR is enabled for any workspace.
**Violation:** `server/modules/registry.ts` explicitly provides `requireModule()` as the governance gate. Roadmap doc (`HR_MODULE_IMPLEMENTATION_ROADMAP.md:97`) states "HR is registered in the module registry and seeded per workspace." The dual-mount architecture creates a **complete module boundary bypass**.
**Recommended correction:** Either: (a) move all `hr.*` routes under the module system with workspace scoping, or (b) add `requireModule()` checks to all global `hr.*` procedures.

---

### CRITICAL-03: HR Role System Is Unreachable for Non-Admin Users

**Severity:** Critical
**Evidence:** `server/hr/permissions.ts:283-289` — `getHrRoleForUser()` maps platform `user.role` to HR role. Platform tRPC context (`server/_core/trpc.ts`) only distinguishes `admin` vs other. The platform user model has no "hrbp" or "manager" role. Therefore, all non-admin users are mapped to "employee" HR role, and the entire manager/hrbp role differentiation is **dead code** in production.
**Violation:** The permission matrix is governance theater — it defines fine-grained access that can never be reached. Comment at line 282 acknowledges: "Wire to a dedicated user-HR-role mapping table in a future phase."
**Recommended correction:** Implement a `hr_user_roles` table or assignment mechanism to enable hrbp/manager role assignment independent of platform auth.

---

### HIGH-01: Sensitive HR Domains Lack Read Audit Logging

**Severity:** High
**Evidence:** `logSensitiveRead()` is called only in `compensation/router.ts` and `relations/router.ts`. The following sensitive domains have no read audit trail: talent reviews (9-box, retention risk, potential ratings), compliance incidents (data breaches, security), performance reviews, exit interviews (confidential feedback).
**Violation:** Governance Bible (`docs/governance/GOVERNANCE_BIBLE.md:24`) requires "Audit and traceability standards." HR roadmap (`HR_MODULE_IMPLEMENTATION_ROADMAP.md:93`) states "every sensitive mutation passes policy and audit" — but reads of sensitive data are equally governance-relevant.
**Recommended correction:** Add `logSensitiveRead()` calls to talent, compliance, performance review, and exit interview read endpoints.

---

### HIGH-02: Frontend Exposes All HR Pages Without Role or Module Gate

**Severity:** High
**Evidence:** `client/src/App.tsx:225-256` — all 28 HR routes use generic `ProtectedRoute` (login check only). Compensation page, grievances page, talent page, incidents page — all accessible to any logged-in user in navigation. No frontend check for module enablement or HR role.
**Violation:** Governance Bible requires layer isolation. Frontend exposes controls that backend should deny, creating UX inconsistency. Users see pages they may not have backend permission to use (when permission checks ARE applied on 4 routers).
**Recommended correction:** Add HR module-enablement gate and role-based page visibility to the frontend HR shell/layout.

---

## 5. Medium and Low Findings

### MEDIUM-01: Directory Status Update Lacks State Machine Validation

- **File:** `server/hr/directory/router.ts:221` — `status: z.string().max(30).optional()`
- Worker status can be set to arbitrary values. No `validateTransition()` call.
- Risk: Worker status drift from governed values.

### MEDIUM-02: Directory Read Endpoints Lack HR Permission Check

- **File:** `server/hr/directory/router.ts:18-94` — `list`, `search`, `getById`, `getSummary` use `protectedProcedure` only. `maskDirectoryFields` is applied but no `checkHrAccess()` gate.
- Employee-role users should only see self-data per the permission matrix, but see all directory data.

### MEDIUM-03: Knowledge Transfer Items and Exit Interview Updates Not Audited

- **File:** `server/hr/lifecycle/router.ts:493-530, 512-530, 578-598`
- `createKnowledgeTransferItem`, `updateKnowledgeTransferItem`, `updateExitInterview` — no `logHrAudit()` calls.
- Exit interview data (confidential: true, overall satisfaction, would recommend, primary reason) mutations are silent.

### MEDIUM-04: No HR-Specific OPA Policies Exist

- **File:** `policies/agent_governance.rego` — covers agent domain only.
- HR mutations pass through `governedProcedure` which invokes `requireGovernedAction()` with generic governance, but no HR-domain-specific policy rules (e.g., "only HRBP can approve grievance transitions") exist in the OPA policy layer.

### MEDIUM-05: Masking Sets Fields to `undefined`, Not `null`

- **File:** `server/hr/permissions.ts:254` — `(masked as Record<string, unknown>)[field] = undefined;`
- Client may still detect field presence. Consider omitting fields entirely via destructuring or `delete`.

### LOW-01: Duplicate `validateTransition()` Functions

- Each of the 7 routers that define state machines copies the same `validateTransition` function. Should be extracted to a shared governance utility.

### LOW-02: Seed Data Contains Realistic Compensation Amounts

- **File:** `server/hr/seed.ts:148-159` — baseSalary values like "140000", "95000", "105000".
- In demo/dev environments this is fine; should be explicitly documented as demo-only data.

### LOW-03: HR Settings Endpoint Returns Feature Flags to Any User

- **File:** `server/hr/router.ts:32-58` — `settings.get` uses `protectedProcedure`, exposing internal feature flag state.

---

## 6. Policy Enforcement Reality Check

| Control | Status |
|---|---|
| **Authentication (login required)** | ENFORCED — `protectedProcedure` on all reads, `governedProcedure` on all writes |
| **Governance middleware (OPA/freeze)** | ENFORCED — all mutations use `governedProcedure` which runs `requireGovernedAction()` and freeze checks |
| **HR role-based permissions** | PARTIALLY ENFORCED — only in compensation, relations, analytics routers. Not enforced in 10 other routers |
| **Role-aware field masking** | PARTIALLY ENFORCED — compensation and relations apply masking. Talent, compliance, performance, engagement do not |
| **Workspace module enablement** | NOT ENFORCED on `hr.*` global routes. ENFORCED on `modules.hr.*` workspace routes |
| **Workspace lifecycle guards** | NOT ENFORCED on `hr.*` global routes. ENFORCED on `modules.hr.*` via `requireModule()` -> `requireWorkspaceNotDeleted()` |
| **State machine transition validation** | ENFORCED — all stateful entities validate transitions in every sub-router |
| **Mutation audit logging** | ENFORCED — comprehensive `logHrAudit()` across all 14 sub-routers |
| **Sensitive read audit logging** | PARTIALLY ENFORCED — only compensation and relations |
| **Status change audit logging** | PARTIALLY ENFORCED — compensation, relations, lifecycle. Not in talent, compliance, engagement, performance, time |
| **HR-specific OPA policies** | MISSING — no HR domain rules in OPA policy files |
| **User-to-HR role mapping table** | MISSING — relies on unmapped platform role string |
| **Frontend module/role gate** | MISSING — all 28 pages accessible to any logged-in user |

---

## 7. Sensitive-Data Exposure Assessment

### Compensation

- **Who can access:** In practice, any authenticated user (via `hr.compensation.*`). Permission check IS applied — users without `COMPENSATION_READ` get FORBIDDEN. But since `getHrRoleForUser()` maps non-admins to "employee" and employee role lacks `COMPENSATION_READ`, non-admin users are correctly blocked. Admins see full data.
- **Masking applied:** Yes — `maskCompensationFields()` strips baseSalary, amount, budgetPercent, employerContribution, employeeContribution for non-sensitive-read users.
- **Audit logging:** Yes — `logSensitiveRead()` called on all read endpoints.
- **Governance-compliant:** PARTIALLY — permission check works but the role system is broken (only admin/employee reachable). HRBP role cannot be assigned in practice.

### Relations (Grievances, Disciplinary, Investigations)

- **Who can access:** Same as compensation — `checkHrAccess()` blocks employees from `RELATIONS_READ`.
- **Masking applied:** Yes — `maskRelationsFields()` strips description, resolutionNotes, findings, recommendation, appealNotes.
- **Audit logging:** Yes — `logSensitiveRead()` called.
- **Governance-compliant:** PARTIALLY — same role-mapping issue.

### Compliance (Incidents, Obligations, Risk Items)

- **Who can access:** Any authenticated user — NO HR permission checks.
- **Masking applied:** No.
- **Audit logging:** Mutations only — no read audit.
- **Governance-compliant:** NO — data breach incidents, security incidents are fully exposed.

### Analytics (Dashboard, Workforce Breakdown)

- **Who can access:** `checkHrAccess(ctx.user, HR_ACTIONS.ANALYTICS_READ)` is applied — employees blocked.
- **Masking applied:** N/A (aggregate data).
- **Audit logging:** No.
- **Governance-compliant:** PARTIALLY.

### Employee Profile/Private Data

- **Who can access:** Any authenticated user via `hr.directory.*` — NO `checkHrAccess()` gate on reads.
- **Masking applied:** Yes — `maskDirectoryFields()` strips primaryPhone, notes, costCenter, legalEntity.
- **Audit logging:** No.
- **Governance-compliant:** NO — employee directory data is exposed to all users without role differentiation.

### Talent (9-Box, Retention Risk, Succession)

- **Who can access:** Any authenticated user — NO HR permission checks.
- **Masking applied:** No.
- **Audit logging:** Mutations only.
- **Governance-compliant:** NO — highly sensitive personnel assessments are fully exposed.

---

## 8. Workspace/Module Governance Assessment

**Does HR behave as a governed module inside the workspace/module system?**
Partially. HR is registered in `MODULE_KEYS` and has workspace presets (team, project, enterprise include HR). The `modules.hr.*` workspace-facing router correctly enforces `requireModule()` and `requireWorkspaceAccess()`. However, the **full** HR API surface is also mounted at the global `hr.*` level, which completely bypasses workspace module governance.

**Does it respect module enablement and boundary expectations?**
No — the global `hr.*` routes are accessible regardless of module enablement state. Disabling HR for a workspace via the module management API has no effect on `hr.*` access.

**Are there any boundary leaks?**
Yes — the dual-mount architecture (`hr.*` at global level + `modules.hr.*` at module level) is the primary boundary leak. The `hr.*` global surface exposes 14 sub-routers with 100+ endpoints without any workspace boundary enforcement.

---

## 9. Release-Readiness Judgment

### Dev/Internal Use

**Conditionally Ready.** The module is functionally complete across 6 phases, with comprehensive state machines and audit infrastructure. For **development-only** use where all users are trusted and no real HR data is stored, the current state is usable. The seed data pipeline works correctly.

### Controlled Internal Rollout

**Not Ready.** The missing permission enforcement across 10 routers means any authenticated user can access all HR data in those domains. The unreachable HR role system means fine-grained access control is governance theater. Module boundary bypass means workspace-level HR disablement has no effect on the global API. These must be fixed before exposing to non-admin internal users.

### Production with Sensitive HR Data

**Not Ready.** Critical blockers:
1. Compensation data protected but role system broken (only admin/employee reachable)
2. Talent reviews, compliance incidents, performance data fully exposed
3. No user-to-HR role mapping infrastructure
4. No HR-specific OPA policies
5. Frontend exposes all pages without access control
6. Module boundary completely bypassed

---

## 10. Remediation Plan

### Must Fix Before Governed Acceptance

| # | Item | Files | Effort | Risk if Unresolved |
|---|---|---|---|---|
| 1 | Apply `checkHrAccess()` to all 10 unprotected sub-routers (reads + mutations) | `server/hr/{lifecycle,compliance,talent,engagement,recruiting,organization,staffing,learning,performance,time}/router.ts` | Medium | Any authenticated user accesses all HR data |
| 2 | Fix or remove dual-mount: add `requireModule()` to global `hr.*` routes OR remove global mount and route all through `modules.hr.*` | `server/routers.ts`, `server/hr/router.ts`, all sub-routers | Medium | Module enablement boundary completely bypassed |
| 3 | Implement user-to-HR role mapping (table or assignment API) to enable manager/hrbp/workspace_admin roles | `drizzle/tables/hr-core.ts`, `server/hr/permissions.ts` | Medium | Only admin/employee roles reachable; manager/hrbp differentiation is dead code |
| 4 | Add `logSensitiveRead()` to talent, compliance, performance, and exit interview read endpoints | `server/hr/{talent,compliance,performance,lifecycle}/router.ts` | Small | Sensitive data access is invisible to audit |
| 5 | Add state machine validation to directory worker status updates | `server/hr/directory/router.ts:221` | Small | Worker status can be set to arbitrary values |

### Should Fix Soon After Acceptance

| # | Item | Files | Effort | Risk if Unresolved |
|---|---|---|---|---|
| 6 | Add HR module-enablement gate to frontend (check `modules.hr` enabled before rendering HR pages/navigation) | `client/src/App.tsx`, HR layout component | Small | Users see HR UI even when module disabled |
| 7 | Add frontend role-based page visibility (hide compensation/relations/talent pages from employees) | `client/src/pages/hr/` pages and navigation | Medium | Frontend shows controls backend will deny |
| 8 | Add audit logging to knowledge transfer items and exit interview mutations | `server/hr/lifecycle/router.ts` | Small | Silent governance-relevant state changes |
| 9 | Add directory read permission checks (`checkHrAccess` for `DIRECTORY_READ`) | `server/hr/directory/router.ts` | Small | All users see full directory without role gate |
| 10 | Create HR-specific OPA policy rules for sensitive transitions | `policies/`, `server/policies/` | Medium | HR governance relies only on generic governance, no domain-specific rules |

### Nice-to-Have Governance Polish

| # | Item | Files | Effort | Risk if Unresolved |
|---|---|---|---|---|
| 11 | Extract `validateTransition()` to shared HR governance utility | All sub-routers with state machines | Small | Code duplication, no functional impact |
| 12 | Change masking to omit fields (delete) rather than set to `undefined` | `server/hr/permissions.ts:254` | Small | Minor information leak (field presence) |
| 13 | Add unique constraints for business rules (e.g., employee number) at schema level | `drizzle/tables/hr-core.ts` | Small | Potential duplicate governed entities |
| 14 | Add `logStatusChange()` to talent, compliance, engagement routers | Respective routers | Small | Incomplete status transition audit trail |
| 15 | Update HR governance docs to accurately reflect Phase 6 enforcement coverage | `HR/HR_PHASE5_IMPLEMENTATION_NOTES.md`, `HR/HR_FINAL_ACCEPTANCE_AUDIT.md` | Small | Docs overclaim enforcement that doesn't exist |

---

## Appendix: Files Inspected

### Governance Sources
- `AGENTS.md`
- `ARCHITECTURE.md` / `CLAUDE.md`
- `docs/governance/GOVERNANCE_BIBLE.md`
- `server/_core/trpc.ts` (procedure definitions)
- `server/modules/registry.ts` (module system)
- `server/modules/router.ts` (module management router)
- `drizzle/tables/workspace-modules.ts` (MODULE_KEYS)

### HR Documentation
- `HR/HR_MODULE_IMPLEMENTATION_ROADMAP.md`
- `HR/HR_MODULE_REPO_SCAFFOLD.md`
- `HR/HR_MODULE_PHASE1_PR_PLAN.md`
- `HR/HR_PHASE5_IMPLEMENTATION_NOTES.md`
- `HR/HR_MODULE_AUDIT_REPORT.md`
- `HR/HR_FINAL_ACCEPTANCE_AUDIT.md`

### HR Implementation Code
- `server/hr/router.ts` (root HR router)
- `server/hr/permissions.ts` (permission system)
- `server/hr/audit.ts` (audit helpers)
- `server/hr/seed.ts` (demo data)
- `server/hr/jobs/reminders.ts` (reminder hooks)
- `server/hr/directory/router.ts`
- `server/hr/organization/router.ts`
- `server/hr/staffing/router.ts`
- `server/hr/recruiting/router.ts`
- `server/hr/lifecycle/router.ts`
- `server/hr/lifecycle/event-logger.ts`
- `server/hr/lifecycle/task-generator.ts`
- `server/hr/time/router.ts`
- `server/hr/learning/router.ts`
- `server/hr/performance/router.ts`
- `server/hr/compensation/router.ts`
- `server/hr/relations/router.ts`
- `server/hr/engagement/router.ts`
- `server/hr/compliance/router.ts`
- `server/hr/analytics/router.ts`
- `server/hr/talent/router.ts`
- `server/modules/hr/router.ts` (workspace-facing module router)
- `server/routers.ts` (app router mount points)

### HR Schema
- `drizzle/tables/hr-core.ts`
- `drizzle/tables/hr-staffing.ts`
- `drizzle/tables/hr-organization.ts`
- `drizzle/tables/hr-recruiting.ts`
- `drizzle/tables/hr-lifecycle.ts`
- `drizzle/tables/hr-time.ts`
- `drizzle/tables/hr-learning.ts`
- `drizzle/tables/hr-performance.ts`
- `drizzle/tables/hr-compensation.ts`
- `drizzle/tables/hr-relations.ts`
- `drizzle/tables/hr-engagement.ts`
- `drizzle/tables/hr-compliance.ts`
- `drizzle/tables/hr-analytics.ts`
- `drizzle/tables/hr-talent.ts`

### Frontend
- `client/src/App.tsx` (routing)
- `client/src/pages/hr/HRCompensationPage.tsx` (spot check)
- 28 HR page files in `client/src/pages/hr/`

### Tests
- `server/hr/__tests__/hr-module.test.ts`
- `server/hr/__tests__/hr-lifecycle.test.ts`
- `server/hr/__tests__/hr-phase3.test.ts`
- `server/hr/__tests__/hr-phase4.test.ts`
- `server/hr/__tests__/hr-phase5.test.ts`
- `server/hr/__tests__/hr-phase6.test.ts`
