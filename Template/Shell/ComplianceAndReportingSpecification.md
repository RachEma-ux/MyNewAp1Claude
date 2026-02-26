# Compliance & Reporting Specification
# Phase 3 — Runtime & Federation

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Compliance posture assessment and reporting

---

## 1. Purpose

Defines how the platform generates compliance reports covering:

- Governance enforcement status
- Drift detection results
- Resource utilization
- Evidence completeness
- Freeze history
- Audit trail integrity

---

## 2. Report Types

### 2.1 Workspace Compliance Report
Per-workspace assessment:
- Governance profile adherence
- Resource tier compliance
- Drift status (clean | drifted | frozen)
- Evidence completeness
- Open violations

### 2.2 Organization Compliance Report
Aggregate across all workspaces:
- Total workspaces by status
- Drift summary (clean / drifted / frozen counts)
- Resource utilization summary
- Budget utilization summary
- Top violations

### 2.3 Federation Compliance Report
Cross-boundary assessment:
- Federation peer status
- Trust level summary
- Cross-boundary violations
- Policy reconciliation status

### 2.4 Audit Integrity Report
Evidence system health:
- Checksum validation results
- Missing evidence count
- Tamper detection results
- Retention compliance

---

## 3. Report Generation

### 3.1 Scheduled
- Daily summary (lightweight)
- Weekly detailed report
- Monthly executive report
- Quarterly compliance assessment

### 3.2 On-Demand
- Admin-triggered report
- Incident-triggered report
- Audit-triggered report

### 3.3 Event-Driven
- Generated automatically after:
  - Freeze event
  - Critical drift detection
  - Decommissioning completion
  - Federation trust change

---

## 4. Report Format

Reports must include:
- Report ID
- Report type
- Generated at (timestamp)
- Scope (workspace | organization | federation)
- Summary metrics
- Detail sections
- Recommendations (if applicable)
- Evidence references

Output formats:
- JSON (machine-readable, canonical)
- Markdown (human-readable)

---

## 5. Compliance Scoring

### 5.1 Workspace Score

| Score   | Meaning                          |
|---------|----------------------------------|
| 100     | Fully compliant                  |
| 80-99   | Minor issues (informational)     |
| 60-79   | Moderate issues (review needed)  |
| 40-59   | Significant issues (action needed)|
| 0-39    | Critical non-compliance          |

### 5.2 Scoring Factors
- Governance profile adherence (weight: 30%)
- Resource tier compliance (weight: 20%)
- Drift status (weight: 20%)
- Evidence completeness (weight: 15%)
- Audit integrity (weight: 15%)

---

## 6. Alerting Integration

Reports may trigger alerts:
- Score below threshold → notify admin
- Critical finding → immediate alert
- Trend degradation → weekly digest

---

## 7. Retention

- Reports archived per governance profile retention rules
- Default: 1 year
- Compliance reports are evidence artifacts (immutable)

---

## 8. Audit Requirements

Report generation itself must record:
- Report ID
- Report type
- Scope
- Requestor (if on-demand)
- Generation timestamp
- Distribution list

---

End of Document
