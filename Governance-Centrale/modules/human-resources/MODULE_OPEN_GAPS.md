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
| data-privacy-settings | Data Privacy | hr.compliance.read |
| security-policies | Security Policies | hr.compliance.manage |

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
| Frontend role gating inconsistent | Medium | Some pages use `hrGated()` HOC, others rely on sidebar visibility alone |
| No middleware-level permission enforcement | Medium | Permissions checked per-endpoint, no global HR middleware |

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

---

## 6. Test Gaps

| Gap | Priority | Detail |
|---|---|---|
| Permission boundary tests incomplete | Medium | Not all endpoints have deny-path tests |
| Field masking assertion tests missing | Medium | No tests verify `"***"` replacement for unauthorized users |
| Frontend component tests missing | Low | HR pages have no unit or integration tests |
| E2E tests missing | Medium | No end-to-end tests for full HR workflows |

---

## 7. Gap Closure Governance Rule

When closing any gap listed above:

1. Update this document to move the gap from "Open" to "Closed" with date
2. Update `MODULE_CONTROL_SURFACE.md` if routes/routers change
3. Update `hr-nav-architecture.md` if nav items change status
4. Follow AGENTS.md orchestration: Planner → Builder → Reviewer → Tester → Governance
5. Each new capability must pass: permission assignment review, scope classification review, sensitive data handling audit, audit logging coverage verification, field masking policy enforcement
