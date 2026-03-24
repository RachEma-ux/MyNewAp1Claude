# HR Carbon SideNav — Audit Expectations Map

## Document Status

- **Type:** Per-item audit expectation classification
- **Phase:** 0 — Governance-first definition
- **Date:** 2026-03-24
- **Canonical source of truth:** `client/src/config/hrNavConfig.ts` (declarations), `server/hr/audit.ts` (implementation)

---

## 1. Audit Model Overview

The HR module uses three audit functions:

| Function | Category | Trigger |
|---|---|---|
| `logHrAudit()` | mutation, assignment, approval, system | All create/update/delete operations |
| `logSensitiveRead()` | sensitive_read | Reading masked/restricted data with elevated permissions |
| `logStatusChange()` | status_change | Lifecycle state machine transitions |

Every audit entry includes: actor ID, target entity, action type, category, metadata, timestamp, workspace ID.

---

## 2. Per-Section Audit Expectations

### 2.1 Workforce Planning & Organization

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| workforce-planning-core | No | logHrAudit() | — |
| job-architecture | No | logHrAudit() | — |
| org-structure | No | logHrAudit() | — |
| headcount-budget | No | logHrAudit() | — |
| position-management | No | logHrAudit() | — |

**Governance note:** Organizational reads are not audited (non-sensitive aggregate data). All mutations are audited.

### 2.2 Talent Acquisition

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| recruitment-requests | No | logHrAudit() | — |
| job-posting-sourcing | No | logHrAudit() | — |
| candidate-pipeline | No | logHrAudit() | — |
| interview-management | No | logHrAudit() | — |
| offer-management | No | logHrAudit() | Offer approvals should use approval audit when implemented |
| pre-boarding | No | logHrAudit() | — |

**Governance note:** Offer management is scope-sensitive but not read-audited. Consider adding read audit for offer terms when implemented.

### 2.3 Onboarding & Offboarding

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| onboarding-checklist | No | logHrAudit() | Status changes use logStatusChange() |
| onboarding-documents | No | logHrAudit() | — |
| onboarding-access | No | logHrAudit() | — |
| onboarding-orientation | No | logHrAudit() | — |
| offboarding-termination | No | logHrAudit() | Status changes use logStatusChange() |
| offboarding-knowledge-transfer | No | logHrAudit() | — |
| offboarding-exit-interview | No | logHrAudit() | Consider sensitive-read audit for exit content |
| offboarding-access-removal | No | logHrAudit() | — |

### 2.4 Employee Records & Administration

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| employee-profile | No | logHrAudit() | Directory masking applied but reads not audited |
| contracts-documents | No | logHrAudit() | Consider audit when implemented (contract data) |
| employment-changes | No | logHrAudit() | Promotion/transfer mutations audited |
| work-permits-compliance | **logSensitiveRead()** | logHrAudit() | Work permit reads are sensitive |
| hr-letters-certificates | No | logHrAudit() | Letter generation audited as mutation |

### 2.5 Compensation & Benefits

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| salary-structure | **logSensitiveRead()** | logHrAudit() | All comp reads audited |
| annual-salary-review | **logSensitiveRead()** | logHrAudit() | All comp reads audited |
| bonus-incentives | **logSensitiveRead()** | logHrAudit() | Bonus approvals: logHrAudit() + preventSelfApproval() |
| health-insurance | **logSensitiveRead()** | logHrAudit() | All comp reads audited |
| pension-retirement | **logSensitiveRead()** | logHrAudit() | All comp reads audited |
| allowances-perks | **logSensitiveRead()** | logHrAudit() | All comp reads audited |

**Governance note:** All 6 compensation items trigger sensitive-read audit. This is the highest-audit section.

### 2.6 Time & Attendance

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| time-tracking | No | logHrAudit() | Time approvals: logHrAudit() + preventSelfApproval() |
| leave-management | No | logHrAudit() | Leave approvals: logHrAudit() + preventSelfApproval() |
| overtime-requests | No | logHrAudit() | Overtime approvals: logHrAudit() + preventSelfApproval() |
| shift-planning | No | logHrAudit() | — |

**Governance note:** Reads not audited (self-service data). Approval workflows enforce separation of duties via `preventSelfApproval()`.

### 2.7 Learning & Development

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| training-catalog | No | logHrAudit() | — |
| mandatory-training | No | logHrAudit() | — |
| skill-development | No | logHrAudit() | — |
| certifications | No | logHrAudit() | — |
| learning-history | No | logHrAudit() | — |

**Governance note:** Learning data is not sensitive. Standard mutation audit only.

### 2.8 Performance & Talent Management

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| goal-setting | No | logHrAudit() | — |
| performance-reviews | No | logHrAudit() | Review approvals: logHrAudit() + preventSelfApproval() |
| feedback-360 | No | logHrAudit() | — |
| talent-reviews | **logSensitiveRead()** | logHrAudit() | Talent assessment data is highly sensitive |
| succession-planning | No | logHrAudit() | Consider sensitive-read audit when implemented |

### 2.9 Employee Relations

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| hr-policies | No | logHrAudit() | Policies are public-internal; no read audit |
| grievances-complaints | **logSensitiveRead()** | logHrAudit() | Grievance content has legal implications |
| disciplinary-actions | **logSensitiveRead()** | logHrAudit() | Disciplinary records legally protected |
| workplace-investigations | **logSensitiveRead()** | logHrAudit() | Investigation findings highly sensitive |

### 2.10 Well Being & Engagement

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| employee-surveys | No | logHrAudit() | — |
| engagement-programs | No | logHrAudit() | — |
| wellbeing-resources | No | logHrAudit() | — |
| recognition-programs | No | logHrAudit() | — |

**Governance note:** Engagement data is not sensitive. Standard mutation audit only.

### 2.11 HR Analytics & Reporting

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| workforce-dashboards | No | N/A | Read-only aggregates |
| attrition-retention | No | N/A | Read-only aggregates |
| diversity-inclusion | No | N/A | Read-only aggregates |
| compliance-reports | No | N/A | Read-only aggregates |
| custom-analytics | No | logHrAudit() | Report definition mutations audited |

### 2.12 Security & Access

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| role-based-access | No | logHrAudit() | Role assignment changes audited |
| access-controls | No | logHrAudit() | — |
| data-privacy-settings | No | logHrAudit() | — |
| audit-logs | No | N/A | Audit log viewer not itself audited (avoids recursion) |
| security-policies | No | logHrAudit() | — |

### 2.13 Compliance

| Item | Read Audit | Write Audit | Special |
|---|---|---|---|
| policy-management | No | logHrAudit() | — |
| incident-reporting | No | logHrAudit() | — |
| compliance-management | No | logHrAudit() | — |
| audit-reporting | No | logHrAudit() | — |
| privacy-access-controls | No | logHrAudit() | — |
| risk-management | No | logHrAudit() | — |

---

## 3. Audit Summary

| Category | Count |
|---|---|
| Items with sensitive-read audit | 10 |
| Items with mutation audit only | 53 |
| Items with approval + SoD audit | 5 (time, leave, overtime, bonus, reviews) |
| Items with status-change audit | 2 (onboarding, offboarding) |
| Read-only items (no write audit) | 5 (analytics dashboards, audit logs) |

---

## 4. Source of Truth

- **Audit declarations:** `client/src/config/hrNavConfig.ts` → `sensitiveReadAudit`
- **Audit functions:** `server/hr/audit.ts` → `logHrAudit()`, `logSensitiveRead()`, `logStatusChange()`
- **SoD enforcement:** `server/hr/permissions.ts` → `preventSelfApproval()`
- **Detailed audit model:** `Governance-Centrale/modules/human-resources/MODULE_AUDIT_MODEL.md`
