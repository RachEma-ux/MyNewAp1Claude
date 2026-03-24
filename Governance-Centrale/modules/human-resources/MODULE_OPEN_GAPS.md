# HR Module — Open Gaps

## Document Status

- **Type:** Honest gap list and deferred items
- **Module:** Human Resources
- **Last updated:** 2026-03-24

---

## 1. Unimplemented Nav Items (35 of 68)

These nav items are declared in `hrNavConfig.ts` but have no backend or frontend implementation yet. They show as "Coming soon" cards in section landing pages.

### Workforce Planning & Organization (2 of 5 unimplemented)

| Item ID | Label | Required Action |
|---|---|---|
| workforce-planning-core | Workforce Planning | hr.organization.read |
| headcount-budget | Headcount & Budget Planning | hr.organization.write |

### Talent Acquisition (5 of 6 unimplemented)

| Item ID | Label | Required Action |
|---|---|---|
| job-posting-sourcing | Job Posting & Sourcing | hr.recruiting.write |
| candidate-pipeline | Candidate Pipeline | hr.recruiting.read |
| interview-management | Interview Management | hr.recruiting.read |
| offer-management | Offer Management | hr.recruiting.manage |
| pre-boarding | Pre-boarding | hr.onboarding.manage |

### Onboarding & Offboarding (6 of 8 unimplemented)

| Item ID | Label | Required Action |
|---|---|---|
| onboarding-documents | Document Collection | hr.onboarding.manage |
| onboarding-access | Equipment & Access Setup | hr.onboarding.manage |
| onboarding-orientation | Orientation & Training | hr.onboarding.manage |
| offboarding-knowledge-transfer | Knowledge Transfer | hr.offboarding.manage |
| offboarding-exit-interview | Exit Interview | hr.offboarding.manage |
| offboarding-access-removal | Access & Equipment Removal | hr.offboarding.manage |

### Employee Records & Administration (2 of 5 unimplemented)

| Item ID | Label | Required Action |
|---|---|---|
| contracts-documents | Contracts & Documents | hr.directory.read |
| employment-changes | Employment Changes | hr.directory.write |

### Compensation & Benefits (4 of 6 unimplemented)

| Item ID | Label | Required Action |
|---|---|---|
| annual-salary-review | Annual Salary Review | hr.compensation.manage |
| bonus-incentives | Bonus & Incentives | hr.compensation.manage |
| pension-retirement | Pension & Retirement | hr.benefits.read |
| allowances-perks | Allowances & Perks | hr.benefits.read |

### Time & Attendance

All 4 items are implemented. **No gaps.**

### Learning & Development (2 of 5 unimplemented)

| Item ID | Label | Required Action |
|---|---|---|
| mandatory-training | Mandatory Training | hr.learning.read |
| learning-history | Learning History | hr.learning.read |

### Performance & Talent Management (2 of 5 unimplemented)

| Item ID | Label | Required Action |
|---|---|---|
| feedback-360 | 360 Feedback | hr.performance.read |
| succession-planning | Succession Planning | hr.succession.read |

### Employee Relations (2 of 4 unimplemented)

| Item ID | Label | Required Action |
|---|---|---|
| disciplinary-actions | Disciplinary Actions | hr.relations.manage |
| workplace-investigations | Workplace Investigations | hr.relations.manage |

### Well Being & Engagement (2 of 4 unimplemented)

| Item ID | Label | Required Action |
|---|---|---|
| wellbeing-resources | Well being Resources | hr.engagement.read |
| recognition-programs | Recognition Programs | hr.recognition.read |

### HR Analytics & Reporting (3 of 5 unimplemented)

| Item ID | Label | Required Action |
|---|---|---|
| attrition-retention | Attrition & Retention | hr.analytics.read |
| diversity-inclusion | Diversity & Inclusion Metrics | hr.analytics.read |
| custom-analytics | Custom Analytics | hr.analytics.manage |

### Security & Access (2 of 5 unimplemented)

| Item ID | Label | Required Action |
|---|---|---|
| data-privacy-settings | Data Privacy | hr.analytics.manage |
| security-policies | Security Policies | hr.analytics.manage |

### Compliance (3 of 6 unimplemented)

| Item ID | Label | Required Action |
|---|---|---|
| policy-management | Policy Management | hr.compliance.read |
| audit-reporting | Audit & Reporting | hr.compliance.read |
| privacy-access-controls | Data Privacy & Access Controls | hr.compliance.manage |

---

## 2. Permission Enforcement Gaps

| Gap | Severity | Detail |
|---|---|---|
| Not all router endpoints enforce role-based access | High | Some endpoints use only `protectedProcedure` (auth check) without `checkHrAccess()` or `requireHrPermission()` |
| Frontend role gating improved (Phase 7.3+) | Low | 16 routes use `hrGated()`, 12 self-service routes auth-only, section landings filter by role. Remaining: section landing pages show filtered items without `hrGated()` (by design) |
| No middleware-level permission enforcement | Medium | Permissions checked per-endpoint, no global HR middleware |
| Mixed-scope items without scopeActions | Low | 6 live items with `scopeType=mixed` lack fine-grained `scopeActions` definitions; scope fallback works but is not explicit |

---

## 3. Runtime Bugs (from HR_MODULE_AUDIT_REPORT)

| Bug | Severity | Detail |
|---|---|---|
| reminders.ts references non-existent `dueDate` column | Critical | `hrPerformanceReviews` table has no `dueDate` column |
| reminders.ts uses wrong status enum values | Critical | Status values in code don't match schema enum definitions |
| 2 failing tests | Medium | Schema/status mismatches cause test failures |
| Seed data field mismatches | Medium | Some seed data references fields that don't exist on target tables |

---

## 4. Architecture Gaps

| Gap | Priority | Detail |
|---|---|---|
| No workspace-module HR router | Low | `modules.hr.*` namespace described in scaffold but not yet implemented |
| No event publishing | Low | Domain events (`hr.worker.created`, etc.) designed but not implemented |
| No background jobs | Medium | Reminder/expiry jobs designed but have critical bugs |
| No data retention policy | Low | `document-retention.policy.json` planned but not created |
| No GDPR-style privacy controls | Low | Planned for compliance phase |

---

## 5. Documentation Gaps

| Gap | Priority | Detail |
|---|---|---|
| No HR API specification doc | Low | API surface documented in control surface doc but no formal OpenAPI/tRPC spec |
| No HR domain model doc | Low | `HR_DOMAIN_MODEL.md` planned in roadmap but not created |
| No HR security and compliance doc | Low | `HR_SECURITY_AND_COMPLIANCE.md` planned in roadmap but not created |
| Phase 0 governance package | **Closed** | 8 artifacts created — governance impact note, capability inventory, visibility classification, permission map, scope map, sensitivity map, audit expectations, phase 0 summary. See [CARBON_SIDENAV_PHASE0_SUMMARY.md](CARBON_SIDENAV_PHASE0_SUMMARY.md) |

---

## 6. Test Gaps

| Gap | Priority | Detail |
|---|---|---|
| Permission boundary tests incomplete | Medium | Not all endpoints have deny-path tests |
| Field masking assertion tests missing | Medium | No tests verify `"***"` replacement for unauthorized users |
| Frontend component tests missing | Low | HR pages have no unit or integration tests |
| E2E tests missing | Medium | No end-to-end tests for full HR workflows |
| Nav config + role/visibility tests | **Closed** | Phase 6-8 added `hr-nav-validation.test.ts` with 66+ assertions |
| Route coherence tests | **Closed** | Phase 6-8 verifies all 48 routes mounted, ordering correct |
| Backward compatibility tests | **Closed** | Phase 6-8 verifies all 28 aliases valid |
| Final acceptance tests | **Closed** | Phase 8 added `hr-phase8.test.ts` with ~50 assertions — reality alignment, deferred consistency, governance coherence |
| Config-to-surface alignment | **Closed** | Phase 8 verifies every live item has matching page file on disk |
| Sensitive governance alignment | **Closed** | Phase 8 verifies sensitive items hidden from unauthorized roles, masking functions exist |
| Drift detection tests | **Closed** | Phase 9 added digest determinism, baseline comparison, section change detection (`hr-phase9.test.ts` A) |
| Dead-end detection tests | **Closed** | Phase 9 added zero dead-end verification, deferred analysis, high-deferral detection (`hr-phase9.test.ts` C) |
| Section completion tests | **Closed** | Phase 9 added per-section stats, health summary coherence (`hr-phase9.test.ts` B) |
| Backend domain consistency tests | **Closed** | Phase 9 added 14-domain constant validation, no-unknown check (`hr-phase9.test.ts` D) |
| Observability unit tests | **Closed** | Phase 9 added event accumulation, summary aggregation, top deferred items (`hr-phase9.test.ts` E) |
| Maintainability helper tests | **Closed** | Phase 9 added implementation breakdown, baseline integrity (`hr-phase9.test.ts` F-G) |
| Feature flag currency tests | **Closed** | Phase 9 verifies version 9.0.0, all Phase 9 flags present (`hr-phase9.test.ts` H) |

---

## 7. Gap Closure Governance Rule

When closing any gap listed above:

1. Update this document to move the gap from "Open" to "Closed" with date
2. Update `MODULE_CONTROL_SURFACE.md` if routes/routers change
3. Update `hr-nav-architecture.md` if nav items change status
4. Follow AGENTS.md orchestration: Planner → Builder → Reviewer → Tester → Governance
5. Each new capability must pass: permission assignment review, scope classification review, sensitive data handling audit, audit logging coverage verification, field masking policy enforcement
