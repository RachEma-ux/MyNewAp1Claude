# HR Module — Periodic Governance Checks

## Document Status

- **Type:** Recurring governance review checklist
- **Module:** Human Resources
- **Last updated:** 2026-03-24

---

## 1. Purpose

This document defines the recurring checks that should be performed on the HR module to ensure continued governance compliance. These checks should be run whenever:

- A new HR capability (nav leaf) is implemented
- The permission model is modified
- A new backend router or endpoint is added
- A field masking function is added or changed
- An HR-related deployment is prepared

---

## 2. Permission Model Checks

### Check 2.1 — Action String Consistency

- [ ] All `requiredAction` values in `hrNavConfig.ts` exist as constants in `server/hr/permissions.ts` (`HR_ACTIONS`)
- [ ] All `sensitiveAction` values in `hrNavConfig.ts` exist in `HR_ACTIONS`
- [ ] All `scopeActions` values (global, team, self) in `hrNavConfig.ts` exist in `HR_ACTIONS`
- [ ] No orphaned action constants exist in `HR_ACTIONS` that are not referenced by any router or nav item

### Check 2.2 — Role Permission Matrix

- [ ] Every role in `HR_ROLE_PERMISSIONS` has a reasonable action set (not too broad, not too narrow)
- [ ] `employee` role only has self-service actions
- [ ] `manager` role has team-scoped actions + self-service
- [ ] `hrbp` role has all non-admin actions
- [ ] `admin` and `workspace_admin` have all actions

### Check 2.3 — Frontend Role Gating

- [ ] All pages with `hide-if-no-access` visibility use `useHrRole().can()` or `HrGate` component
- [ ] Section landing pages filter children by `requiredAction`
- [ ] Sidebar section visibility respects at least one visible child check

---

## 3. Scope and Masking Checks

### Check 3.1 — Backend Scope Enforcement

- [ ] Every router that serves user-specific data calls `resolveDataScope()` or `checkHrAccess()`
- [ ] Scope resolution cascades correctly: global → team → self → none
- [ ] Team scope returns only direct reports (via `getTeamWorkerIds()`)
- [ ] Self scope returns only the requesting user's own records

### Check 3.2 — Field Masking Enforcement

- [ ] `maskDirectoryFields()` is applied to all directory list/get responses
- [ ] `maskCompensationFields()` is applied to all compensation list/get responses
- [ ] `maskRelationsFields()` is applied to grievance/disciplinary/investigation responses
- [ ] `maskTalentFields()` is applied to talent review responses
- [ ] Masking functions replace sensitive values with `"***"` or equivalent
- [ ] Users with the `sensitiveAction` bypass masking correctly

### Check 3.3 — Nav Config Metadata Accuracy

- [ ] Items with `maskingRequired: true` correspond to routers that call masking functions
- [ ] Items with `sensitiveReadAudit: true` correspond to routers that call `logSensitiveRead()`
- [ ] `maskingFieldSet` values match the actual masking function used in the router
- [ ] `scopeActions` values match the actual `resolveDataScope()` call parameters

---

## 4. Audit Checks

### Check 4.1 — Mutation Audit Coverage

- [ ] Every `governedProcedure` mutation calls `logHrAudit()`
- [ ] Every mutation audit entry includes: actor, target, action type, metadata
- [ ] No mutation path exists that bypasses audit logging

### Check 4.2 — Sensitive Read Audit Coverage

- [ ] All compensation reads call `logSensitiveRead()`
- [ ] All relations (grievance/disciplinary/investigation) reads call `logSensitiveRead()`
- [ ] All talent review reads call `logSensitiveRead()`
- [ ] Work permit reads call `logSensitiveRead()`
- [ ] Letter/certificate reads call `logSensitiveRead()`

### Check 4.3 — Self-Approval Prevention

- [ ] Time entry approvals enforce `preventSelfApproval()`
- [ ] Leave request approvals enforce `preventSelfApproval()`
- [ ] Overtime approvals enforce `preventSelfApproval()`
- [ ] Bonus approvals enforce `preventSelfApproval()`
- [ ] Manager review submissions enforce `preventSelfApproval()`

---

## 5. Route and Nav Checks

### Check 5.1 — Route Registration

- [ ] All section landing routes are registered in `App.tsx`
- [ ] All flat page routes are registered in `App.tsx`
- [ ] All Phase 4 deep routes are registered in `App.tsx`
- [ ] No route conflicts between section routes and flat routes

### Check 5.2 — Nav Config Completeness

- [ ] Total leaf count = 68
- [ ] Total section count = 13
- [ ] Every item has: id, label, href, requiredAction, visibilityMode, scopeType, backedBy, implementationStatus
- [ ] `implementationStatus` accurately reflects current state (live vs not-started)
- [ ] `backedBy` accurately classifies each item

### Check 5.3 — Route Alias Consistency

- [ ] Every item with `backedBy: "existing-page"` and `implementationStatus: "live"` has a `currentRoute` value
- [ ] Every `currentRoute` value in the nav config corresponds to a mounted route in `App.tsx`
- [ ] Route aliases in `hrRouteAliases.ts` match nav config entries

---

## 6. Database and Schema Checks

### Check 6.1 — Table Integrity

- [ ] All `hr_*` tables have proper indexes for query patterns
- [ ] Foreign key constraints are defined for cross-table references
- [ ] Timestamp columns (`createdAt`, `updatedAt`) exist on all tables
- [ ] Status columns use defined enum types

### Check 6.2 — Migration Safety

- [ ] New migrations do not drop existing columns
- [ ] New migrations do not modify existing data destructively
- [ ] Schema barrel (`drizzle/schema.ts`) exports all HR tables

---

## 7. Governance Compliance Checks

### Check 7.1 — AGENTS.md Compliance

- [ ] Substantial HR changes follow Planner → Builder → Reviewer → Tester → Governance order
- [ ] Governance docs are updated when architectural changes are made
- [ ] No silent architectural changes in HR

### Check 7.2 — Separation of Concerns

- [ ] Backend routers do not import frontend code
- [ ] Frontend does not import persistence logic directly
- [ ] Domain logic does not bypass the governance layer
- [ ] Other modules do not read HR tables directly (use `modules.hr.*`)

### Check 7.3 — Documentation Currency

- [ ] `hr-nav-architecture.md` reflects current nav config state
- [ ] `MODULE_OPEN_GAPS.md` is updated when gaps are closed or new ones discovered
- [ ] `MODULE_CONTROL_SURFACE.md` is updated when routes or routers are added
- [ ] Implementation status counts in governance docs match actual code

---

## 8. Phase 9 — Operationalization Checks

### Check 8.1 — Nav Drift Detection

- [ ] `hrNavBaseline.ts` matches the current nav config digest (no unintentional drift)
- [ ] `hr-phase9.test.ts` drift detection tests pass
- [ ] If nav config was intentionally changed, `hrNavBaseline.ts` has been updated to match
- [ ] Per-section baselines in `HR_SECTION_BASELINES` match actual section item counts

### Check 8.2 — Backend Domain Consistency

- [ ] All `backendDomain` values in `hrNavConfig.ts` exist in `HR_BACKEND_DOMAINS` constant
- [ ] `findUnknownBackendDomains()` returns empty array
- [ ] New sub-routers added to `server/hr/` are reflected in `HR_BACKEND_DOMAINS`

### Check 8.3 — Dead-End and Deferred Handling

- [ ] `getDeadEndItems()` returns empty array (no broken live item routes)
- [ ] Section landing pages sort live items before deferred items
- [ ] Deferred cards show contextual guidance to available capabilities
- [ ] Empty-state sections have "Back to HR Home" action
- [ ] Sections with high deferral rates (>50%) show summary message

### Check 8.4 — Observability

- [ ] `trackSectionVisit()` is called in section landing pages
- [ ] `trackDeadEnd()` is called when users hit empty sections
- [ ] No PII or HR content is tracked — only navigation signals
- [ ] Event buffer does not grow unbounded (MAX_BUFFER_SIZE enforced)

### Check 8.5 — Feature Flag Currency

- [ ] `hr.settings.get` version matches current phase (9.0.0)
- [ ] All Phase 9 feature flags are present and true
- [ ] Prior phase feature flags remain intact
