# HR Module — Control Surface

## Overview

The HR module's control surface is defined by the canonical nav config (`client/src/config/hrNavConfig.ts`) and enforced by the backend permission model (`server/hr/permissions.ts`). The Carbon SideNav renders only items the current user's role permits.

## Section-Level Surface (13 sections)

| # | Section ID | Label | Scope | Visibility | Backend Domain | Status |
|---|---|---|---|---|---|---|
| 1 | workforce-planning | Workforce Planning & Organization | all | hide-if-no-access | organization | planned |
| 2 | talent-acquisition | Talent Acquisition | all | hide-if-no-access | recruiting | planned |
| 3 | onboarding-offboarding | Onboarding & Offboarding | all | hide-if-no-access | lifecycle | planned |
| 4 | employee-records | Employee Records & Administration | mixed | show | directory | planned |
| 5 | compensation-benefits | Compensation & Benefits | sensitive | hide-if-no-access | compensation | planned |
| 6 | time-attendance | Time & Attendance | mixed | show | time | planned |
| 7 | learning-development | Learning & Development | mixed | show | learning | planned |
| 8 | performance-talent | Performance & Talent Management | mixed | show | performance | planned |
| 9 | employee-relations | Employee Relations | sensitive | hide-if-no-access | relations | planned |
| 10 | wellbeing-engagement | Well Being & Engagement | all | show | engagement | planned |
| 11 | analytics-reporting | HR Analytics & Reporting | all | hide-if-no-access | analytics | planned |
| 12 | security-access | Security & Access | sensitive | hide-if-no-access | analytics | planned |
| 13 | compliance | Compliance | all | hide-if-no-access | compliance | planned |

Note: Section-level `implementationStatus` is "planned" because sections are grouping containers. The individual leaf items within have their own live/not-started status.

## Item-Level Implementation Breakdown

| Status | Count | Description |
|---|---|---|
| **live** | 33 | Backed by existing page + backend router |
| **placeholder** | 1 | UI shell exists, backend partial (role-based-access) |
| **not-started** | 35 | Nav config entry only, no page or backend yet |

## Scope Model

The HR module uses 5 scope types, enforced by `resolveDataScope()`:

| Scope | Meaning | Enforcement |
|---|---|---|
| `self` | Employee sees own data only | `resolveDataScope` returns `{ scope: "self", workerId }` |
| `team` | Manager sees direct reports + self | `resolveDataScope` returns `{ scope: "team", workerIds }` |
| `all` | HRBP/admin sees all records | `resolveDataScope` returns `{ scope: "all" }` |
| `sensitive` | Restricted data requiring elevated permission | `checkHrAccess` with `sensitiveAction` parameter |
| `mixed` | Combines self/team/all based on role | Backend determines actual scope at runtime |

### Items by Scope Type

| Scope | Count | Examples |
|---|---|---|
| self | 4 | time-tracking, leave-management, training-catalog, goal-setting |
| team | 0 | (team scope used at backend level, not declared at nav item level) |
| all | 23 | org-structure, position-management, hr-policies, analytics, compliance |
| sensitive | 13 | compensation, relations, offboarding, talent-reviews, investigations |
| mixed | 11 | employee-profile, onboarding-checklist, performance-reviews |

## Masking Surface

Field masking is applied by 8 masking functions in `server/hr/permissions.ts`:

| Masking Function | Field Set | Masked Fields |
|---|---|---|
| `maskDirectoryFields` | directory | primaryPhone, notes, costCenter, legalEntity |
| `maskCompensationFields` | compensation | baseSalary, amount, budgetPercent, employerContribution, employeeContribution |
| `maskRelationsFields` | relations | description, resolutionNotes, findings, recommendation, appealNotes |
| `maskTalentFields` | talent | retentionRisk, developmentAreas, developmentNeeds, nineBoxPosition, readinessForPromotion |
| `maskPerformanceFields` | performance | managerNotes, managerComments, overallComments, developmentPlan |
| `maskIncidentFields` | incident | description, rootCause, correctiveAction, investigationNotes |
| `maskWorkPermitFields` | work-permit | permitNumber, issuingAuthority, notes |
| `maskRoleDefRestrictedFields` | role-def | compensationNotes, successionNotes, restructuringNotes, sensitivityNotes, complianceNotes, sodConstraints |
| `maskRoleDefManagerFields` | role-def-manager | directReportsScope, escalationTriggers |

### Items Requiring Masking (from nav config)

| Item | Masking Field Set | Sensitive Action |
|---|---|---|
| employee-profile | directory | — (scope-gated) |
| contracts-documents | directory | — |
| employment-changes | directory | — |
| hr-letters-certificates | directory | — |
| salary-structure | compensation | hr.compensation.read.sensitive |
| annual-salary-review | compensation | hr.compensation.read.sensitive |
| bonus-incentives | compensation | hr.compensation.read.sensitive |
| health-insurance | compensation | hr.compensation.read.sensitive |
| pension-retirement | compensation | hr.compensation.read.sensitive |
| allowances-perks | compensation | hr.compensation.read.sensitive |
| grievances-complaints | relations | hr.relations.read.sensitive |
| disciplinary-actions | relations | hr.relations.read.sensitive |
| workplace-investigations | relations | hr.relations.read.sensitive |
| talent-reviews | talent | hr.talent.write |
| role-definitions | — (custom) | hr.roledef.read.restricted |

## Sensitive-Read Audit Surface

Items that trigger sensitive-read audit logging when accessed:

- salary-structure, annual-salary-review, bonus-incentives, health-insurance, pension-retirement, allowances-perks (compensation)
- grievances-complaints, disciplinary-actions, workplace-investigations (relations)
- talent-reviews (talent)
- role-definitions (role-def)

## Access-Sensitive Areas

| Area | Required Action | Risk Level |
|---|---|---|
| Compensation data | `hr.compensation.read.sensitive` | High — salary/benefit exposure |
| Employee relations | `hr.relations.read.sensitive` | High — grievance/investigation details |
| Talent reviews | `hr.talent.read` + masking | High — retention risk, 9-box position |
| Role definitions (restricted) | `hr.roledef.read.restricted` | Medium — compensation/succession notes |
| Offboarding | `hr.offboarding.manage` | Medium — termination details |
| Audit logs | `hr.analytics.manage` | Medium — system access trail |
| Work permits | `hr.compliance.read` | Medium — personal legal documents |

## Deferred Areas (not-started items)

35 nav config items have `implementationStatus: "not-started"`. These are documented in the nav config but have no backing page or backend endpoint. They are:

- Workforce planning core, headcount & budget
- Job posting & sourcing, candidate pipeline, interview management, offer management, pre-boarding
- Onboarding documents, equipment/access setup, orientation/training
- Offboarding knowledge transfer, exit interview, access removal
- Contracts & documents, employment changes
- Annual salary review, bonus & incentives, pension & retirement, allowances & perks
- Mandatory training, learning history
- 360 feedback, succession planning
- Disciplinary actions, workplace investigations
- Well-being resources, recognition programs
- Attrition & retention, diversity & inclusion, custom analytics
- Policy management (compliance), audit & reporting, data privacy & access controls, security policies
- Data privacy settings

These deferred items are visible in the nav config for planning purposes but are filtered out of the sidebar rendering (only `live` and `placeholder` items are shown).
