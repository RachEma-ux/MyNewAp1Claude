# HR Module — Full Navigation Inventory

> **Source of truth:** `client/src/config/hrNavConfig.ts`
> **Generated:** 2026-03-24
> **Total sections:** 13
> **Total leaf items:** 69
> **Live items:** 31 | **Placeholder:** 1 | **Not-started:** 35 | **Planned:** 0 (leaf level)

---

## Full Hierarchy Diagram

```
HUMAN RESOURCES  (/hr)                                                   [MODULE ROOT]
│
├─── 1. Workforce Planning & Organization  (/hr/workforce-planning)      [SECTION]  planned
│    │
│    ├── Workforce Planning                /hr/workforce-planning/planning             NOT-STARTED
│    ├── Job Architecture & Role Defs      /hr/workforce-planning/job-architecture     LIVE  ← HRJobArchitecturePage
│    ├── Organizational Structure          /hr/workforce-planning/organization         LIVE  ← HROrganizationPage
│    ├── Headcount & Budget Planning       /hr/workforce-planning/headcount-budget     NOT-STARTED
│    ├── Position Management               /hr/workforce-planning/positions            LIVE  ← HRPositionsPage
│    └── Role Definitions                  /hr/role-definitions                        LIVE  ← HRRoleDefinitionsPage  ★ NEW
│
├─── 2. Talent Acquisition  (/hr/talent-acquisition)                     [SECTION]  planned
│    │
│    ├── Recruitment Requests              /hr/talent-acquisition/requests             LIVE  ← HRRecruitmentPage
│    ├── Job Posting & Sourcing            /hr/talent-acquisition/job-posting          NOT-STARTED
│    ├── Candidate Pipeline                /hr/talent-acquisition/pipeline             NOT-STARTED
│    ├── Interview Management              /hr/talent-acquisition/interviews           NOT-STARTED
│    ├── Offer Management                  /hr/talent-acquisition/offers               NOT-STARTED
│    └── Pre boarding                      /hr/talent-acquisition/pre-boarding         NOT-STARTED
│
├─── 3. Onboarding & Offboarding  (/hr/lifecycle)                        [SECTION]  planned
│    │
│    ├── Onboarding / New Hire Checklist   /hr/lifecycle/onboarding/checklist          LIVE  ← HROnboardingPage
│    ├── Onboarding / Document Collection  /hr/lifecycle/onboarding/documents          NOT-STARTED
│    ├── Onboarding / Equipment & Access   /hr/lifecycle/onboarding/access-setup       NOT-STARTED
│    ├── Onboarding / Orientation & Train  /hr/lifecycle/onboarding/orientation-training  NOT-STARTED
│    ├── Offboarding / Resign & Terminatn  /hr/lifecycle/offboarding/termination       LIVE  ← HROffboardingPage
│    ├── Offboarding / Knowledge Transfer  /hr/lifecycle/offboarding/knowledge-transfer  NOT-STARTED
│    ├── Offboarding / Exit Interview      /hr/lifecycle/offboarding/exit-interview    NOT-STARTED
│    └── Offboarding / Access Removal      /hr/lifecycle/offboarding/access-removal    NOT-STARTED
│
├─── 4. Employee Records & Administration  (/hr/employee-records)        [SECTION]  planned
│    │
│    ├── Employee Profile                  /hr/employee-records/profile                LIVE  ← HRDirectoryPage
│    ├── Contracts & Documents             /hr/employee-records/contracts-documents    NOT-STARTED
│    ├── Employment Changes                /hr/employee-records/employment-changes     NOT-STARTED
│    ├── Work Permits & Compliance         /hr/employee-records/work-permits           LIVE  ← HRWorkPermitsPage
│    └── HR Letters & Certificates         /hr/employee-records/letters-certificates   LIVE  ← HRLettersCertificatesPage
│
├─── 5. Compensation & Benefits  (/hr/compensation-benefits)             [SECTION]  planned
│    │
│    ├── Compensation / Salary Structure   /hr/compensation-benefits/salary-structure  LIVE  ← HRCompensationPage
│    ├── Compensation / Annual Salary Rev  /hr/compensation-benefits/salary-review     NOT-STARTED
│    ├── Compensation / Bonus & Incentives /hr/compensation-benefits/bonus-incentives  NOT-STARTED
│    ├── Benefits / Health & Insurance     /hr/compensation-benefits/health-insurance  LIVE  ← HRBenefitsPage
│    ├── Benefits / Pension & Retirement   /hr/compensation-benefits/pension-retirement  NOT-STARTED
│    └── Benefits / Allowances & Perks     /hr/compensation-benefits/allowances-perks  NOT-STARTED
│
├─── 6. Time & Attendance  (/hr/time-attendance)                         [SECTION]  planned
│    │
│    ├── Time Tracking                     /hr/time-attendance/time-tracking           LIVE  ← HRTimesheetPage
│    ├── Absence & Leave Management        /hr/time-attendance/leave-management        LIVE  ← HRLeavePage
│    ├── Overtime Requests                 /hr/time-attendance/overtime                LIVE  ← HROvertimePage
│    └── Shift Planning                    /hr/time-attendance/shifts                  LIVE  ← HRShiftPlanningPage
│
├─── 7. Learning & Development  (/hr/learning-development)               [SECTION]  planned
│    │
│    ├── Training Catalog                  /hr/learning-development/catalog            LIVE  ← HRTrainingPage
│    ├── Mandatory Training                /hr/learning-development/mandatory          NOT-STARTED
│    ├── Skill Development                 /hr/learning-development/skills             LIVE  ← HRSkillsPage
│    ├── Certifications                    /hr/learning-development/certifications     LIVE  ← HRCertificationsPage
│    └── Learning History                  /hr/learning-development/history            NOT-STARTED
│
├─── 8. Performance & Talent Mgmt  (/hr/performance-talent)              [SECTION]  planned
│    │
│    ├── Goal Setting                      /hr/performance-talent/goals               LIVE  ← HRGoalsPage
│    ├── Performance Reviews               /hr/performance-talent/reviews              LIVE  ← HRPerformanceReviewsPage
│    ├── 360 Feedback                      /hr/performance-talent/360-feedback         NOT-STARTED
│    ├── Talent Reviews                    /hr/performance-talent/talent-reviews       LIVE  ← HRTalentPage
│    └── Succession Planning               /hr/performance-talent/succession           NOT-STARTED
│
├─── 9. Employee Relations  (/hr/employee-relations)                     [SECTION]  planned
│    │
│    ├── HR Policies                       /hr/employee-relations/policies             LIVE  ← HRPoliciesPage
│    ├── Grievances & Complaints           /hr/employee-relations/grievances           LIVE  ← HRGrievancesPage
│    ├── Disciplinary Actions              /hr/employee-relations/disciplinary-actions NOT-STARTED
│    └── Workplace Investigations          /hr/employee-relations/investigations       NOT-STARTED
│
├─── 10. Well Being & Engagement  (/hr/wellbeing-engagement)             [SECTION]  planned
│    │
│    ├── Employee Surveys                  /hr/wellbeing-engagement/surveys            LIVE  ← HRSurveysPage
│    ├── Engagement Programs               /hr/wellbeing-engagement/programs           LIVE  ← HREngagementPage
│    ├── Well being Resources              /hr/wellbeing-engagement/resources          NOT-STARTED
│    └── Recognition Programs              /hr/wellbeing-engagement/recognition        NOT-STARTED
│
├─── 11. HR Analytics & Reporting  (/hr/analytics-reporting)             [SECTION]  planned
│    │
│    ├── Workforce Dashboards              /hr/analytics-reporting/workforce-dashboards  LIVE  ← HRAnalyticsDashboardPage
│    ├── Attrition & Retention             /hr/analytics-reporting/attrition-retention NOT-STARTED
│    ├── Diversity & Inclusion Metrics     /hr/analytics-reporting/diversity-inclusion NOT-STARTED
│    ├── Compliance Reports                /hr/analytics-reporting/compliance-reports  LIVE  ← HRReportsPage
│    └── Custom Analytics                  /hr/analytics-reporting/custom-analytics    NOT-STARTED
│
├─── 12. Security & Access  (/hr/security-access)                        [SECTION]  planned
│    │
│    ├── Role-Based Access                 /hr/security-access/roles                  PLACEHOLDER ← HRSettingsPage
│    ├── Access Controls                   /hr/security-access/access-controls        LIVE  ← HRAccessControlsPage
│    ├── Data Privacy                      /hr/security-access/data-privacy           NOT-STARTED
│    ├── Audit Logs                        /hr/security-access/audit-logs             LIVE  ← HRAuditLogsPage
│    └── Security Policies                 /hr/security-access/security-policies      NOT-STARTED
│
└─── 13. Compliance  (/hr/compliance)                                    [SECTION]  planned
     │
     ├── Policy Management                 /hr/compliance/policies                    NOT-STARTED
     ├── Incident Reporting                /hr/compliance/incidents                   LIVE  ← HRIncidentsPage
     ├── Compliance Management             /hr/compliance/management                  LIVE  ← HRComplianceMgmtPage
     ├── Audit & Reporting                 /hr/compliance/audit-reporting             NOT-STARTED
     ├── Data Privacy & Access Controls    /hr/compliance/privacy-access              NOT-STARTED
     └── Risk Management                   /hr/compliance/risk-management             LIVE  ← HRRiskManagementPage
```

---

## Inventory Table — All 69 Leaf Items

### Legend

| Symbol | Meaning |
|--------|---------|
| LIVE | Page exists and is functional |
| PLACEHOLDER | Page exists but content is partial/stub |
| NOT-STARTED | No page — future work |
| `S` | Sensitive scope |
| `M` | Mixed scope |
| `A` | All scope |
| `self` | Self scope |
| `mask` | Field masking required |
| `audit` | Sensitive-read audit logging |

### 1. Workforce Planning & Organization (6 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | workforce-planning-core | Workforce Planning | NOT-STARTED | A | not-yet-implemented | — | — |
| 2 | job-architecture | Job Architecture & Role Definitions | LIVE | A | existing-page | HRJobArchitecturePage | — |
| 3 | org-structure | Organizational Structure | LIVE | A | existing-page | HROrganizationPage | — |
| 4 | headcount-budget | Headcount & Budget Planning | NOT-STARTED | A | not-yet-implemented | — | — |
| 5 | position-management | Position Management | LIVE | A | existing-page | HRPositionsPage | — |
| 6 | role-definitions | Role Definitions | LIVE | A | existing-page | HRRoleDefinitionsPage | mask, audit |

### 2. Talent Acquisition (6 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | recruitment-requests | Recruitment Requests | LIVE | A | existing-page | HRRecruitmentPage | — |
| 2 | job-posting-sourcing | Job Posting & Sourcing | NOT-STARTED | A | not-yet-implemented | — | — |
| 3 | candidate-pipeline | Candidate Pipeline | NOT-STARTED | A | not-yet-implemented | — | — |
| 4 | interview-management | Interview Management | NOT-STARTED | A | not-yet-implemented | — | — |
| 5 | offer-management | Offer Management | NOT-STARTED | S | not-yet-implemented | — | — |
| 6 | pre-boarding | Pre boarding | NOT-STARTED | A | not-yet-implemented | — | — |

### 3. Onboarding & Offboarding (8 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | onboarding-checklist | Onboarding / New Hire Checklist | LIVE | M | existing-page | HROnboardingPage | — |
| 2 | onboarding-documents | Onboarding / Document Collection | NOT-STARTED | A | not-yet-implemented | — | — |
| 3 | onboarding-access | Onboarding / Equipment & Access Setup | NOT-STARTED | A | not-yet-implemented | — | — |
| 4 | onboarding-orientation | Onboarding / Orientation & Training | NOT-STARTED | M | not-yet-implemented | — | — |
| 5 | offboarding-termination | Offboarding / Resignation & Termination | LIVE | S | existing-page | HROffboardingPage | — |
| 6 | offboarding-knowledge-transfer | Offboarding / Knowledge Transfer | NOT-STARTED | A | not-yet-implemented | — | — |
| 7 | offboarding-exit-interview | Offboarding / Exit Interview | NOT-STARTED | S | not-yet-implemented | — | — |
| 8 | offboarding-access-removal | Offboarding / Access Removal | NOT-STARTED | A | not-yet-implemented | — | — |

### 4. Employee Records & Administration (5 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | employee-profile | Employee Profile | LIVE | M | existing-page | HRDirectoryPage | mask |
| 2 | contracts-documents | Contracts & Documents | NOT-STARTED | M | not-yet-implemented | — | mask |
| 3 | employment-changes | Employment Changes | NOT-STARTED | A | not-yet-implemented | — | mask |
| 4 | work-permits-compliance | Work Permits & Compliance | LIVE | S | existing-page | HRWorkPermitsPage | — |
| 5 | hr-letters-certificates | HR Letters & Certificates | LIVE | M | existing-page | HRLettersCertificatesPage | mask |

### 5. Compensation & Benefits (6 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | salary-structure | Compensation / Salary Structure | LIVE | S | existing-page | HRCompensationPage | mask, audit |
| 2 | annual-salary-review | Compensation / Annual Salary Review | NOT-STARTED | S | not-yet-implemented | — | mask, audit |
| 3 | bonus-incentives | Compensation / Bonus & Incentives | NOT-STARTED | S | not-yet-implemented | — | mask, audit |
| 4 | health-insurance | Benefits / Health & Insurance Plans | LIVE | M | existing-page | HRBenefitsPage | mask, audit |
| 5 | pension-retirement | Benefits / Pension & Retirement | NOT-STARTED | S | not-yet-implemented | — | mask, audit |
| 6 | allowances-perks | Benefits / Allowances & Perks | NOT-STARTED | M | not-yet-implemented | — | mask, audit |

### 6. Time & Attendance (4 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | time-tracking | Time Tracking | LIVE | self | existing-page | HRTimesheetPage | — |
| 2 | leave-management | Absence & Leave Management | LIVE | self | existing-page | HRLeavePage | — |
| 3 | overtime-requests | Overtime Requests | LIVE | M | existing-page | HROvertimePage | — |
| 4 | shift-planning | Shift Planning | LIVE | A | existing-page | HRShiftPlanningPage | — |

### 7. Learning & Development (5 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | training-catalog | Training Catalog | LIVE | self | existing-page | HRTrainingPage | — |
| 2 | mandatory-training | Mandatory Training | NOT-STARTED | M | not-yet-implemented | — | — |
| 3 | skill-development | Skill Development | LIVE | M | existing-page | HRSkillsPage | — |
| 4 | certifications | Certifications | LIVE | M | existing-page | HRCertificationsPage | — |
| 5 | learning-history | Learning History | NOT-STARTED | self | not-yet-implemented | — | — |

### 8. Performance & Talent Management (5 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | goal-setting | Goal Setting | LIVE | self | existing-page | HRGoalsPage | — |
| 2 | performance-reviews | Performance Reviews | LIVE | M | existing-page | HRPerformanceReviewsPage | — |
| 3 | feedback-360 | 360 Feedback | NOT-STARTED | M | not-yet-implemented | — | — |
| 4 | talent-reviews | Talent Reviews | LIVE | S | existing-page | HRTalentPage | mask, audit |
| 5 | succession-planning | Succession Planning | NOT-STARTED | S | not-yet-implemented | — | — |

### 9. Employee Relations (4 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | hr-policies | HR Policies | LIVE | A | existing-page | HRPoliciesPage | — |
| 2 | grievances-complaints | Grievances & Complaints | LIVE | S | existing-page | HRGrievancesPage | mask, audit |
| 3 | disciplinary-actions | Disciplinary Actions | NOT-STARTED | S | not-yet-implemented | — | mask, audit |
| 4 | workplace-investigations | Workplace Investigations | NOT-STARTED | S | not-yet-implemented | — | mask, audit |

### 10. Well Being & Engagement (4 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | employee-surveys | Employee Surveys | LIVE | A | existing-page | HRSurveysPage | — |
| 2 | engagement-programs | Engagement Programs | LIVE | A | existing-page | HREngagementPage | — |
| 3 | wellbeing-resources | Well being Resources | NOT-STARTED | A | not-yet-implemented | — | — |
| 4 | recognition-programs | Recognition Programs | NOT-STARTED | A | not-yet-implemented | — | — |

### 11. HR Analytics & Reporting (5 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | workforce-dashboards | Workforce Dashboards | LIVE | A | existing-page | HRAnalyticsDashboardPage | — |
| 2 | attrition-retention | Attrition & Retention | NOT-STARTED | A | not-yet-implemented | — | — |
| 3 | diversity-inclusion | Diversity & Inclusion Metrics | NOT-STARTED | A | not-yet-implemented | — | — |
| 4 | compliance-reports | Compliance Reports | LIVE | A | existing-page | HRReportsPage | — |
| 5 | custom-analytics | Custom Analytics | NOT-STARTED | A | not-yet-implemented | — | — |

### 12. Security & Access (5 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | role-based-access | Role-Based Access | PLACEHOLDER | S | tab-in-existing-page | HRSettingsPage | — |
| 2 | access-controls | Access Controls | LIVE | S | existing-page | HRAccessControlsPage | — |
| 3 | data-privacy-settings | Data Privacy | NOT-STARTED | S | not-yet-implemented | — | — |
| 4 | audit-logs | Audit Logs | LIVE | S | existing-page | HRAuditLogsPage | — |
| 5 | security-policies | Security Policies | NOT-STARTED | S | not-yet-implemented | — | — |

### 13. Compliance (6 items)

| # | ID | Label | Status | Scope | Backed By | Component | Governance |
|---|-----|-------|--------|-------|-----------|-----------|------------|
| 1 | policy-management | Policy Management | NOT-STARTED | A | not-yet-implemented | — | — |
| 2 | incident-reporting | Incident Reporting | LIVE | A | existing-page | HRIncidentsPage | — |
| 3 | compliance-management | Compliance Management | LIVE | A | existing-page | HRComplianceMgmtPage | — |
| 4 | audit-reporting | Audit & Reporting | NOT-STARTED | A | not-yet-implemented | — | — |
| 5 | privacy-access-controls | Data Privacy & Access Controls | NOT-STARTED | S | not-yet-implemented | — | — |
| 6 | risk-management | Risk Management | LIVE | S | existing-page | HRRiskManagementPage | — |

---

## Summary Statistics

```
STATUS BREAKDOWN                          BACKED-BY BREAKDOWN
──────────────                            ───────────────────
  LIVE           31  (44.9%)                existing-page          30  (43.5%)
  PLACEHOLDER     1  ( 1.4%)                tab-in-existing-page    1  ( 1.4%)
  NOT-STARTED    37  (53.6%)                not-yet-implemented    38  (55.1%)
  PLANNED         0  ( 0.0%)                new-page                0  ( 0.0%)
  ─────────────────                         ─────────────────────
  TOTAL          69                         TOTAL                  69

SCOPE BREAKDOWN                           GOVERNANCE FLAGS
───────────────                           ────────────────
  all            33  (47.8%)                masking required   14  (20.3%)
  mixed          15  (21.7%)                sensitive audit    11  (15.9%)
  sensitive      14  (20.3%)                scope actions       7  (10.1%)
  self            7  (10.1%)
  ─────────────────
  TOTAL          69

SECTION COMPLETION (live+placeholder / total)
──────────────────────────────────────────────
  1. Workforce Planning        4/6   ████████████░░░░  67%
  2. Talent Acquisition        1/6   ██░░░░░░░░░░░░░░  17%
  3. Onboarding & Offboarding  2/8   ████░░░░░░░░░░░░  25%
  4. Employee Records          3/5   █████████░░░░░░░░  60%
  5. Compensation & Benefits   2/6   █████░░░░░░░░░░░░  33%
  6. Time & Attendance         4/4   ████████████████  100%  ★ COMPLETE
  7. Learning & Development    3/5   █████████░░░░░░░░  60%
  8. Performance & Talent      3/5   █████████░░░░░░░░  60%
  9. Employee Relations        2/4   ████████░░░░░░░░  50%
  10. Wellbeing & Engagement   2/4   ████████░░░░░░░░  50%
  11. Analytics & Reporting    2/5   ██████░░░░░░░░░░░  40%
  12. Security & Access        3/5   █████████░░░░░░░░  60%
  13. Compliance               3/6   ████████░░░░░░░░  50%
```

---

## Carbon Dropdown Visibility Projection

Items that will appear in the sidebar dropdown (status = `live` or `placeholder`):

```
▾ Human Resources                                                     32 visible items
│
├─▾ Workforce Planning & Organization                                 4 items
│   ├── Job Architecture & Role Definitions   → /hr/workforce-planning/job-architecture
│   ├── Organizational Structure              → /hr/organization
│   ├── Position Management                   → /hr/positions
│   └── Role Definitions                      → /hr/role-definitions        ★ NEW
│
├─▾ Talent Acquisition                                                1 item
│   └── Recruitment Requests                  → /hr/recruitment
│
├─▾ Onboarding & Offboarding                                         2 items
│   ├── Onboarding / New Hire Checklist       → /hr/onboarding
│   └── Offboarding / Resign & Termination    → /hr/offboarding
│
├─▾ Employee Records & Administration                                 3 items
│   ├── Employee Profile                      → /hr/directory
│   ├── Work Permits & Compliance             → /hr/employee-records/work-permits
│   └── HR Letters & Certificates             → /hr/employee-records/letters-certificates
│
├─▾ Compensation & Benefits                                           2 items
│   ├── Compensation / Salary Structure       → /hr/compensation
│   └── Benefits / Health & Insurance Plans   → /hr/benefits
│
├─▾ Time & Attendance                                                 4 items  ★ COMPLETE
│   ├── Time Tracking                         → /hr/timesheet
│   ├── Absence & Leave Management            → /hr/leave
│   ├── Overtime Requests                     → /hr/overtime
│   └── Shift Planning                        → /hr/shifts
│
├─▾ Learning & Development                                            3 items
│   ├── Training Catalog                      → /hr/training
│   ├── Skill Development                     → /hr/skills
│   └── Certifications                        → /hr/certifications
│
├─▾ Performance & Talent Management                                   3 items
│   ├── Goal Setting                          → /hr/goals
│   ├── Performance Reviews                   → /hr/reviews
│   └── Talent Reviews                        → /hr/talent
│
├─▾ Employee Relations                                                2 items
│   ├── HR Policies                           → /hr/policies
│   └── Grievances & Complaints               → /hr/grievances
│
├─▾ Well Being & Engagement                                           2 items
│   ├── Employee Surveys                      → /hr/surveys
│   └── Engagement Programs                   → /hr/engagement
│
├─▾ HR Analytics & Reporting                                          2 items
│   ├── Workforce Dashboards                  → /hr/analytics
│   └── Compliance Reports                    → /hr/reports
│
├─▾ Security & Access                                                 3 items
│   ├── Role-Based Access (Preview)           → /hr/settings
│   ├── Access Controls                       → /hr/security-access/access-controls
│   └── Audit Logs                            → /hr/security-access/audit-logs
│
└─▾ Compliance                                                        3 items
    ├── Incident Reporting                    → /hr/incidents
    ├── Compliance Management                 → /hr/compliance-mgmt
    └── Risk Management                       → /hr/compliance/risk-management
```
