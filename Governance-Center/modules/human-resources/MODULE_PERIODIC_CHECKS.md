# HR Module — Periodic Governance Checks

## Purpose

This checklist defines recurring governance reviews for the HR module. Each check should be performed at the specified cadence to detect drift, gaps, and regressions.

---

## Nav/Config Drift Checks

| Check | How | Cadence |
|---|---|---|
| Nav config item count matches expectations | Run `getAllHrNavItems().length` — currently expected: 69 | Monthly |
| No unknown backend domains | Run `findUnknownBackendDomains()` — should return empty array | Monthly |
| Implementation breakdown is accurate | Run `getImplementationBreakdown()` — compare live/placeholder/not-started counts | Monthly |
| Section count unchanged | Verify `HR_NAV_CONFIG.sections.length` === 13 | Monthly |
| Backend domain constants cover all referenced domains | Compare `HR_BACKEND_DOMAINS` values against `getReferencedBackendDomains()` | Monthly |

## Route/Visibility Drift Checks

| Check | How | Cadence |
|---|---|---|
| All `currentRoute` values in nav config resolve to registered routes | Cross-reference nav config `currentRoute` fields against `App.tsx` route registrations | After any route change |
| All `currentComponent` values reference existing page files | Verify each `currentComponent` exists in `client/src/pages/hr/` | After any page add/remove |
| SideNav only shows live/placeholder items | Verify `getSidebarItems()` filter logic in `HRSideNav.tsx` | Quarterly |
| Pinned Directory link in SideNav is scope-gated on backend | Verify `/hr/directory` endpoint enforces `resolveDataScope` | Quarterly |

## Permission/Scope Truthfulness Checks

| Check | How | Cadence |
|---|---|---|
| `requiredAction` on each nav item matches backend enforcement | For each live item, verify the backend router checks the declared action | After any permission change |
| `scopeType` claims match backend `resolveDataScope` behavior | For items declaring `self`/`team`/`mixed`, verify backend scoping | Quarterly |
| `HR_ROLE_PERMISSIONS` matrix is complete | Verify every action in `HR_ACTIONS` appears in at least one role's permission list | After any action add |
| Role priority ordering is correct | Verify `admin > workspace_admin > hrbp > manager > employee` in `getHrRoleForUser` | Quarterly |

## Sensitive Leaf Review

| Check | How | Cadence |
|---|---|---|
| All items with `sensitiveReadAudit: true` actually trigger audit logging | Verify backend calls `logSensitiveRead` for declared items | Quarterly |
| All items with `sensitiveAction` gate unmasked access correctly | Test that lacking the `sensitiveAction` returns masked data | Quarterly |
| Compensation/relations/talent items are masked for employee/manager roles | Test API responses for non-privileged roles | Quarterly |

## Deferred Leaf Review

| Check | How | Cadence |
|---|---|---|
| Not-started item count is tracked | Run `getItemsByStatus("not-started").length` — currently 35 | Monthly |
| No deferred item has accidentally gained a `currentRoute` | Check that not-started items have no `currentRoute` or `currentComponent` | Monthly |
| Deferred items are not shown in sidebar | Verify `getSidebarItems()` excludes `not-started` and `planned` | Quarterly |

## Masking Review

| Check | How | Cadence |
|---|---|---|
| All 8 masking functions are used by at least one router | Grep for each `mask*Fields` function in `server/hr/` | Quarterly |
| Masked field lists match actual DTO shapes | Verify `MASKED_*_FIELDS` arrays match actual fields in DB/response DTOs | After schema change |
| Masking uses `null` (not `undefined`) | Verify `maskFields` generic function sets `null` | One-time (done in Phase 7) |

## Audit Coverage Review

| Check | How | Cadence |
|---|---|---|
| All mutation endpoints call `logHrAudit` or equivalent | Grep all `.mutation(` in HR sub-routers for audit calls | After any mutation add |
| `preventSelfApproval` is applied to all approval endpoints | Verify time, leave, overtime, performance, role-def approval procedures | After any approval endpoint add |
| Worker status transitions follow `WORKER_STATUS_FLOW` | Test invalid transitions are rejected | Quarterly |

## Rollout-State Review

| Check | How | Cadence |
|---|---|---|
| Feature flags in `hr.settings.get` match actual implementation | Compare `features` object in settings router with actual code state | After any phase completion |
| Carbon SideNav is rendering correctly | Visual check: expand HR menu, verify sections/items match nav config | After any nav change |
| `HRSideNav.tsx` consumes latest `hrNavConfig.ts` | Verify no stale local nav arrays exist in sidebar code | After any nav config change |

---

## Review Ownership

These checks should be performed by the Reviewer and Governance agents as part of the AGENTS.md orchestration order for any HR-related change.

## Global Doctrine Reference

- Review cadence and evidence requirements: [Governance-Center/global/OPERATIONAL_COMPLIANCE_MODEL.md](../../global/OPERATIONAL_COMPLIANCE_MODEL.md)
