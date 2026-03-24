# HR Carbon SideNav — Capability Inventory

## Document Status

- **Type:** Full capability inventory with governance metadata
- **Phase:** 0 — Governance-first definition
- **Date:** 2026-03-24
- **Canonical source of truth:** `client/src/config/hrNavConfig.ts`
- **Total sections:** 13
- **Total leaf items:** 68

---

## How to Read This Document

This inventory lists every section and leaf item in the HR Carbon SideNav. The canonical data lives in `hrNavConfig.ts` — this document provides the same data in a reviewable governance format.

For each item:
- **Section** and **Item ID** match the config's `id` field
- **Route** is the target `href`
- **Purpose** is the business justification
- **Action** is `requiredAction` — the HR permission gate
- **Scope** is `scopeType` — data visibility classification
- **Masking** indicates whether backend field masking applies
- **Audit** indicates whether reads trigger `logSensitiveRead()`
- **Status** is `implementationStatus` / `backedBy`

---

## 1. Workforce Planning & Organization

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| workforce-planning *(section)* | Workforce Planning & Organization | /hr/workforce-planning | Strategic planning of workforce needs and org design | hr.organization.read | all | No | No | planned |
| workforce-planning-core | Workforce Planning | /hr/workforce-planning/planning | Strategic workforce demand and supply planning | hr.organization.read | all | No | No | not-started |
| job-architecture | Job Architecture & Role Definitions | /hr/workforce-planning/job-architecture | Manage job families, levels, and role definitions | hr.organization.read | all | No | No | live |
| org-structure | Organizational Structure | /hr/workforce-planning/organization | View and manage org units, hierarchy, reporting lines | hr.organization.read | all | No | No | live |
| headcount-budget | Headcount & Budget Planning | /hr/workforce-planning/headcount-budget | Plan headcount targets and budget allocation | hr.organization.write | all | No | No | not-started |
| position-management | Position Management | /hr/workforce-planning/positions | Manage approved positions, vacancies, fill status | hr.staffing.read | all | No | No | live |

---

## 2. Talent Acquisition

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| talent-acquisition *(section)* | Talent Acquisition | /hr/talent-acquisition | Attract, source, evaluate, and hire talent | hr.recruiting.read | all | No | No | planned |
| recruitment-requests | Recruitment Requests | /hr/talent-acquisition/requests | Create and track recruitment requisitions | hr.recruiting.read | all | No | No | live |
| job-posting-sourcing | Job Posting & Sourcing | /hr/talent-acquisition/job-posting | Publish job openings and manage sourcing | hr.recruiting.write | all | No | No | not-started |
| candidate-pipeline | Candidate Pipeline | /hr/talent-acquisition/pipeline | Track candidates through recruitment stages | hr.recruiting.read | all | No | No | not-started |
| interview-management | Interview Management | /hr/talent-acquisition/interviews | Schedule and manage interview rounds | hr.recruiting.read | all | No | No | not-started |
| offer-management | Offer Management | /hr/talent-acquisition/offers | Create, approve, and track job offers | hr.recruiting.manage | sensitive | No | No | not-started |
| pre-boarding | Pre-boarding | /hr/talent-acquisition/pre-boarding | Pre-hire activities before formal onboarding | hr.onboarding.read | all | No | No | not-started |

---

## 3. Onboarding & Offboarding

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| onboarding-offboarding *(section)* | Onboarding & Offboarding | /hr/lifecycle | Structured transitions into and out of the organization | hr.lifecycle.read | all | No | No | planned |
| onboarding-checklist | Onboarding / New Hire Checklist | /hr/lifecycle/onboarding/checklist | Track new hire onboarding task completion | hr.onboarding.read | mixed | No | No | live |
| onboarding-documents | Onboarding / Document Collection | /hr/lifecycle/onboarding/documents | Collect and verify required hire documents | hr.onboarding.manage | all | No | No | not-started |
| onboarding-access | Onboarding / Equipment & Access Setup | /hr/lifecycle/onboarding/access-setup | Provision equipment and system access | hr.onboarding.manage | all | No | No | not-started |
| onboarding-orientation | Onboarding / Orientation & Training | /hr/lifecycle/onboarding/orientation-training | Manage orientation sessions and initial training | hr.onboarding.read | mixed | No | No | not-started |
| offboarding-termination | Offboarding / Resignation & Termination | /hr/lifecycle/offboarding/termination | Process resignations and terminations | hr.offboarding.read | sensitive | No | No | live |
| offboarding-knowledge-transfer | Offboarding / Knowledge Transfer | /hr/lifecycle/offboarding/knowledge-transfer | Coordinate knowledge handover | hr.offboarding.manage | all | No | No | not-started |
| offboarding-exit-interview | Offboarding / Exit Interview | /hr/lifecycle/offboarding/exit-interview | Conduct and record exit interviews | hr.offboarding.manage | sensitive | No | No | not-started |
| offboarding-access-removal | Offboarding / Access Removal | /hr/lifecycle/offboarding/access-removal | Revoke system access and recover equipment | hr.offboarding.manage | all | No | No | not-started |

---

## 4. Employee Records & Administration

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| employee-records *(section)* | Employee Records & Administration | /hr/employee-records | Maintain accurate, compliant employee data | hr.directory.read | mixed | No | No | planned |
| employee-profile | Employee Profile | /hr/employee-records/profile | View and manage employee profile information | hr.directory.read | mixed | **Yes** (directory) | No | live |
| contracts-documents | Contracts & Documents | /hr/employee-records/contracts-documents | Manage employment contracts and official documents | hr.directory.read | mixed | **Yes** (directory) | No | not-started |
| employment-changes | Employment Changes | /hr/employee-records/employment-changes | Track promotions, transfers, role changes | hr.directory.write | all | **Yes** (directory) | No | not-started |
| work-permits-compliance | Work Permits & Compliance | /hr/employee-records/work-permits | Track work authorization and permit expiry | hr.compliance.read | sensitive | No | No | live |
| hr-letters-certificates | HR Letters & Certificates | /hr/employee-records/letters-certificates | Generate and manage HR letters and certificates | hr.directory.read | mixed | **Yes** (directory) | No | live |

---

## 5. Compensation & Benefits

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| compensation-benefits *(section)* | Compensation & Benefits | /hr/compensation-benefits | Manage compensation, benefits, and rewards | hr.compensation.read | sensitive | No | No | planned |
| salary-structure | Salary Structure | /hr/compensation-benefits/salary-structure | Define salary bands, grades, pay structures | hr.compensation.read | sensitive | **Yes** (compensation) | **Yes** | live |
| annual-salary-review | Annual Salary Review | /hr/compensation-benefits/salary-review | Manage annual salary review cycles | hr.compensation.manage | sensitive | **Yes** (compensation) | **Yes** | not-started |
| bonus-incentives | Bonus & Incentives | /hr/compensation-benefits/bonus-incentives | Manage bonus programs and incentive payouts | hr.compensation.manage | sensitive | **Yes** (compensation) | **Yes** | not-started |
| health-insurance | Health & Insurance Plans | /hr/compensation-benefits/health-insurance | Manage health and insurance benefit plans | hr.benefits.read | mixed | **Yes** (compensation) | **Yes** | live |
| pension-retirement | Pension & Retirement | /hr/compensation-benefits/pension-retirement | Manage pension and retirement plans | hr.benefits.read | sensitive | **Yes** (compensation) | **Yes** | not-started |
| allowances-perks | Allowances & Perks | /hr/compensation-benefits/allowances-perks | Manage allowances and perks programs | hr.benefits.read | mixed | **Yes** (compensation) | **Yes** | not-started |

---

## 6. Time & Attendance

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| time-attendance *(section)* | Time & Attendance | /hr/time-attendance | Track working hours, absences, schedules | hr.time.read | mixed | No | No | planned |
| time-tracking | Time Tracking | /hr/time-attendance/time-tracking | Log and review daily working hours | hr.time.read | self | No | No | live |
| leave-management | Absence & Leave Management | /hr/time-attendance/leave-management | Request, approve, track leave and absences | hr.leave.read | self | No | No | live |
| overtime-requests | Overtime Requests | /hr/time-attendance/overtime | Submit and approve overtime work requests | hr.overtime.read | mixed | No | No | live |
| shift-planning | Shift Planning | /hr/time-attendance/shifts | Plan and assign employee shift schedules | hr.shift.read | all | No | No | live |

---

## 7. Learning & Development

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| learning-development *(section)* | Learning & Development | /hr/learning-development | Build skills, support career growth | hr.learning.read | mixed | No | No | planned |
| training-catalog | Training Catalog | /hr/learning-development/catalog | Browse available training courses | hr.learning.read | self | No | No | live |
| mandatory-training | Mandatory Training | /hr/learning-development/mandatory | Track required compliance training | hr.learning.read | mixed | No | No | not-started |
| skill-development | Skill Development | /hr/learning-development/skills | Manage employee skills inventory | hr.learning.read | mixed | No | No | live |
| certifications | Certifications | /hr/learning-development/certifications | Track certifications and renewal dates | hr.certification.read | mixed | No | No | live |
| learning-history | Learning History | /hr/learning-development/history | View completed training records | hr.learning.read | self | No | No | not-started |

---

## 8. Performance & Talent Management

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| performance-talent *(section)* | Performance & Talent Management | /hr/performance-talent | Align goals, evaluate performance, develop talent | hr.performance.read | mixed | No | No | planned |
| goal-setting | Goal Setting | /hr/performance-talent/goals | Set and track individual and team goals | hr.performance.read | self | No | No | live |
| performance-reviews | Performance Reviews | /hr/performance-talent/reviews | Conduct performance review cycles | hr.performance.read | mixed | No | No | live |
| feedback-360 | 360 Feedback | /hr/performance-talent/360-feedback | Collect multi-source feedback | hr.performance.read | mixed | No | No | not-started |
| talent-reviews | Talent Reviews | /hr/performance-talent/talent-reviews | Assess talent pool strength | hr.talent.read | sensitive | **Yes** (talent) | **Yes** | live |
| succession-planning | Succession Planning | /hr/performance-talent/succession | Identify successors for critical roles | hr.succession.read | sensitive | No | No | not-started |

---

## 9. Employee Relations

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| employee-relations *(section)* | Employee Relations | /hr/employee-relations | Manage workplace issues and policy application | hr.relations.read | sensitive | No | No | planned |
| hr-policies | HR Policies | /hr/employee-relations/policies | View and manage HR policies | hr.policy.read | all | No | No | live |
| grievances-complaints | Grievances & Complaints | /hr/employee-relations/grievances | File and track grievances | hr.relations.read | sensitive | **Yes** (relations) | **Yes** | live |
| disciplinary-actions | Disciplinary Actions | /hr/employee-relations/disciplinary-actions | Manage disciplinary cases | hr.relations.manage | sensitive | **Yes** (relations) | **Yes** | not-started |
| workplace-investigations | Workplace Investigations | /hr/employee-relations/investigations | Conduct workplace investigations | hr.relations.manage | sensitive | **Yes** (relations) | **Yes** | not-started |

---

## 10. Well Being & Engagement

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| wellbeing-engagement *(section)* | Well Being & Engagement | /hr/wellbeing-engagement | Support well being and foster engagement | hr.engagement.read | all | No | No | planned |
| employee-surveys | Employee Surveys | /hr/wellbeing-engagement/surveys | Create and distribute surveys | hr.survey.read | all | No | No | live |
| engagement-programs | Engagement Programs | /hr/wellbeing-engagement/programs | Manage engagement initiatives | hr.engagement.read | all | No | No | live |
| wellbeing-resources | Well being Resources | /hr/wellbeing-engagement/resources | Access wellness programs | hr.engagement.read | all | No | No | not-started |
| recognition-programs | Recognition Programs | /hr/wellbeing-engagement/recognition | Recognize employee achievements | hr.recognition.read | all | No | No | not-started |

---

## 11. HR Analytics & Reporting

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| analytics-reporting *(section)* | HR Analytics & Reporting | /hr/analytics-reporting | Data-driven HR insights and metrics | hr.analytics.read | all | No | No | planned |
| workforce-dashboards | Workforce Dashboards | /hr/analytics-reporting/workforce-dashboards | View workforce metrics and KPIs | hr.analytics.read | all | No | No | live |
| attrition-retention | Attrition & Retention | /hr/analytics-reporting/attrition-retention | Analyze attrition trends | hr.analytics.read | all | No | No | not-started |
| diversity-inclusion | Diversity & Inclusion Metrics | /hr/analytics-reporting/diversity-inclusion | Track diversity KPIs | hr.analytics.read | all | No | No | not-started |
| compliance-reports | Compliance Reports | /hr/analytics-reporting/compliance-reports | Generate compliance reports | hr.analytics.read | all | No | No | live |
| custom-analytics | Custom Analytics | /hr/analytics-reporting/custom-analytics | Build custom analytics queries | hr.analytics.manage | all | No | No | not-started |

---

## 12. Security & Access

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| security-access *(section)* | Security & Access | /hr/security-access | Control access, protect data, ensure auditability | hr.analytics.manage | sensitive | No | No | planned |
| role-based-access | Role-Based Access | /hr/security-access/roles | Manage HR role assignments | hr.analytics.manage | sensitive | No | No | placeholder |
| access-controls | Access Controls | /hr/security-access/access-controls | Configure access policies | hr.analytics.manage | sensitive | No | No | live |
| data-privacy-settings | Data Privacy | /hr/security-access/data-privacy | Manage data privacy settings | hr.analytics.manage | sensitive | No | No | not-started |
| audit-logs | Audit Logs | /hr/security-access/audit-logs | View HR audit trail | hr.analytics.manage | sensitive | No | No | live |
| security-policies | Security Policies | /hr/security-access/security-policies | Define security policies | hr.analytics.manage | sensitive | No | No | not-started |

---

## 13. Compliance

| ID | Label | Route | Purpose | Action | Scope | Masking | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| compliance *(section)* | Compliance | /hr/compliance | Legal, regulatory, and internal policy adherence | hr.compliance.read | all | No | No | planned |
| policy-management | Policy Management | /hr/compliance/policies | Manage compliance policies | hr.compliance.read | all | No | No | not-started |
| incident-reporting | Incident Reporting | /hr/compliance/incidents | Report and track incidents | hr.incident.read | all | No | No | live |
| compliance-management | Compliance Management | /hr/compliance/management | Track compliance obligations | hr.compliance.read | all | No | No | live |
| audit-reporting | Audit & Reporting | /hr/compliance/audit-reporting | Generate audit reports | hr.compliance.read | all | No | No | not-started |
| privacy-access-controls | Data Privacy & Access Controls | /hr/compliance/privacy-access | Manage privacy controls | hr.compliance.manage | sensitive | No | No | not-started |
| risk-management | Risk Management | /hr/compliance/risk-management | Identify and mitigate HR risks | hr.risk.read | sensitive | No | No | live |

---

## Summary Counts

| Metric | Count |
|---|---|
| Sections | 13 |
| Leaf items | 68 |
| Live items | 32 |
| Placeholder items | 1 |
| Not-started items | 35 |
| Items with masking | 15 |
| Items with sensitive-read audit | 10 |
| Unique backend domains | 14 |
| Unique required actions | ~30 |
