# HR Navigation Architecture — Governance Document

## Document Status

- **Type:** Governance-first navigation and capability mapping
- **Module:** Human Resources
- **Phase:** Phase 4 — Post Backend Expansion
- **Canonical source:** `client/src/config/hrNavConfig.ts`
- **Route aliases:** `client/src/config/hrRouteAliases.ts`
- **Authorization helpers:** `client/src/lib/hrNavAuth.ts`
- **Last updated:** 2026-03-24

---

## 1. Target HR SideNav Structure

The HR module adopts an IBM Carbon-friendly SideNav with **13 purpose-driven sections** and **68 leaf items**.

### Section Summary

| # | Section ID | Label | Leaf Count | Purpose |
|---|---|---|---|---|
| 1 | workforce-planning | Workforce Planning & Organization | 5 | Strategic workforce needs, org design, role structures |
| 2 | talent-acquisition | Talent Acquisition | 6 | Attract, source, evaluate, and hire talent |
| 3 | onboarding-offboarding | Onboarding & Offboarding | 8 | Smooth transitions into and out of the organization |
| 4 | employee-records | Employee Records & Administration | 5 | Accurate, compliant employee data management |
| 5 | compensation-benefits | Compensation & Benefits | 6 | Compensation, benefits, and rewards management |
| 6 | time-attendance | Time & Attendance | 4 | Working hours, absences, and schedule tracking |
| 7 | learning-development | Learning & Development | 5 | Skills, career growth, and compliance training |
| 8 | performance-talent | Performance & Talent Management | 5 | Goals, performance evaluation, talent development |
| 9 | employee-relations | Employee Relations | 4 | Workplace issues, fairness, policy application |
| 10 | wellbeing-engagement | Well Being & Engagement | 4 | Employee well being and workplace culture |
| 11 | analytics-reporting | HR Analytics & Reporting | 5 | Dashboards, metrics, data-driven HR decisions |
| 12 | security-access | Security & Access | 5 | System access, data protection, auditability |
| 13 | compliance | Compliance | 6 | Legal, regulatory, and internal policy adherence |

**Total leaf items:** 68

---

## 2. Nav-to-Capability Mapping

### Implementation Status Summary

| Category | Count | Percentage |
|---|---|---|
| existing-page | 32 | 47% |
| tab-in-existing-page | 1 | 1% |
| new-page | 0 | 0% |
| not-yet-implemented | 35 | 52% |

### Detailed Mapping by Section

#### 2.1 Workforce Planning & Organization

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| workforce-planning-core | Workforce Planning | not-yet-implemented | — | organization | not-started |
| job-architecture | Job Architecture & Role Definitions | existing-page | /hr/workforce-planning/job-architecture | organization | live |
| org-structure | Organizational Structure | existing-page | /hr/organization | organization | live |
| headcount-budget | Headcount & Budget Planning | not-yet-implemented | — | organization | not-started |
| position-management | Position Management | existing-page | /hr/positions | staffing | live |

#### 2.2 Talent Acquisition

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| recruitment-requests | Recruitment Requests | existing-page | /hr/recruitment | recruiting | live |
| job-posting-sourcing | Job Posting & Sourcing | not-yet-implemented | — | recruiting | not-started |
| candidate-pipeline | Candidate Pipeline | not-yet-implemented | — | recruiting | not-started |
| interview-management | Interview Management | not-yet-implemented | — | recruiting | not-started |
| offer-management | Offer Management | not-yet-implemented | — | recruiting | not-started |
| pre-boarding | Pre boarding | not-yet-implemented | — | lifecycle | not-started |

#### 2.3 Onboarding & Offboarding

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| onboarding-checklist | New Hire Checklist | existing-page | /hr/onboarding | lifecycle | live |
| onboarding-documents | Document Collection | not-yet-implemented | — | lifecycle | not-started |
| onboarding-access | Equipment & Access Setup | not-yet-implemented | — | lifecycle | not-started |
| onboarding-orientation | Orientation & Training | not-yet-implemented | — | lifecycle | not-started |
| offboarding-termination | Resignation & Termination | existing-page | /hr/offboarding | lifecycle | live |
| offboarding-knowledge-transfer | Knowledge Transfer | not-yet-implemented | — | lifecycle | not-started |
| offboarding-exit-interview | Exit Interview | not-yet-implemented | — | lifecycle | not-started |
| offboarding-access-removal | Access Removal | not-yet-implemented | — | lifecycle | not-started |

#### 2.4 Employee Records & Administration

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| employee-profile | Employee Profile | existing-page | /hr/directory | directory | live |
| contracts-documents | Contracts & Documents | not-yet-implemented | — | directory | not-started |
| employment-changes | Employment Changes | not-yet-implemented | — | directory | not-started |
| work-permits-compliance | Work Permits & Compliance | existing-page | /hr/employee-records/work-permits | compliance | live |
| hr-letters-certificates | HR Letters & Certificates | existing-page | /hr/employee-records/letters-certificates | directory | live |

#### 2.5 Compensation & Benefits

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| salary-structure | Salary Structure | existing-page | /hr/compensation | compensation | live |
| annual-salary-review | Annual Salary Review | not-yet-implemented | — | compensation | not-started |
| bonus-incentives | Bonus & Incentives | not-yet-implemented | — | compensation | not-started |
| health-insurance | Health & Insurance Plans | existing-page | /hr/benefits | compensation | live |
| pension-retirement | Pension & Retirement | not-yet-implemented | — | compensation | not-started |
| allowances-perks | Allowances & Perks | not-yet-implemented | — | compensation | not-started |

#### 2.6 Time & Attendance

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| time-tracking | Time Tracking | existing-page | /hr/timesheet | time | live |
| leave-management | Absence & Leave Management | existing-page | /hr/leave | time | live |
| overtime-requests | Overtime Requests | existing-page | /hr/overtime | time | live |
| shift-planning | Shift Planning | existing-page | /hr/shifts | time | live |

#### 2.7 Learning & Development

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| training-catalog | Training Catalog | existing-page | /hr/training | learning | live |
| mandatory-training | Mandatory Training | not-yet-implemented | — | learning | not-started |
| skill-development | Skill Development | existing-page | /hr/skills | staffing | live |
| certifications | Certifications | existing-page | /hr/certifications | learning | live |
| learning-history | Learning History | not-yet-implemented | — | learning | not-started |

#### 2.8 Performance & Talent Management

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| goal-setting | Goal Setting | existing-page | /hr/goals | performance | live |
| performance-reviews | Performance Reviews | existing-page | /hr/reviews | performance | live |
| feedback-360 | 360 Feedback | not-yet-implemented | — | performance | not-started |
| talent-reviews | Talent Reviews | existing-page | /hr/talent | talent | live |
| succession-planning | Succession Planning | not-yet-implemented | — | talent | not-started |

#### 2.9 Employee Relations

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| hr-policies | HR Policies | existing-page | /hr/policies | relations | live |
| grievances-complaints | Grievances & Complaints | existing-page | /hr/grievances | relations | live |
| disciplinary-actions | Disciplinary Actions | not-yet-implemented | — | relations | not-started |
| workplace-investigations | Workplace Investigations | not-yet-implemented | — | relations | not-started |

#### 2.10 Well Being & Engagement

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| employee-surveys | Employee Surveys | existing-page | /hr/surveys | engagement | live |
| engagement-programs | Engagement Programs | existing-page | /hr/engagement | engagement | live |
| wellbeing-resources | Well being Resources | not-yet-implemented | — | engagement | not-started |
| recognition-programs | Recognition Programs | not-yet-implemented | — | engagement | not-started |

#### 2.11 HR Analytics & Reporting

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| workforce-dashboards | Workforce Dashboards | existing-page | /hr/analytics | analytics | live |
| attrition-retention | Attrition & Retention | not-yet-implemented | — | analytics | not-started |
| diversity-inclusion | Diversity & Inclusion Metrics | not-yet-implemented | — | analytics | not-started |
| compliance-reports | Compliance Reports | existing-page | /hr/reports | analytics | live |
| custom-analytics | Custom Analytics | not-yet-implemented | — | analytics | not-started |

#### 2.12 Security & Access

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| role-based-access | Role-Based Access | tab-in-existing-page | /hr/settings | analytics | placeholder |
| access-controls | Access Controls | existing-page | /hr/security-access/access-controls | analytics | live |
| data-privacy-settings | Data Privacy | not-yet-implemented | — | compliance | not-started |
| audit-logs | Audit Logs | existing-page | /hr/security-access/audit-logs | analytics | live |
| security-policies | Security Policies | not-yet-implemented | — | compliance | not-started |

#### 2.13 Compliance

| Item ID | Label | Backed By | Current Route | Backend Domain | Status |
|---|---|---|---|---|---|
| policy-management | Policy Management | not-yet-implemented | — | compliance | not-started |
| incident-reporting | Incident Reporting | existing-page | /hr/incidents | compliance | live |
| compliance-management | Compliance Management | existing-page | /hr/compliance-mgmt | compliance | live |
| audit-reporting | Audit & Reporting | not-yet-implemented | — | compliance | not-started |
| privacy-access-controls | Data Privacy & Access Controls | not-yet-implemented | — | compliance | not-started |
| risk-management | Risk Management | existing-page | /hr/compliance/risk-management | compliance | live |

---

## 3. Route Visibility Model

Each nav item declares a `visibilityMode` controlling how it appears when the user lacks access:

| Mode | Behavior |
|---|---|
| `show` | Always visible to all authenticated users |
| `hide-if-no-access` | Hidden from sidebar if the user's HR role lacks `requiredAction` |
| `show-disabled` | Visible but grayed out / non-clickable if access denied |
| `redirect-to-parent` | If accessed directly, redirects to the parent section landing |

### Self-Service Items (visibilityMode: show)

These items are always visible because they support employee self-service:

- Employee Profile (directory)
- Time Tracking (timesheet)
- Absence & Leave Management
- Training Catalog
- Skill Development
- Certifications
- Goal Setting
- Performance Reviews
- HR Policies
- Employee Surveys
- Engagement Programs
- Health & Insurance Plans
- Allowances & Perks

### Gated Items (visibilityMode: hide-if-no-access)

These items require specific HR permissions and are hidden from users without access. Examples include all compensation management, relations management, compliance, analytics, security, and administrative functions.

---

## 4. Required Action Model

Every nav item maps to an HR permission action from `server/hr/permissions.ts`. The canonical action list:

| Action | Used By |
|---|---|
| hr.directory.read | Employee Profile, Employee Records section |
| hr.directory.write | Employment Changes |
| hr.organization.read | Org Structure, Workforce Planning section, Job Architecture |
| hr.organization.write | Headcount & Budget Planning |
| hr.staffing.read | Position Management |
| hr.recruiting.read | Recruitment Requests, Candidate Pipeline, Interview Management |
| hr.recruiting.write | Job Posting & Sourcing |
| hr.recruiting.manage | Offer Management |
| hr.lifecycle.read | Onboarding & Offboarding section |
| hr.onboarding.read | Onboarding items, Pre-boarding |
| hr.onboarding.manage | Document Collection, Equipment & Access, Orientation |
| hr.offboarding.read | Offboarding / Termination |
| hr.offboarding.manage | Knowledge Transfer, Exit Interview, Access Removal |
| hr.compensation.read | Salary Structure, Compensation section |
| hr.compensation.manage | Annual Salary Review, Bonus & Incentives |
| hr.benefits.read | Health & Insurance, Pension, Allowances |
| hr.time.read | Time & Attendance section, Time Tracking |
| hr.leave.read | Leave Management |
| hr.overtime.read | Overtime Requests |
| hr.shift.read | Shift Planning |
| hr.learning.read | Learning & Development section, Training, Mandatory Training |
| hr.certification.read | Certifications |
| hr.performance.read | Performance section, Goal Setting, Reviews, 360 Feedback |
| hr.talent.read | Talent Reviews |
| hr.succession.read | Succession Planning |
| hr.relations.read | Employee Relations section, Grievances |
| hr.relations.manage | Disciplinary Actions, Investigations |
| hr.policy.read | HR Policies |
| hr.engagement.read | Well Being & Engagement section |
| hr.survey.read | Employee Surveys |
| hr.recognition.read | Recognition Programs |
| hr.analytics.read | Analytics section, Workforce Dashboards, Compliance Reports |
| hr.analytics.manage | Custom Analytics, Security & Access section, Audit Logs |
| hr.compliance.read | Compliance section, Policy Management, Compliance Management |
| hr.compliance.manage | Data Privacy & Access Controls |
| hr.incident.read | Incident Reporting |
| hr.risk.read | Risk Management |

---

## 5. Scope Model

Each nav item declares a `scopeType` indicating the data visibility scope:

| Scope | Meaning |
|---|---|
| `self` | User sees only their own data (e.g., timesheet, goals, leave) |
| `team` | Manager sees direct reports (e.g., team time, team performance) |
| `all` | HRBP/admin sees all records (e.g., org structure, analytics) |
| `sensitive` | Restricted data requiring elevated permissions (e.g., compensation, grievances, investigations) |
| `mixed` | Scope varies by user role — employee sees self, manager sees team, HRBP sees all |

### Sensitive Leaf Classification

The following leaves are classified as `sensitive` scope, meaning they contain data that requires elevated access and audit logging:

- Offer Management
- Offboarding / Resignation & Termination
- Offboarding / Exit Interview
- Work Permits & Compliance
- Salary Structure
- Annual Salary Review
- Bonus & Incentives
- Pension & Retirement
- Grievances & Complaints
- Disciplinary Actions
- Workplace Investigations
- Talent Reviews
- Succession Planning
- Role-Based Access
- Access Controls
- Data Privacy
- Audit Logs
- Security Policies
- Data Privacy & Access Controls
- Risk Management

---

## 6. Backend Domain Mapping

The 13 nav sections map to **10 backend domains** (broad router groups). The backend is NOT refactored to mirror the nav tree 1:1.

| Backend Domain | Router Path | Nav Sections Served |
|---|---|---|
| directory | server/hr/directory/ | Employee Records |
| organization | server/hr/organization/ | Workforce Planning |
| staffing | server/hr/staffing/ | Workforce Planning (positions), Learning (skills) |
| recruiting | server/hr/recruiting/ | Talent Acquisition |
| lifecycle | server/hr/lifecycle/ | Onboarding & Offboarding, Talent Acquisition (pre-boarding) |
| time | server/hr/time/ | Time & Attendance |
| learning | server/hr/learning/ | Learning & Development |
| performance | server/hr/performance/ | Performance & Talent Management |
| compensation | server/hr/compensation/ | Compensation & Benefits |
| relations | server/hr/relations/ | Employee Relations |
| engagement | server/hr/engagement/ | Well Being & Engagement |
| compliance | server/hr/compliance/ | Compliance, Employee Records (work permits), Security (privacy) |
| analytics | server/hr/analytics/ | HR Analytics & Reporting, Security & Access |
| talent | server/hr/talent/ | Performance & Talent Management (talent reviews, succession) |

**Key principle:** Backend routers remain organized by broad HR domains. The frontend nav hierarchy does NOT require backend restructuring.

---

## 7. Backward Compatibility Strategy

### Current Routes (29 flat paths)

All current `/hr/*` routes remain mounted in `App.tsx` and continue to work unchanged.

### Route Alias Map

`client/src/config/hrRouteAliases.ts` documents the mapping from each current flat route to its canonical target route in the new hierarchy. All 28 current routes with existing pages are mapped.

### Migration Strategy (Phase 2+)

1. New hierarchical routes will be added alongside existing flat routes
2. Old flat routes will be converted to `<Redirect>` components pointing to new canonical paths
3. Redirect status will be changed from `"documented"` to `"active-redirect"` in `hrRouteAliases.ts`
4. After a deprecation period, old route entries can be removed

### No Routes Broken in Phase 1

Phase 1 does NOT:
- Remove any existing routes
- Change any existing route paths
- Modify any existing page component imports
- Alter the current sidebar rendering

---

## 8. Open Gaps for Future Phases

### Items requiring new backend capabilities (Phase 2+)

- Workforce Planning (strategic demand/supply modeling)
- Job Architecture (job family/level management UI)
- Headcount & Budget Planning (budget allocation)
- Job Posting & Sourcing (external job board integration)
- Candidate Pipeline (ATS workflow)
- Interview Management (scheduling/evaluation)
- Offer Management (offer letter generation)
- Pre-boarding (pre-hire task management)
- Onboarding document collection, equipment/access, orientation
- Offboarding knowledge transfer, exit interview, access removal
- Contracts & Documents management
- Employment Changes tracking
- Work Permits & Compliance tracking
- HR Letters & Certificates generation
- Annual Salary Review cycles
- Bonus & Incentives programs
- Pension & Retirement plans
- Allowances & Perks management
- Mandatory Training tracking
- Learning History records
- 360 Feedback collection
- Succession Planning
- Disciplinary Actions management
- Workplace Investigations
- Well being Resources
- Recognition Programs
- Attrition & Retention analytics
- Diversity & Inclusion metrics
- Custom Analytics builder
- Access Controls configuration
- Data Privacy settings
- Audit Logs viewer
- Security Policies management
- Policy Management (compliance)
- Audit & Reporting (compliance)
- Data Privacy & Access Controls (compliance)
- Risk Management

### Items that map to existing pages (no new work needed)

26 items already have backing pages and backend routers. These are live and functional.

### Items that could be tabs in existing pages

1 item (Role-Based Access → tab in HRSettingsPage)

---

## 9. Governance Compliance Notes

### Changes to governance surface

This nav restructuring introduces:
- A formal 13-section information architecture for HR
- Explicit scope classification for every leaf item
- Explicit required-action mapping for every leaf item
- Explicit sensitive-data leaf classification
- A documented backward compatibility strategy

### No governance violations

- No new backend capabilities added
- No permission model changes
- No scope model changes
- No database schema changes
- No existing route breakage
- Backend routers remain organized by broad domain

### Required governance reviews for Phase 2+

When new leaf capabilities are implemented, each must pass:
1. Permission action assignment review
2. Scope classification review
3. Sensitive data handling audit
4. Audit logging coverage verification
5. Field masking policy enforcement

---

## 10. Phase 3 — Field Masking & Audit Metadata

Phase 3 adds masking, audit, and scope resolution metadata to every nav item that interacts with backend field masking or sensitive-read audit logging.

### New HrNavItem Fields (Phase 3)

| Field | Type | Purpose |
|---|---|---|
| `maskingRequired` | `boolean?` | Whether backend applies field masking to responses |
| `maskingFieldSet` | `"directory" \| "compensation" \| "relations" \| "talent"?` | Which masking function set is applied |
| `sensitiveReadAudit` | `boolean?` | Whether reads trigger `logSensitiveRead()` audit entries |
| `sensitiveAction` | `string?` | Elevated permission action that grants unmasked access |
| `scopeActions` | `{ global?, team?, self? }?` | Scope resolution actions for `resolveDataScope()` |

### Items with Field Masking

| Item ID | Masking Field Set | Sensitive Read Audit | Sensitive Action |
|---|---|---|---|
| employee-profile | directory | No | — |
| contracts-documents | directory | — | — |
| employment-changes | directory | — | — |
| hr-letters-certificates | directory | — | — |
| salary-structure | compensation | Yes | hr.compensation.read.sensitive |
| annual-salary-review | compensation | Yes | hr.compensation.read.sensitive |
| bonus-incentives | compensation | Yes | hr.compensation.read.sensitive |
| health-insurance | compensation | Yes | hr.compensation.read.sensitive |
| pension-retirement | compensation | Yes | hr.compensation.read.sensitive |
| allowances-perks | compensation | Yes | hr.compensation.read.sensitive |
| grievances-complaints | relations | Yes | hr.relations.read.sensitive |
| disciplinary-actions | relations | Yes | hr.relations.read.sensitive |
| workplace-investigations | relations | Yes | hr.relations.read.sensitive |
| talent-reviews | talent | Yes | hr.talent.write |

### Items with Scope Resolution Actions

These items declare `scopeActions` matching the backend's `resolveDataScope()` calls:

| Item ID | Global Action | Team Action | Self Action |
|---|---|---|---|
| employee-profile | hr.directory.read | hr.directory.read.team | hr.directory.read.self |
| time-tracking | hr.time.read | hr.time.read.team | hr.time.read.self |
| leave-management | hr.leave.read | — | hr.leave.read.self |
| training-catalog | hr.learning.read | — | hr.learning.read.self |
| goal-setting | hr.performance.read | — | hr.performance.read.self |
| performance-reviews | hr.performance.read | — | hr.performance.read.self |

### Backend Masking Functions (from server/hr/permissions.ts)

| Function | Fields Masked | Used By |
|---|---|---|
| `maskDirectoryFields()` | primaryPhone, notes, costCenter, legalEntity | Directory router |
| `maskCompensationFields()` | baseSalary, amount, budgetPercent, employerContribution, employeeContribution | Compensation router |
| `maskRelationsFields()` | description, resolutionNotes, findings, recommendation, appealNotes | Relations router |
| `maskTalentFields()` | retentionRisk, developmentAreas, developmentNeeds, nineBoxPosition, readinessForPromotion | Talent router |

---

## 11. Phase 3 — Client-Side Authorization Helper

`client/src/lib/hrNavAuth.ts` provides reusable pure functions for nav visibility and scope resolution. No backend calls — operates on the nav config + user's allowed actions.

### Key Functions

| Function | Purpose |
|---|---|
| `resolveItemVisibility(item, actions)` | Determine if an item is visible/disabled for a user |
| `resolveSectionVisibility(section, actions)` | Determine if a section should appear |
| `getVisibleSections(actions)` | Get all sections with their visible items |
| `getVisibleItemsForSection(sectionId, actions)` | Get visible items in a section |
| `canAccessRoute(href, actions)` | Check if a user can access a route path |
| `wouldSeeMaskedData(item, actions)` | Check if user would see masked fields |
| `getMaskedItemsForUser(actions)` | Get all accessible items with masked fields |
| `getUnmaskedItemsForUser(actions)` | Get all items with full data access |
| `resolveClientScope(item, actions)` | Determine client-side scope (all/team/self/none) |
| `getSectionAccessSummaries(actions)` | Per-section access summary for dashboards |
| `getItemScopeInfo(item)` | Detailed scope/masking info for an item |

### Visibility Mode Enforcement

| Mode | `resolveItemVisibility` Behavior |
|---|---|
| `show` | Always returns `{ visible: true, disabled: false }` |
| `hide-if-no-access` | Hidden if user lacks `requiredAction` |
| `show-disabled` | Visible but disabled if user lacks access |
| `redirect-to-parent` | Hidden (redirect handled at route level) |

### Scope Resolution (Client-Side)

`resolveClientScope()` mirrors the server's `resolveDataScope()` logic:

1. If user has the `global` action → scope is `"all"`
2. If user has the `team` action → scope is `"team"`
3. If user has the `self` action → scope is `"self"`
4. Otherwise → scope is `"none"`

### Masking Determination

`wouldSeeMaskedData()` returns `true` when:
- Item has `maskingRequired: true`
- Item declares a `sensitiveAction`
- User does NOT have the `sensitiveAction` in their allowed actions

This enables UI indicators like "Some fields are restricted" on pages where the user sees masked data.

---

## 12. Role → Effective Access Summary

Based on the HR_ROLE_PERMISSIONS matrix and the nav config:

### Employee
- **Visible sections:** Employee Records, Time & Attendance, Learning & Development, Performance (self), Well Being & Engagement, HR Policies
- **Scope:** Self only (own profile, own timesheet, own goals, own leave)
- **Masking:** Directory fields masked, compensation not accessible, relations not accessible, talent not accessible

### Manager
- **Visible sections:** Employee Records (team), Time & Attendance (team), Learning, Performance (team), Well Being, Talent Reviews (read only, masked)
- **Scope:** Team + self (direct reports)
- **Masking:** Directory fields masked, talent fields masked (no TALENT_WRITE)

### HRBP
- **Visible sections:** All 13 sections
- **Scope:** All (organization-wide)
- **Masking:** Unmasked for compensation (has COMPENSATION_READ_SENSITIVE), unmasked for relations (has RELATIONS_READ_SENSITIVE), unmasked for talent (has TALENT_WRITE)

### Admin / Workspace Admin
- **Visible sections:** All 13 sections
- **Scope:** All
- **Masking:** Fully unmasked (has all actions)
