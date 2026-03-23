# Governance-to-HR Compatibility Assessment

**Repository:** `RachEma-ux/MyNewAp1Claude`
**Assessment Date:** 2026-03-23
**Methodology:** Code-level audit per `AGENTS.md` operating order — Planner (scope identification) → Reviewer (evidence-based assessment) → Governance (compatibility judgment)

---

## 1. Executive Verdict

### **COMPATIBLE WITH REQUIRED ADAPTATIONS** (7/10)

The app's governance model is structurally suitable for an HR module. The platform provides a real governance engine (RBAC, lifecycle guard, policy gate, scorecard, freeze enforcement), a module registry with workspace-scoped enablement, two audit loggers, and both `protectedProcedure` and `governedProcedure` tRPC middleware. The HR module has already built its own permission layer (`server/hr/permissions.ts`) with a 5-role matrix, field masking, and a dedicated audit logger — and this works. However, the two permission systems (platform RBAC and HR RBAC) are **parallel and disconnected**. The platform governance was designed for LLM/agent lifecycle governance, not for human-data domain governance. Key HR requirements — user→HR-role resolution, manager/team scoping, employee self-scope, workspace-to-central data boundaries, approval workflows, and segregation of duties for HR actions — rely on **HR-side convention rather than platform enforcement**. The foundation is good, but meaningful adaptations are required before the governance model can truly govern HR in production.

---

## 2. Compatibility Scorecard

| Dimension | Score |
|---|---|
| A. Governance Architecture Fit | 7/10 |
| B. Module Governance Fit | 8/10 |
| C. Access-Control Fit | 5/10 |
| D. Sensitive-Data Governance Fit | 6/10 |
| E. Auditability Fit | 7/10 |
| F. Runtime/Workflow Governance Fit | 6/10 |
| G. Schema/Persistence Governance Fit | 8/10 |
| H. API/Contract Governance Fit | 7/10 |
| I. Frontend Governance Fit | 5/10 |
| J. Workspace/Central Governance Fit | 6/10 |
| K. Production Governance Fit | 5/10 |
| **Overall** | **6.4/10** |

---

## 3. Compatibility Matrix

### A. Governance Architecture Fit — PASS WITH ADAPTATIONS

**Evidence:**
- `server/governance/governance-engine.ts` — central governance singleton with RBAC, lifecycle, scorecard, publication gate, architecture validation, self-check
- `server/_core/trpc.ts:64-136` — `governedProcedure` middleware enforces freeze, RBAC, risk assessment, approval, evidence validation via `requireGovernedAction`
- `server/services/policyGate.ts` — `evaluatePolicy()` + `enforcePolicyOrThrow()` with fail-closed production behavior
- `ARCHITECTURE.md:18-30` — explicit governance layer in architecture stack

**Explanation:** The governance architecture is real and layered — not just docs. It has a governance engine, middleware, scoring, and enforcement pipeline. However, it was designed for **LLM/agent lifecycle governance** (submit → register → validate → publish → catalog). HR governance needs are fundamentally different: employee lifecycle, approval chains, compensation confidentiality, relations investigations. The governance architecture's abstractions (action registry, risk levels, scorecards) are extensible enough to accommodate HR, but the existing vocabulary and control catalog are LLM-domain-specific.

### B. Module Governance Fit — PASS

**Evidence:**
- `drizzle/tables/workspace-modules.ts:25` — `MODULE_KEYS` includes `"hr"` as first-class module
- `server/modules/registry.ts:22-28` — HR included in `team`, `project`, `enterprise` presets
- `server/modules/registry.ts:127-144` — `requireModule()` blocks access when HR not enabled, with workspace lifecycle check
- `server/modules/hr/router.ts` — workspace-scoped HR surface with `requireWorkspaceAccess` + `requireModule`
- `server/hr/router.ts` — global HR namespace composing 14 sub-routers

**Explanation:** The module system is one of the strongest compatibility points. HR is already registered in `MODULE_KEYS`, has workspace presets, and the `requireModule()` guard prevents unauthorized access. The dual-surface pattern (global `hr.*` for central HR, workspace `modules.hr.*` for scoped consumption) is architecturally clean and well-implemented.

### C. Access-Control Fit — PASS WITH ADAPTATIONS

**Evidence:**
- `server/_core/trpc.ts:30-62` — three procedure levels: `publicProcedure`, `protectedProcedure`, `adminProcedure`
- `server/governance/rbac-model.ts:14-21` — platform roles: `admin`, `governance_reviewer`, `operator`, `developer`, `user`, `system`
- `server/hr/permissions.ts:7-8` — HR roles: `employee`, `manager`, `hrbp`, `admin`, `workspace_admin`
- `server/hr/permissions.ts:283-289` — `getHrRoleForUser()` maps platform role → HR role using `user.role` string matching
- `drizzle/tables/workspace-rbac.ts` — capability-based RBAC tables exist (capabilities, workspace_roles, role_capabilities, principal_capabilities)

**Explanation:** The platform has **two disconnected RBAC systems**:
1. Platform RBAC (`rbac-model.ts`) with 6 governance roles and ~30 permission actions, all LLM-domain-focused
2. HR RBAC (`permissions.ts`) with 5 HR roles and ~70 HR permission actions

The HR role resolution (`getHrRoleForUser`) maps platform `user.role` directly to HR roles via string matching — there is **no dedicated user→HR-role table**. The platform RBAC has no concept of manager/team scope, employee self-scope, or HRBP assignment scope. The capability RBAC tables in `workspace-rbac.ts` exist but HR doesn't use them. This means HR role enforcement works today, but only because HR built its own system on top — the platform governance model does not natively support HR access patterns.

### D. Sensitive-Data Governance Fit — PASS WITH ADAPTATIONS

**Evidence:**
- `server/hr/permissions.ts:107-131` — three masking field lists: `MASKED_DIRECTORY_FIELDS`, `MASKED_COMPENSATION_FIELDS`, `MASKED_RELATIONS_FIELDS`
- `server/hr/permissions.ts:247-273` — `maskFields()`, `maskDirectoryFields()`, `maskCompensationFields()`, `maskRelationsFields()`
- `server/hr/permissions.ts:319-333` — `checkHrAccess()` combines permission check + masking decision in one call
- `server/hr/compensation/router.ts:70-79` — actual usage: `checkHrAccess(ctx.user, COMPENSATION_READ, COMPENSATION_READ_SENSITIVE)`
- `server/hr/audit.ts:56-74` — `logSensitiveRead()` tracks who accessed restricted data

**Explanation:** Sensitive-data governance exists and works, but it was **built by HR for HR** — not provided by the platform. The platform governance layer (`policyGate.ts`, `governanceLogger.ts`, `auditLogger.ts`) has no concept of field-level masking, DTO narrowing, or sensitive-read logging. All sensitive-data controls are in `server/hr/permissions.ts` and `server/hr/audit.ts`, applied manually per-endpoint. This works but relies entirely on developer discipline — there is no platform-level enforcement that prevents a new endpoint from returning unmasked compensation data.

### E. Auditability Fit — PASS WITH ADAPTATIONS

**Evidence:**
- `server/services/auditLogger.ts` — platform audit logger with 20+ action types, DB persistence to `governance_audit_logs`
- `server/services/governanceLogger.ts` — governance-specific logger for admission, promotion, policy reload
- `server/hr/audit.ts` — HR-specific audit logger with categories (`mutation`, `sensitive_read`, `status_change`, `assignment`, `approval`, `export`, `system`)
- `drizzle/tables/hr-core.ts:109-120` — `hr_audit_log` table with `actor_id`, `workspace_id`, `target_worker_id`, `action`, `metadata`
- `drizzle/tables/governance.ts:33-95` — `governance_scorecards` table (immutable)

**Explanation:** There are now **three audit systems**: platform audit logger, governance logger, and HR audit logger. All persist to DB. The HR audit logger is well-designed with categories and sensitive-read tracking. However, the three systems are separate — there is no unified audit trail. The platform audit logger has no HR-specific action types. The HR audit logger (`hr_audit_log` table) is separate from `governance_audit_logs`. For compliance and forensics, querying across both tables is required but not supported by a unified interface.

### F. Runtime/Workflow Governance Fit — PASS WITH ADAPTATIONS

**Evidence:**
- `server/hr/compensation/router.ts:32-63` — state machines defined per-entity (`SALARY_REVIEW_STATUS_FLOW`, `BONUS_STATUS_FLOW`, `ENROLLMENT_STATUS_FLOW`) with `validateTransition()` helper
- `server/governance/lifecycle-guard.ts` — platform lifecycle guard with sequential stage enforcement (submit → register → validate → publish → catalog)
- `server/hr/lifecycle/router.ts` — HR lifecycle router (onboarding/offboarding)
- `server/hr/jobs/reminders.ts` — reminder/deadline system

**Explanation:** The platform lifecycle guard enforces a **single, linear pipeline** designed for LLM artifacts, not HR workflows. HR has multiple parallel state machines (salary reviews, bonuses, enrollments, onboarding tasks, grievances, investigations — each with their own flow). The HR module correctly built its own `validateTransition()` patterns rather than using the platform lifecycle guard. The platform's approval flow (`requireGovernedAction` with `approvals` array) exists but is not yet integrated with HR — approval governance for HR currently relies on status field conventions, not enforced approval chains.

### G. Schema/Persistence Governance Fit — PASS

**Evidence:**
- `drizzle/tables/hr-core.ts` — `created_at`, `updated_at` timestamps on all tables
- `drizzle/tables/hr-core.ts:54-73` — worker profiles with FK to `hrPeople`, indexing, unique constraints
- `drizzle/tables/hr-compensation.ts` — compensation tables with effective dating
- `server/hr/seed.ts` — demo data seeding (behind `governedProcedure` + confirmation guard)
- All 14 HR table modules in `drizzle/tables/hr-*.ts`

**Explanation:** The persistence layer is strong. HR tables follow consistent conventions: serial PKs, timestamps, proper indexing, FK relationships, unique constraints, effective dating where needed. The schema barrel properly exports all HR tables. Seed data is behind a governed procedure with confirmation. The one gap is that `created_by`/`updated_by` audit columns are present on some tables (e.g., `hrWorkspaceAssignments`) but not consistently on all HR tables.

### H. API/Contract Governance Fit — PASS WITH ADAPTATIONS

**Evidence:**
- `server/hr/router.ts` — all sub-routers composed under `hr.*` namespace
- `server/hr/compensation/router.ts` — reads use `protectedProcedure` + `checkHrAccess`, writes use `governedProcedure`
- `server/_core/trpc.ts:136` — `governedProcedure` runs full governance pipeline
- All tRPC inputs validated via Zod schemas

**Explanation:** The API surface is well-structured. The tRPC router composition gives clean namespacing. Writes go through `governedProcedure` (which enforces freeze checks, RBAC, risk assessment). Reads go through `protectedProcedure` + manual `checkHrAccess`. However, the API contract doesn't formally prevent raw DB shape leakage — individual endpoints return DB rows directly (e.g., `server/modules/hr/router.ts:43-61` explicitly selects fields, which is good, but other routers may not be as careful). No formal DTO layer exists between DB and API response.

### I. Frontend Governance Fit — PASS WITH ADAPTATIONS

**Evidence:**
- `client/src/App.tsx:225-240+` — HR routes wrapped in `<ProtectedRoute>` (requires auth)
- 30+ HR pages registered as lazy-loaded components
- `ProtectedRoute` checks auth state but not role

**Explanation:** Frontend pages use `ProtectedRoute` which verifies authentication only. There is **no frontend role-based route guarding** — all authenticated users can navigate to all HR pages. The backend enforces access (checkHrAccess throws FORBIDDEN), but the UI will show the page first and then display an error. There is no mechanism to hide HR nav items based on the user's HR role, and no permission-denied placeholder components. Sensitive pages (compensation, relations, investigations) are navigable by anyone who is logged in.

### J. Workspace/Central Governance Fit — PASS WITH ADAPTATIONS

**Evidence:**
- `server/hr/router.ts` — global HR namespace (central authority)
- `server/modules/hr/router.ts` — workspace-scoped consumption surface
- `server/modules/hr/router.ts:31-32` — `requireWorkspaceAccess` + `requireModule` guards
- `server/modules/registry.ts:22-28` — HR in team/project/enterprise presets, absent from personal/research/sandbox

**Explanation:** The dual-surface architecture (global `hr.*` for central HR admin, `modules.hr.*` for workspace consumption) is the right pattern. Workspace HR endpoints correctly check workspace access and module enablement. However, the workspace surface (`modules.hr.listStaff`) returns worker display names, emails, and employee numbers **without applying HR masking rules** — it uses `requireWorkspaceAccess` (workspace-level) but not `checkHrAccess` (HR role-level). This means workspace members with basic access could see HR data that should be restricted by HR role. The governance boundary between central HR and workspace consumption is architecturally sound but not consistently enforced at the data level.

### K. Production Governance Fit — PASS WITH ADAPTATIONS

**Evidence:**
- `server/governance/governance-engine.ts:34-37` — strict mode in production (fail-closed)
- `server/_core/trpc.ts:72-78` — freeze check blocks all governed mutations
- `ARCHITECTURE.md:106-113` — startup validation (DEV_MODE blocked in production, encryption key required)
- `server/services/policyGate.ts:43-49` — production always fails closed
- HR permissions enforcement exists but only as HR-internal guards

**Explanation:** The platform has real production hardening: fail-closed policy evaluation, freeze enforcement, startup guards, encryption requirements. However, HR-specific production governance gaps remain: no user-to-HR-role mapping table (relies on `user.role` string matching), no enforced manager/team scoping at query level, no data isolation between HR tenants, and the split between platform audit and HR audit means compliance queries require cross-table joins not yet supported.

---

## 4. Strong Compatibility Points

1. **Module registry integration** — HR is a first-class module in `MODULE_KEYS`, with workspace presets, enablement guards, and a lifecycle check. Evidence: `drizzle/tables/workspace-modules.ts:25`, `server/modules/registry.ts:22-28`

2. **`governedProcedure` middleware** — Real governance enforcement pipeline: freeze check → action registry lookup → RBAC → risk assessment → approval → evidence validation. All HR write endpoints use this. Evidence: `server/_core/trpc.ts:64-136`

3. **Dual-surface architecture** — Global `hr.*` for central HR, workspace `modules.hr.*` for scoped consumption. This is exactly the pattern HR needs. Evidence: `server/hr/router.ts`, `server/modules/hr/router.ts`

4. **HR permission matrix** — 5-role x 70-action matrix with `checkHrAccess()` combining permission check + masking decision. Evidence: `server/hr/permissions.ts:137-231, 319-333`

5. **Three-tier audit system** — Platform audit logger, governance logger, and HR-specific audit logger with categories (mutation, sensitive_read, status_change). Evidence: `server/services/auditLogger.ts`, `server/hr/audit.ts`

6. **Field masking infrastructure** — Compensation, directory, and relations field masking built with role-aware logic. Evidence: `server/hr/permissions.ts:107-273`

7. **State machine enforcement** — HR routers enforce valid status transitions via flow maps before allowing mutations. Evidence: `server/hr/compensation/router.ts:32-63`

8. **Fail-closed production mode** — Policy gate and governance engine both fail closed in production. Evidence: `server/services/policyGate.ts:43-49`, `server/governance/governance-engine.ts:34-37`

---

## 5. Structural Incompatibilities or Weak Points

### 5.1 Disconnected RBAC Systems (Severity: HIGH)

**Evidence:** `server/governance/rbac-model.ts` defines 6 platform roles (admin, governance_reviewer, operator, developer, user, system). `server/hr/permissions.ts` defines 5 HR roles (employee, manager, hrbp, admin, workspace_admin). These are completely separate systems with no integration.

**Why it matters:** The platform governance engine doesn't know about HR roles. The policy gate's `mapToRbacAction()` has no HR actions. `requireGovernedAction()` checks platform RBAC but not HR RBAC. This means platform-level governance (freeze, scorecard, risk assessment) is enforced, but HR-specific authorization is enforced only by HR's own code.

**Adaptation required:** Either extend the platform RBAC model to include HR actions, or build a formal bridge between the two systems. Medium effort.

### 5.2 No User-to-HR-Role Mapping Table (Severity: HIGH)

**Evidence:** `server/hr/permissions.ts:283-289` — `getHrRoleForUser()` maps `user.role` string directly to HR role. There is no `hr_role_assignments` table.

**Why it matters:** In production, a user's HR role depends on context: Alice is an employee in general, a manager for her team, and a viewer for other departments. The current flat string mapping cannot express context-dependent roles. The code itself acknowledges this: "Wire to a dedicated user-to-HR-role mapping table in a future phase."

**Adaptation required:** Add `hr_role_assignments` table with context-aware role resolution. Medium effort.

### 5.3 No Manager/Team Scope Enforcement (Severity: HIGH)

**Evidence:** All HR read endpoints (`listWorkers`, `listCompensation`, etc.) return **all records** matching the query — there is no filter for "only my team" when the role is `manager`. The `checkHrAccess` helper checks permission but doesn't narrow the query scope.

**Why it matters:** A manager should only see their direct reports' data. Currently, if a manager has `DIRECTORY_READ_TEAM`, the permission check passes, but the query still returns all workers. The word "team" in `DIRECTORY_READ_TEAM` is aspirational — scope narrowing is not implemented.

**Adaptation required:** Add team-scoped query filters driven by manager-to-worker relationships. Medium-large effort.

### 5.4 No Employee Self-Scope Enforcement (Severity: MEDIUM)

**Evidence:** Employees with `DIRECTORY_READ_SELF` or `TIME_READ_SELF` permissions can call endpoints, but nothing enforces that the response contains only their own data. The `_SELF` suffix is a permission name convention, not a runtime filter.

**Why it matters:** An employee calling `hr.time.list` would see all time entries, not just their own. The backend needs `ctx.user.id` to `workerId` resolution and automatic `WHERE worker_id = :self` filtering.

**Adaptation required:** Add self-scope filtering layer. Small-medium effort.

### 5.5 Workspace HR Surface Bypasses HR Masking (Severity: MEDIUM)

**Evidence:** `server/modules/hr/router.ts:42-56` — `listStaff` returns `displayName`, `primaryEmail`, `employeeNumber` without calling `checkHrAccess` or applying any masking. It only checks `requireWorkspaceAccess`.

**Why it matters:** Any workspace member can see employee emails and employee numbers through the workspace surface, even if the central HR module would mask those fields for their role.

**Adaptation required:** Apply HR role checks and masking in workspace-facing HR endpoints. Small effort.

### 5.6 Frontend Shows Pages Without Role Checks (Severity: MEDIUM)

**Evidence:** `client/src/App.tsx:225-240+` — all HR routes use `<ProtectedRoute>` which checks authentication, not authorization. `HRCompensationPage`, `HRGrievancesPage`, etc. are accessible to any logged-in user.

**Why it matters:** Users see pages they shouldn't access. The backend returns FORBIDDEN, but the UX is poor — users navigate to a page and hit an error. Sensitive page titles (Compensation, Grievances, Incidents) are visible in navigation.

**Adaptation required:** Add role-aware route guards and nav filtering on the frontend. Medium effort.

### 5.7 Approval Workflow Not Integrated with HR (Severity: MEDIUM)

**Evidence:** `server/governance/requireGovernedAction.ts:209-244` has approval checking (role_any, role_all, dual_control), but it's not wired to HR approval needs (leave approval, salary review approval, etc.). HR status flows encode approval as status transitions (pending → approved) but don't use the platform approval system.

**Why it matters:** HR approval governance is convention-based. Anyone who can write to the endpoint can transition a salary review to "approved" — there is no enforcement that a different, appropriately-authorized person performed the approval.

**Adaptation required:** Bridge platform approval mechanism to HR approval workflows, or build HR-specific approval enforcement. Medium-large effort.

### 5.8 Three Separate Audit Systems (Severity: LOW-MEDIUM)

**Evidence:** Platform: `governance_audit_logs` via `auditLogger.ts`. Governance: same table via `governanceLogger.ts`. HR: `hr_audit_log` via `server/hr/audit.ts`. No unified query interface.

**Why it matters:** Compliance investigations need a single timeline of "who did what to this employee's data." This currently requires manual cross-table queries.

**Adaptation required:** Add unified audit query endpoint or view. Small-medium effort.

---

## 6. Reality Check: Enforced vs Implied Governance

### Truly Enforced in Runtime Today

| Control | Enforcement Point | Evidence |
|---|---|---|
| Authentication required | `protectedProcedure` middleware | `server/_core/trpc.ts:30-43` |
| Admin-only endpoints | `adminProcedure` middleware | `server/_core/trpc.ts:47-62` |
| System-wide freeze blocks mutations | `governedProcedure` checks `isFrozen(0)` | `server/_core/trpc.ts:72-79` |
| Governed mutations pass full pipeline | `requireGovernedAction` called by `governedProcedure` | `server/_core/trpc.ts:89-116` |
| Module enablement check | `requireModule()` blocks disabled modules | `server/modules/registry.ts:127-144` |
| Workspace access check | `requireWorkspaceAccess()` on workspace-scoped routes | `server/modules/hr/router.ts:31` |
| HR permission check on reads | `checkHrAccess()` throws FORBIDDEN if role lacks permission | `server/hr/permissions.ts:319-333` |
| HR field masking on sensitive reads | `maskCompensationFields()` / `maskRelationsFields()` applied per-endpoint | `server/hr/compensation/router.ts:79` |
| Fail-closed policy in production | `policyGate.ts` returns deny if evaluation fails in prod | `server/services/policyGate.ts:43-49` |
| Status transition validation | `validateTransition()` in HR routers blocks invalid state changes | `server/hr/compensation/router.ts:55-63` |

### Exist Only as Helpers/Docs/Patterns (Not Auto-Enforced)

| Control | Status | Evidence |
|---|---|---|
| HR role resolution | Helper exists, but no persistent role table | `getHrRoleForUser()` in `server/hr/permissions.ts:283-289` |
| Manager/team scope filtering | Permission names exist (`_TEAM`), but no query scoping | `HR_ACTIONS.DIRECTORY_READ_TEAM` defined but not used for filtering |
| Employee self-scope filtering | Permission names exist (`_SELF`), but no query scoping | `HR_ACTIONS.TIME_READ_SELF` defined but not used for filtering |
| Separation of duties for HR | Platform SoD exists for lifecycle, not for HR | `rbac-model.ts:150-154` only covers lifecycle |
| Approval chain enforcement | Platform has approval primitives, HR doesn't use them | `requireGovernedAction.ts:209-244` |
| Sensitive-read logging | Helper exists, called manually per-endpoint | `logSensitiveRead()` in `server/hr/audit.ts` — must be called explicitly |
| Frontend role-based routing | Not implemented | All HR routes use `ProtectedRoute` (auth only) |
| Workspace HR data masking | Not applied on workspace-facing HR endpoints | `server/modules/hr/router.ts` skips `checkHrAccess` |

### HR Requirements Currently Relying on Convention, Not Enforcement

1. **"Only managers see team data"** — relies on developers adding scope filters per-endpoint
2. **"Employees see only their own records"** — relies on developers adding self-filters
3. **"Salary reviewers cannot approve their own reviews"** — no SoD enforcement
4. **"Sensitive reads are always logged"** — relies on developers calling `logSensitiveRead()`
5. **"Workspace surfaces don't expose sensitive HR data"** — relies on developers selecting safe fields
6. **"HR pages are hidden from unauthorized users"** — no frontend role guard exists

---

## 7. HR-Domain Fit Assessment

| HR Need | Status | Notes |
|---|---|---|
| Employee self-service | Compatible with adaptation | Self-scope permissions exist in name only; query filtering needed |
| Manager/team scope | Compatible with adaptation | Manager-to-worker relationship exists in schema but not used for access scoping |
| HRBP/admin oversight | Compatible | `checkHrAccess` + role matrix handles broad access correctly |
| Compensation confidentiality | Compatible with adaptation | Masking works on global HR routes; not applied on workspace surface |
| Relations/investigations confidentiality | Compatible | `maskRelationsFields` + `logSensitiveRead` applied on relations router |
| Compliance/risk/incident governance | Compatible with adaptation | Status machines exist; approval governance needs formal enforcement |
| Staffing across workspaces | Compatible | Workspace module surface + assignment model implemented |
| Analytics/reporting boundaries | Compatible with adaptation | Analytics router has permission checks; no row-level access control |
| Lifecycle workflow governance | Compatible with adaptation | Task generators and event loggers exist; formal state machine enforcement in router |
| Audit/evidence expectations | Compatible | Three audit systems in place; unification needed for compliance queries |

---

## 8. Release-Level Compatibility Judgment

### Dev/Internal Use — YES, compatible today

The governance model is sufficient for internal development. Authentication is enforced, HR permissions exist, masking works on primary surfaces, and mutations go through `governedProcedure`. Developers testing the HR module can rely on the current controls.

### Controlled Internal Rollout — YES, with minor gaps

For a controlled rollout to trusted internal users, the governance model works with awareness of the gaps. The main risk: users with `manager` or `employee` roles seeing more data than intended due to missing scope filters. Acceptable if users are trusted and data is non-sensitive (demo data).

### Full Production with Sensitive Data — NOT YET

Several gaps must be closed:

1. **User-to-HR-role mapping table** — production cannot rely on flat `user.role` string matching
2. **Manager/team scope enforcement** — managers would see all employees' data, not just their team
3. **Employee self-scope enforcement** — employees would see all records, not just their own
4. **Workspace-facing data masking** — workspace consumers would see unmasked HR data
5. **Frontend role-based routing** — sensitive pages visible to unauthorized users
6. **Unified audit trail** — compliance investigations need single-query capability

### What Must Change for "Yes" on Production

| Gap | Why It Blocks Production |
|---|---|
| `hr_role_assignments` table | Cannot dynamically assign HR roles in multi-user production |
| Team/self scope query filters | Data over-exposure for managers and employees |
| Workspace HR masking | Data leakage through workspace consumption surface |
| Frontend auth guards | UX exposes sensitive page names/navigation |
| Unified audit query | Compliance evidence requires cross-system queries |

---

## 9. Governance Adaptation Plan

### Must Add/Change Before HR Can Be Fully Governed

| Item | Affected Files/Areas | Effort | Risk If Unresolved |
|---|---|---|---|
| Add `hr_role_assignments` table with context-aware role resolution | `drizzle/tables/hr-core.ts`, `server/hr/permissions.ts` | Medium | Users cannot have context-dependent HR roles (manager for team A, employee elsewhere) |
| Implement manager/team scope filtering | All HR read routers (directory, time, performance, compensation, etc.) | Medium-Large | Managers see all employees' data including other teams |
| Implement employee self-scope filtering | All HR read routers with `_SELF` permissions | Medium | Employees see all records, not just their own |
| Apply `checkHrAccess` + masking on workspace HR surface | `server/modules/hr/router.ts` | Small | Workspace members bypass HR masking |

### Should Add/Change Soon

| Item | Affected Files/Areas | Effort | Risk If Unresolved |
|---|---|---|---|
| Add frontend role-aware route guards for HR pages | `client/src/App.tsx`, HR page components | Medium | Sensitive pages visible to unauthorized users (poor UX, info leakage via page titles) |
| Bridge platform approval system to HR approval workflows | `server/hr/compensation/router.ts`, `server/hr/lifecycle/router.ts` | Medium-Large | Approval governance is convention-based; anyone with write access can "approve" |
| Add `created_by`/`updated_by` consistently to all HR tables | `drizzle/tables/hr-*.ts` | Small | Some mutations lack actor tracking at schema level |
| Add unified audit query endpoint | `server/hr/audit.ts` or new unified file | Small-Medium | Compliance queries require manual cross-table joins |

### Nice-to-Have Governance Strengthening

| Item | Affected Files/Areas | Effort | Risk If Unresolved |
|---|---|---|---|
| Register HR actions in platform action registry (YAML) | `config/governance/platform_action_registry.yaml`, `server/governance/action-key-map.ts` | Medium | HR mutations don't appear in platform governance dashboards |
| Add HR-specific separation-of-duty constraints | `server/governance/rbac-model.ts` or `server/hr/permissions.ts` | Small | No formal SoD enforcement for HR-specific conflicts |
| Add row-level access control for analytics | `server/hr/analytics/router.ts` | Medium | Analytics could aggregate data user shouldn't see individually |
| Integrate HR audit events into platform governance metrics | `server/services/governanceMetrics.ts` | Small | HR governance activity invisible to platform metrics |

---

## 10. Final Conclusion

**Can this app's governance model truly support an HR module?**
Yes, it can — the structural foundation is solid and the right architectural seams exist.

**Under what conditions?**
The platform governance (authentication, module enablement, governed procedure pipeline, freeze enforcement, fail-closed production mode) works for HR today. The HR-specific governance layer (permissions, masking, audit) is well-designed but must be extended with scope enforcement (team/self), a persistent role mapping table, and consistent application across both the global and workspace-facing surfaces.

**What is the single biggest governance gap?**
**Manager/team and employee self-scope enforcement.** The permission names exist (`DIRECTORY_READ_TEAM`, `TIME_READ_SELF`), the role matrix is defined, and the masking infrastructure works — but the actual query-level scoping that makes these permissions meaningful is not implemented. This means a manager can see all employees' data, and an employee can see all records. This is the gap that most directly undermines HR governance, and it cannot be solved by masking alone.

**What is the single strongest governance compatibility point?**
**The module registry + `governedProcedure` middleware pipeline.** HR is a first-class module with workspace enablement, lifecycle checks, and every write mutation passing through the full governance pipeline (freeze check → action registry → RBAC → risk assessment → approval → evidence validation). This is real, enforced infrastructure — not just documentation. It means HR mutations are already governed at the platform level, and the remaining work is extending governance to reads, scoping, and frontend surfaces.
