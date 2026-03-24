# HR Carbon SideNav — Permission Map

## Document Status

- **Type:** Permission-to-navigation mapping
- **Phase:** 0 — Governance-first definition
- **Date:** 2026-03-24
- **Canonical source of truth:** `client/src/config/hrNavConfig.ts` (nav items), `server/hr/permissions.ts` (roles and actions)

---

## 1. Permission Model Overview

Every leaf item in the HR SideNav declares a `requiredAction` field that maps to an `HR_ACTIONS` constant. Access is granted if the user's HR role includes that action in `HR_ROLE_PERMISSIONS`.

**Pattern:** `hr.<domain>.<operation>[.<scope>]`

Examples: `hr.directory.read`, `hr.compensation.read.sensitive`, `hr.time.read.self`

---

## 2. Action-to-Section Mapping

| Required Action | Sections Using It | Item Count |
|---|---|---|
| hr.organization.read | Workforce Planning | 4 |
| hr.organization.write | Workforce Planning | 1 |
| hr.staffing.read | Workforce Planning | 1 |
| hr.recruiting.read | Talent Acquisition | 4 |
| hr.recruiting.write | Talent Acquisition | 1 |
| hr.recruiting.manage | Talent Acquisition | 1 |
| hr.onboarding.read | Talent Acquisition, Onboarding | 2 |
| hr.onboarding.manage | Onboarding | 3 |
| hr.lifecycle.read | Onboarding (section) | 1 |
| hr.offboarding.read | Onboarding | 1 |
| hr.offboarding.manage | Onboarding | 3 |
| hr.directory.read | Employee Records | 4 |
| hr.directory.write | Employee Records | 1 |
| hr.compliance.read | Employee Records, Compliance | 4 |
| hr.compliance.manage | Compliance | 1 |
| hr.compensation.read | Compensation | 2 |
| hr.compensation.manage | Compensation | 2 |
| hr.benefits.read | Compensation | 3 |
| hr.time.read | Time & Attendance | 2 |
| hr.leave.read | Time & Attendance | 1 |
| hr.overtime.read | Time & Attendance | 1 |
| hr.shift.read | Time & Attendance | 1 |
| hr.learning.read | Learning & Development | 4 |
| hr.certification.read | Learning & Development | 1 |
| hr.performance.read | Performance & Talent | 4 |
| hr.talent.read | Performance & Talent | 1 |
| hr.succession.read | Performance & Talent | 1 |
| hr.policy.read | Employee Relations | 1 |
| hr.relations.read | Employee Relations | 2 |
| hr.relations.manage | Employee Relations | 2 |
| hr.survey.read | Well Being & Engagement | 1 |
| hr.engagement.read | Well Being & Engagement | 3 |
| hr.recognition.read | Well Being & Engagement | 1 |
| hr.analytics.read | Analytics & Reporting | 5 |
| hr.analytics.manage | Analytics, Security & Access | 6 |
| hr.incident.read | Compliance | 1 |
| hr.risk.read | Compliance | 1 |

---

## 3. Role-to-Action Coverage

### Employee Role

Has these actions: `hr.directory.read.self`, `hr.time.read.self`, `hr.time.write`, `hr.leave.read.self`, `hr.leave.write`, `hr.learning.read.self`, `hr.certification.read`, `hr.performance.read.self`, `hr.benefits.read`, `hr.policy.read`, `hr.engagement.read`, `hr.survey.read`, `hr.recognition.read`

**Nav items accessible:** ~13 self-service items (all `visibilityMode: "show"` items where the employee has the action or a `.self` variant)

### Manager Role

Adds: `hr.directory.read.team`, `hr.time.read.team`, `hr.time.approve`, `hr.leave.read`, `hr.leave.approve`, `hr.overtime.read`, `hr.overtime.approve`, `hr.shift.read`, `hr.learning.read`, `hr.performance.read`, `hr.performance.write`, `hr.talent.read`, `hr.recognition.write`

**Nav items accessible:** Employee items + overtime, shifts, talent reviews, broader directory/time

### HRBP Role

Adds: `hr.directory.read`, `hr.directory.write`, `hr.organization.read`, `hr.staffing.read`, `hr.recruiting.read`, `hr.lifecycle.read`, `hr.onboarding.read`, `hr.offboarding.read`, `hr.compensation.read`, `hr.relations.read`, `hr.relations.read.sensitive`, `hr.compliance.read`, `hr.analytics.read`, full performance suite

**Nav items accessible:** Most items except admin-only Security & Access section

### Admin / Workspace Admin Role

Has all actions including: `hr.analytics.manage`, `hr.compensation.manage`, `hr.relations.manage`, `hr.compliance.manage`, `hr.recruiting.manage`, `hr.onboarding.manage`, `hr.offboarding.manage`, `hr.succession.read`

**Nav items accessible:** All 68 items (where implemented)

---

## 4. Sensitive Permission Actions

These elevated actions grant access to masked/restricted data:

| Sensitive Action | Grants | Used By Items |
|---|---|---|
| hr.compensation.read.sensitive | Unmasked compensation data (baseSalary, amount, budgetPercent) | salary-structure, annual-salary-review, bonus-incentives, health-insurance, pension-retirement, allowances-perks |
| hr.relations.read.sensitive | Unmasked relations data (description, resolutionNotes, findings) | grievances-complaints, disciplinary-actions, workplace-investigations |
| hr.talent.write | Unmasked talent data (retentionRisk, nineBoxPosition, readinessForPromotion) | talent-reviews |

---

## 5. Access Promise

The permission map establishes these governance commitments:

1. **No employee can see compensation data without `hr.compensation.read`** — section is `hide-if-no-access`
2. **No employee can see grievance/investigation records without `hr.relations.read`** — section is `hide-if-no-access`, items use sensitive masking
3. **No non-admin can access Security & Access** — all 5 items require `hr.analytics.manage`
4. **Self-service items are permission-gated at the data level** — nav items render via `show` mode but backend `resolveDataScope()` narrows data to self/team
5. **All permission actions exist in `HR_ACTIONS` constant** — verified by compliance tests

---

## 6. Source of Truth

- **Nav-level permissions:** `client/src/config/hrNavConfig.ts` → each item's `requiredAction`
- **Role-permission matrix:** `server/hr/permissions.ts` → `HR_ROLE_PERMISSIONS`
- **Action constants:** `server/hr/permissions.ts` → `HR_ACTIONS`
- **Client-side checks:** `client/src/lib/hrNavAuth.ts` → `resolveItemVisibility()`, `canAccessRoute()`
- **Backend enforcement:** `server/hr/permissions.ts` → `requireHrPermission()`, `checkHrAccess()`
