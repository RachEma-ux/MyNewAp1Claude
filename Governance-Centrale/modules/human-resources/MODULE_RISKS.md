# HR Module — Risk Register

## Document Status

- **Type:** Risk register
- **Module:** Human Resources
- **Last updated:** 2026-03-24

---

## 1. Active Risks

### R1 — Permission Matrix Defined but Not Fully Enforced at Runtime

| Field | Value |
|---|---|
| Severity | **High** |
| Likelihood | Medium |
| Status | Open |
| Impact | Users could access data beyond their role's intended scope |

**Description:** The `HR_ROLE_PERMISSIONS` matrix and `HR_ACTIONS` constants are defined in `server/hr/permissions.ts`, but not all router endpoints consistently call `checkHrAccess()` or `requireHrPermission()` before returning data. Some endpoints rely only on `protectedProcedure` (authentication) without role-specific checks.

**Mitigation:** Audit all router endpoints to ensure every read and write calls the appropriate permission check function. Add integration tests for permission boundary enforcement.

---

### R2 — Reminders Service References Non-Existent Columns

| Field | Value |
|---|---|
| Severity | **Critical** |
| Likelihood | High |
| Status | Open (from HR_MODULE_AUDIT_REPORT) |
| Impact | Reminder jobs will crash at runtime |

**Description:** Per the HR Module Audit Report, `reminders.ts` references a `dueDate` column on `hrPerformanceReviews` that does not exist in the schema, and uses status enum values that don't match the schema definitions.

**Mitigation:** Fix column references and enum values in reminders.ts to match actual schema definitions.

---

### R3 — 35 Nav Items Have No Backend Implementation

| Field | Value |
|---|---|
| Severity | **Medium** |
| Likelihood | Certain |
| Status | Accepted (by design) |
| Impact | 52% of the nav config points to capabilities that don't exist yet |

**Description:** 35 of 68 nav items have `implementationStatus: "not-started"` and `backedBy: "not-yet-implemented"`. These show as "Coming soon" cards in section landing pages.

**Mitigation:** This is by design — phased rollout. Each new capability must pass governance review (permission assignment, scope classification, sensitive data audit, masking enforcement, audit logging) before implementation.

---

### R4 — Sensitive Data Exposure Through Bulk List Endpoints

| Field | Value |
|---|---|
| Severity | **High** |
| Likelihood | Low (masking mitigates) |
| Status | Partially mitigated |
| Impact | PII or compensation data could leak through list responses |

**Description:** While field masking functions exist and are applied, the masking coverage depends on each router correctly calling the masking function. A router bug or new endpoint that omits masking would expose sensitive fields.

**Mitigation:** The periodic check (Check 3.2) verifies masking coverage. Integration tests should assert that masked fields return `"***"` for unauthorized users.

---

### R5 — No Data Export Audit Trail

| Field | Value |
|---|---|
| Severity | **Medium** |
| Likelihood | Medium |
| Status | Open |
| Impact | Bulk data exports could happen without audit record |

**Description:** The `export` audit category exists in `server/hr/audit.ts` but no router currently uses it. If HR data is exported through any mechanism (CSV download, API bulk read), there is no audit trail.

**Mitigation:** Implement export audit logging when export functionality is added. Consider adding it to analytics report download endpoints.

---

### R6 — Route Alias Redirects Not Yet Active

| Field | Value |
|---|---|
| Severity | **Low** |
| Likelihood | Certain |
| Status | Deferred (by design) |
| Impact | Old bookmarked URLs work but don't redirect to canonical paths |

**Description:** All 28 route aliases in `hrRouteAliases.ts` are in `"documented"` status. No automatic redirects are implemented from old flat routes to new canonical hierarchical routes.

**Mitigation:** Acceptable for current phase. Phase 8 added automated validation: all 28 aliases have valid target sections, `hr-nav-validation.test.ts` verifies alias integrity. When redirects are activated, update alias status to `"active-redirect"` and add `<Redirect>` components.

---

### R7 — Test Coverage Gaps

| Field | Value |
|---|---|
| Severity | **Medium** |
| Likelihood | Medium |
| Status | Open |
| Impact | Regression risk when modifying HR routers or permissions |

**Description:** Per the HR Module Audit Report, ~150 tests exist across 5 test files but 2 tests will fail due to schema/status mismatches. Permission boundary tests exist but don't cover all endpoints.

**Mitigation:** Phase 8 added `hr-nav-validation.test.ts` with 40+ assertions covering nav config, route coherence, role/visibility, scope, and masking. Combined with the existing 6 test files (Phases 1-6), ~200 tests now exist. Remaining gaps: frontend component tests, E2E tests.

---

## 2. Mitigated Risks

### R8 — Sensitive Fields Exposed in Directory DTO (MITIGATED)

| Field | Value |
|---|---|
| Severity | Was High |
| Status | Mitigated |
| Mitigation | `maskDirectoryFields()` applied to all directory list/get responses |

---

### R9 — Self-Approval on Critical Workflows (MITIGATED)

| Field | Value |
|---|---|
| Severity | Was High |
| Status | Mitigated |
| Mitigation | `preventSelfApproval()` enforced on time, leave, overtime, bonus, and review approvals |

---

### R10 — Backward Route Compatibility (MITIGATED)

| Field | Value |
|---|---|
| Severity | Was Medium |
| Status | Mitigated |
| Mitigation | All 29 original flat routes preserved alongside 13 new section routes. Route alias map documents the full mapping for future redirect activation. |

---

## 3. Risk Summary

| Risk | Severity | Status |
|---|---|---|
| R1 — Permission enforcement gaps | High | Open |
| R2 — Reminders column reference bug | Critical | Open |
| R3 — 35 unimplemented nav items | Medium | Accepted |
| R4 — Sensitive data exposure | High | Partially mitigated |
| R5 — No export audit trail | Medium | Open |
| R6 — Route redirects not active | Low | Deferred (validated) |
| R7 — Test coverage gaps | Medium | Partially mitigated |
| R8 — Directory DTO exposure | Was High | Mitigated |
| R9 — Self-approval bypass | Was High | Mitigated |
| R10 — Backward route compat | Was Medium | Mitigated |
