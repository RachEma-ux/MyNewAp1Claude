# HR Carbon SideNav — Route Visibility Classification

## Document Status

- **Type:** Visibility model definition
- **Phase:** 0 — Governance-first definition
- **Date:** 2026-03-24
- **Canonical source of truth:** `client/src/config/hrNavConfig.ts`
- **Client-side implementation:** `client/src/lib/hrNavAuth.ts`

---

## 1. Visibility Modes

The HR SideNav defines four visibility modes. Each leaf item and section declares exactly one mode.

| Mode | Behavior | Count |
|---|---|---|
| `show` | Always visible to any authenticated user regardless of HR role | 13 items |
| `hide-if-no-access` | Hidden entirely if the user lacks `requiredAction` | 55 items |
| `show-disabled` | Visible but greyed out / non-interactive if user lacks access | 0 items (reserved) |
| `redirect-to-parent` | Hidden; if accessed directly, redirects to parent section | 0 items (reserved) |

---

## 2. Section-Level Visibility

### Rule

A section is visible if:
1. The user has the section's `requiredAction`, **OR**
2. At least one child item within the section is visible to the user

This prevents empty sections from appearing in the sidebar.

### Implementation

`resolveSectionVisibility()` in `client/src/lib/hrNavAuth.ts` implements this logic. The `HRSectionLandingPage` component uses `useHrRole().can()` to filter child items before rendering.

### Section Visibility by Mode

| Section | Visibility Mode | Required Action | Self-Service? |
|---|---|---|---|
| Workforce Planning & Organization | hide-if-no-access | hr.organization.read | No |
| Talent Acquisition | hide-if-no-access | hr.recruiting.read | No |
| Onboarding & Offboarding | hide-if-no-access | hr.lifecycle.read | No |
| Employee Records & Administration | **show** | hr.directory.read | Yes |
| Compensation & Benefits | hide-if-no-access | hr.compensation.read | No |
| Time & Attendance | **show** | hr.time.read | Yes |
| Learning & Development | **show** | hr.learning.read | Yes |
| Performance & Talent Management | **show** | hr.performance.read | Yes |
| Employee Relations | hide-if-no-access | hr.relations.read | No |
| Well Being & Engagement | **show** | hr.engagement.read | Yes |
| HR Analytics & Reporting | hide-if-no-access | hr.analytics.read | No |
| Security & Access | hide-if-no-access | hr.analytics.manage | No |
| Compliance | hide-if-no-access | hr.compliance.read | No |

**5 sections** use `show` mode — these are self-service sections accessible to all employees.
**8 sections** use `hide-if-no-access` — these are role-restricted sections.

---

## 3. Item-Level Visibility

### Rule

An item's visibility is determined by `resolveItemVisibility()`:

1. Check if user has `item.requiredAction` in their allowed actions
2. Apply `item.visibilityMode`:
   - `show` → always visible
   - `hide-if-no-access` → hidden if action missing
   - `show-disabled` → visible but disabled if action missing
   - `redirect-to-parent` → hidden; route-level redirect handles access

### Self-Service Items (visibilityMode = "show")

These 13 items are always visible to any authenticated HR user, including basic employees:

| Item | Section | Required Action |
|---|---|---|
| employee-profile | Employee Records | hr.directory.read |
| time-tracking | Time & Attendance | hr.time.read |
| leave-management | Time & Attendance | hr.leave.read |
| training-catalog | Learning & Development | hr.learning.read |
| mandatory-training | Learning & Development | hr.learning.read |
| skill-development | Learning & Development | hr.learning.read |
| certifications | Learning & Development | hr.certification.read |
| learning-history | Learning & Development | hr.learning.read |
| goal-setting | Performance & Talent | hr.performance.read |
| performance-reviews | Performance & Talent | hr.performance.read |
| feedback-360 | Performance & Talent | hr.performance.read |
| hr-policies | Employee Relations | hr.policy.read |
| health-insurance | Compensation & Benefits | hr.benefits.read |
| allowances-perks | Compensation & Benefits | hr.benefits.read |
| employee-surveys | Well Being & Engagement | hr.survey.read |
| engagement-programs | Well Being & Engagement | hr.engagement.read |
| wellbeing-resources | Well Being & Engagement | hr.engagement.read |
| recognition-programs | Well Being & Engagement | hr.recognition.read |

Note: Although these are "always visible," the employee role may not have the required action for all of them. Visibility mode `show` means the nav item renders; actual data access still requires the permission.

---

## 4. Mixed Section Behavior

Several sections contain a mix of `show` and `hide-if-no-access` items:

| Section | show items | hide items | Behavior |
|---|---|---|---|
| Employee Records | 1 (employee-profile) | 4 | Section visible to all; employees see profile only; managers see more |
| Compensation & Benefits | 2 (health-insurance, allowances-perks) | 4 | Section visible to all; employees see benefits; HRBP/admin sees salary |
| Time & Attendance | 2 (time-tracking, leave-management) | 2 | Section visible to all; employees see own time/leave; managers see overtime/shifts |
| Learning & Development | 5 (all self-service) | 0 | Fully visible to all employees |
| Performance & Talent | 3 (goals, reviews, 360) | 2 | Section visible to all; talent/succession hidden from non-privileged |
| Employee Relations | 1 (hr-policies) | 3 | Section visible to all via policies; grievances/disciplinary hidden |
| Well Being & Engagement | 4 (all self-service) | 0 | Fully visible to all employees |

This mixed behavior ensures employees always see a meaningful section view while sensitive items remain hidden.

---

## 5. Deferred / Not-Yet-Implemented Items

35 of 68 items have `implementationStatus: "not-started"`. These items:

1. **Are included in visibility calculations** — they render in section landing pages
2. **Render as "Coming soon" cards** — dashed border, reduced opacity, non-clickable
3. **Still declare governance metadata** — their permission, scope, masking, and audit declarations are binding governance commitments
4. **Cannot be navigated to** — no route is mounted for them
5. **Are tracked by drift detection** — changes to their count trigger drift alerts

This means the governance contract for deferred items is established in Phase 0 even though implementation follows later.

---

## 6. Backward-Compatible Flat Routes

### Coexistence Model

Old flat routes (`/hr/directory`, `/hr/compensation`, etc.) coexist with the new hierarchical section routes (`/hr/workforce-planning`, `/hr/employee-records/work-permits`).

### Route Ordering

In `App.tsx`, routes are ordered:
1. **Section landing routes** (lines 283-295) — 13 routes using `HRSectionLandingPage`
2. **Flat page routes** (lines 297-325) — 29 routes using dedicated page components
3. **Phase 4 deep routes** (lines 327-332) — 6 routes under section paths
4. **HR home** (line 333) — `/hr` catch-all

This ordering is critical because wouter uses first-match-wins. Section routes must precede flat routes to prevent a flat `/hr/compliance` from matching before `/hr/compliance/risk-management`.

### Route Aliases

28 backward-compatible route aliases are documented in `client/src/config/hrRouteAliases.ts`. Currently in `"documented"` status — redirect activation is deferred.

### Nav Config `currentRoute` Field

For items where the new hierarchical route differs from the existing flat route, the `currentRoute` field preserves the mapping. Example:
- `salary-structure` has `href: "/hr/compensation-benefits/salary-structure"` but `currentRoute: "/hr/compensation"` — the latter is the currently mounted route.

---

## 7. Role-Based Visibility Profiles

### Employee

Sees: Employee Records (profile only), Time & Attendance (time, leave), Learning (catalog, skills, certifications), Performance (goals, reviews), Well Being (surveys, engagement, all show items), Employee Relations (policies)

Does not see: Workforce Planning, Talent Acquisition, Compensation (except benefits), Security & Access, Analytics, Compliance, any `hide-if-no-access` items requiring elevated roles

### Manager

Sees everything employee sees, plus: Overtime, Shift Planning, Talent Reviews, broader directory access

### HRBP

Sees most items including: Compensation, Employee Relations (grievances, disciplinary), full directory, compliance items

### Admin / Workspace Admin

Sees all 68 items (where implemented). Full access to Security & Access section including audit logs and access controls.

---

## 8. Source of Truth

This document describes the visibility model. The authoritative data lives in:

- **Item visibility modes:** `client/src/config/hrNavConfig.ts` → each item's `visibilityMode` field
- **Visibility resolution logic:** `client/src/lib/hrNavAuth.ts` → `resolveItemVisibility()`, `resolveSectionVisibility()`
- **Section landing page filtering:** `client/src/pages/hr/HRSectionLandingPage.tsx` → role-aware child filtering
- **Route mounting order:** `client/src/App.tsx` → lines 283-333
